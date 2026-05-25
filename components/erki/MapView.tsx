'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
    Plus, Map as MapIcon, Download, Upload, Move, Palette, PenLine, Eraser,
    Image as ImageIcon, Type, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { Plan, Station, LogoOverlay, LabelOverlay } from '@/lib/types';
import { cn } from '@/lib/utils';
import { exportLageplanPDF } from '@/lib/pdfExport';
import { computeBubbleSlots, type BlockedZone } from '@/lib/bubbleLayoutMath';
import {
    clientToPercent,
    deriveContainerHeight,
    distributeColors,
    resolveColorConflicts,
} from '@/lib/mapInteractions';
import type { PresenceUserLike } from '@/lib/realtime/presenceUtils';
import PresenceStack from '@/components/erki/PresenceStack';
import { supabase } from '@/lib/supabase';

// Duenner Adapter um die reine Mathematik in lib/bubbleLayoutMath.ts:
// rechnet Stations-Prozentkoordinaten in Pixel um, baut Sperrzonen-Rechtecke
// fuer Logo/Label und schreibt das Ergebnis zurueck als Prozentwerte.
// (Algorithmus & Spezifikation: siehe lib/bubbleLayoutMath.ts)
function computeAutoLayout(
    stations: Station[],
    containerWidth: number,
    containerHeight: number,
    logoOverlay?: LogoOverlay,
    labelOverlay?: LabelOverlay,
): Station[] {
    if (stations.length === 0 || containerWidth === 0 || containerHeight === 0) return stations;

    const mapScale = containerWidth / 800;
    const bubbleRadius = 48 * mapScale;
    const blockedZones: BlockedZone[] = [];
    if (logoOverlay) {
        // Logo: Rendering ist quadratisch (size in % der Breite, Hoehe ~ 0.4 * Breite).
        // Originale Sperrzonen-Polsterung: bubbleRadius rundherum (passt zu Modul-Default).
        blockedZones.push({
            x: logoOverlay.x,
            y: logoOverlay.y,
            width: logoOverlay.size,
            height: logoOverlay.size * 0.4,
        });
    }
    if (labelOverlay) {
        // Label-Bounding-Box approximieren (font-bold uppercase tracking-widest).
        // Original-Polsterung war asymmetrisch (rechts/oben/unten = 1.5 * bubbleRadius,
        // links = bubbleRadius). Modul polstert uniform mit bubbleRadius -> Rechteck
        // pre-erweitern, damit das Endergebnis identisch zum alten Verhalten ist.
        const renderedFontSize = labelOverlay.fontSize * mapScale;
        const approxWPx = labelOverlay.text.length * renderedFontSize * 1.0;
        const approxHPx = renderedFontSize * 1.6;
        const extra = bubbleRadius * 0.5; // 1.5*r minus 1*r
        const yPx = (labelOverlay.y / 100) * containerHeight - extra;
        blockedZones.push({
            x: labelOverlay.x,
            y: (yPx / containerHeight) * 100,
            width: ((approxWPx + extra) / containerWidth) * 100,
            height: ((approxHPx + 2 * extra) / containerWidth) * 100,
        });
    }

    const markers = stations.map(s => ({
        id: s.id,
        x: (s.targetX / 100) * containerWidth,
        y: (s.targetY / 100) * containerHeight,
    }));
    const slots = computeBubbleSlots({
        markers,
        containerWidth,
        containerHeight,
        blockedZones,
    });

    return stations.map(s => {
        const slot = slots[s.id];
        if (!slot) return s;
        return {
            ...s,
            x: Math.max(0, Math.min(100, (slot.x / containerWidth) * 100)),
            y: Math.max(0, Math.min(100, (slot.y / containerHeight) * 100)),
        };
    });
}

const ZOOM_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];

interface MapViewProps {
    activePlan: Plan;
    updateActivePlan: (updates: Partial<Plan>) => void;
    onAddStation: () => void;
    onlineUsers?: PresenceUserLike[];
    currentUser?: PresenceUserLike;
}

export default function MapView({ activePlan, updateActivePlan, onAddStation, onlineUsers, currentUser }: MapViewProps) {
    // ── Map-eigener State (zuvor in ErkiApp) ──────────────────────────────────
    const [aspectRatio, setAspectRatio] = useState<'portrait' | 'landscape'>('landscape');
    const [draggedItem, setDraggedItem] = useState<{ id: string; type: 'bubble' | 'target' } | null>(null);
    const [draggingOverlay, setDraggingOverlay] = useState<'logo' | 'label' | 'logo-resize' | 'label-resize' | null>(null);
    const [editingLabel, setEditingLabel] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const overlayDragStart = useRef<{ mouseX: number; mouseY: number; elemX: number; elemY: number; size?: number; fontSize?: number } | null>(null);
    const [maskDrawing, setMaskDrawing] = useState(false);
    const [currentMaskPoints, setCurrentMaskPoints] = useState<{ x: number; y: number }[]>([]);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const mapScale = containerWidth > 0 ? containerWidth / 800 : 1;

    const currentZoom = activePlan.bgZoom ?? 1;
    const zoomIn  = () => { const next = ZOOM_STEPS.find(z => z > currentZoom); if (next) updateActivePlan({ bgZoom: next }); };
    const zoomOut = () => { const prev = [...ZOOM_STEPS].reverse().find(z => z < currentZoom); if (prev) updateActivePlan({ bgZoom: prev }); };

    // Aspect-Ratio aus dem Hintergrundbild ableiten
    useEffect(() => {
        if (activePlan.backgroundImage) {
            const img = new Image();
            img.onload = () => {
                setAspectRatio(img.width >= img.height ? 'landscape' : 'portrait');
            };
            img.src = activePlan.backgroundImage;
        }
    }, [activePlan.backgroundImage]);

    // Escape bricht Masken-Zeichnen ab
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelMaskDrawing(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [maskDrawing]);

    // Bild aus Zwischenablage als Hintergrund einfügen.
    // (MapView ist nur gemountet, wenn activeTab === 'map' — der ehemalige
    // explizite activeTab-Check entfällt damit.)
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
            if (!item) return;
            const file = item.getAsFile();
            if (!file) return;
            void uploadLageplan(file, activePlan.id);
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    // updateActivePlan ist im Parent stabil genug fuer dieses Verhalten;
    // identisch zur alten Inline-Implementierung mit deps [activePlan, activeTab].
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Container-Breite messen (responsive Bubble-Skalierung).
    // Beim Mount ist die Breite häufig 0 (Layout noch nicht gestrichen);
    // ein zusätzlicher Re-Measure nach 50ms holt das verlässlich nach —
    // entspricht dem alten "Re-measure when switching back to map tab"-Hack.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            setContainerWidth(entries[0].contentRect.width);
        });
        ro.observe(el);
        const initialWidth = el.getBoundingClientRect().width;
        setContainerWidth(initialWidth);
        const t = setTimeout(() => {
            const w = containerRef.current?.getBoundingClientRect().width ?? 0;
            if (w > 0) setContainerWidth(w);
        }, 50);
        return () => { ro.disconnect(); clearTimeout(t); };
    }, []);

    // ── Handler ───────────────────────────────────────────────────────────────
    const uploadLageplan = async (file: File, planId: string) => {
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${planId}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage
            .from('lageplan')
            .upload(path, file, { upsert: true, contentType: file.type });
        if (error) {
            console.error('[Lageplan] Upload fehlgeschlagen:', error);
            alert('Bild konnte nicht hochgeladen werden: ' + error.message);
            return;
        }
        const { data } = supabase.storage.from('lageplan').getPublicUrl(path);
        updateActivePlan({ backgroundImage: data.publicUrl });
    };

    const updateStation = (id: string, updates: Partial<Station>) => {
        updateActivePlan({
            stations: activePlan.stations.map(s => s.id === id ? { ...s, ...updates } : s),
        });
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const stations = [...activePlan.stations];
        // Wenn viele Stationen am Default 50/50 hängen: gleichmäßig verteilen
        const needsDistribution = stations.filter(s => s.targetX === 50 && s.targetY === 50).length > 2;
        if (needsDistribution) {
            stations.forEach((s, i) => {
                const side = i % 4;
                const step = (Math.floor(i / 4) * 15) % 80;
                if (side === 0) { s.x = 10 + step; s.y = 5; }
                else if (side === 1) { s.x = 95; s.y = 10 + step; }
                else if (side === 2) { s.x = 90 - step; s.y = 95; }
                else if (side === 3) { s.x = 5; s.y = 90 - step; }
                s.targetX = 40 + (i % 3) * 10;
                s.targetY = 40 + (Math.floor(i / 3) * 10) % 20;
            });
            updateActivePlan({ stations });
        }
        void uploadLageplan(file, activePlan.id);
    };

    const handleAutoLayout = () => {
        if (containerWidth === 0) return;
        const containerHeight = deriveContainerHeight(containerWidth, aspectRatio);
        const updated = computeAutoLayout(
            activePlan.stations,
            containerWidth,
            containerHeight,
            activePlan.logoOverlay,
            activePlan.labelOverlay,
        );
        updateActivePlan({ stations: updated });
    };

    const handleDistributeColors = () => {
        updateActivePlan({ stations: distributeColors(activePlan.stations) });
    };

    const exportToPDF = async () => {
        // Label-Editor schließen, damit der Resize-Handle und das Range-Input
        // im PDF-Export nicht mit auftauchen (alte Reihenfolge bleibt erhalten).
        setEditingLabel(false);
        setIsExporting(true);
        try {
            await exportLageplanPDF({
                backgroundImage: activePlan.backgroundImage,
                bgZoom: activePlan.bgZoom,
                masks: activePlan.masks,
                stations: activePlan.stations,
                logoOverlay: activePlan.logoOverlay,
                labelOverlay: activePlan.labelOverlay,
                title: activePlan.title,
                aspectRatio,
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!draggedItem || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const { x, y } = clientToPercent(e.clientX, e.clientY, rect);
        if (draggedItem.type === 'bubble') {
            updateStation(draggedItem.id, { x, y });
        } else {
            updateStation(draggedItem.id, { targetX: x, targetY: y });
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!draggedItem || !containerRef.current) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = containerRef.current.getBoundingClientRect();
        const { x, y } = clientToPercent(touch.clientX, touch.clientY, rect);
        if (draggedItem.type === 'bubble') {
            updateStation(draggedItem.id, { x, y });
        } else {
            updateStation(draggedItem.id, { targetX: x, targetY: y });
        }
    };

    const handleMouseUp = () => {
        if (draggedItem) {
            if (draggedItem.type === 'target') {
                const updated = resolveColorConflicts(draggedItem.id, activePlan.stations);
                updateActivePlan({ stations: updated });
            }
        }
        setDraggedItem(null);
    };

    const getMapCoords = (e: React.MouseEvent) => {
        if (!containerRef.current) return null;
        return clientToPercent(e.clientX, e.clientY, containerRef.current.getBoundingClientRect());
    };

    const handleMapClick = (e: React.MouseEvent) => {
        if (!maskDrawing) return;
        const pos = getMapCoords(e);
        if (!pos) return;
        setCurrentMaskPoints(prev => [...prev, pos]);
    };

    const handleMapDoubleClick = (e: React.MouseEvent) => {
        if (!maskDrawing || currentMaskPoints.length < 3) return;
        e.preventDefault();
        const masks = [...(activePlan.masks || []), { points: currentMaskPoints }];
        updateActivePlan({ masks });
        setCurrentMaskPoints([]);
        setMaskDrawing(false);
        setCursorPos(null);
    };

    const handleMaskMouseMove = (e: React.MouseEvent) => {
        if (!maskDrawing) return;
        setCursorPos(getMapCoords(e));
    };

    const cancelMaskDrawing = () => {
        setMaskDrawing(false);
        setCurrentMaskPoints([]);
        setCursorPos(null);
    };

    const clearMasks = () => {
        updateActivePlan({ masks: [] });
    };

    // ── Overlay-Drag-Helpers ──────────────────────────────────────────────────
    const startOverlayDrag = (
        type: 'logo' | 'label' | 'logo-resize' | 'label-resize',
        clientX: number,
        clientY: number,
    ) => {
        const logo = activePlan.logoOverlay;
        const label = activePlan.labelOverlay;
        overlayDragStart.current = {
            mouseX: clientX,
            mouseY: clientY,
            elemX: (type === 'label' || type === 'label-resize') ? (label?.x ?? 5) : (logo?.x ?? 5),
            elemY: (type === 'label' || type === 'label-resize') ? (label?.y ?? 5) : (logo?.y ?? 5),
            size: logo?.size,
            fontSize: label?.fontSize,
        };
        setDraggingOverlay(type);
    };

    const handleOverlayMouseMove = (clientX: number, clientY: number) => {
        if (!draggingOverlay || !overlayDragStart.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const dx = ((clientX - overlayDragStart.current.mouseX) / rect.width) * 100;
        const dy = ((clientY - overlayDragStart.current.mouseY) / rect.height) * 100;

        const dxPx = clientX - overlayDragStart.current.mouseX;

        if (draggingOverlay === 'logo-resize') {
            const newSize = Math.max(5, Math.min(60, (overlayDragStart.current.size ?? 20) + dx));
            updateActivePlan({ logoOverlay: { ...(activePlan.logoOverlay ?? { x: 5, y: 5, size: 20 }), size: newSize } });
        } else if (draggingOverlay === 'logo') {
            updateActivePlan({ logoOverlay: { ...(activePlan.logoOverlay ?? { x: 5, y: 5, size: 20 }), x: overlayDragStart.current.elemX + dx, y: overlayDragStart.current.elemY + dy } });
        } else if (draggingOverlay === 'label') {
            updateActivePlan({ labelOverlay: { ...(activePlan.labelOverlay ?? { x: 5, y: 5, text: 'LAGEPLAN', fontSize: 24 }), x: overlayDragStart.current.elemX + dx, y: overlayDragStart.current.elemY + dy } });
        } else if (draggingOverlay === 'label-resize') {
            const newFontSize = Math.max(10, Math.min(120, (overlayDragStart.current.fontSize ?? 24) + dxPx * 0.3));
            updateActivePlan({ labelOverlay: { ...(activePlan.labelOverlay ?? { x: 5, y: 5, text: 'LAGEPLAN', fontSize: 24 }), fontSize: newFontSize } });
        }
    };

    const stopOverlayDrag = () => {
        setDraggingOverlay(null);
        overlayDragStart.current = null;
    };

    const addLogoOverlay = () => {
        if (activePlan.logoOverlay) return;
        updateActivePlan({ logoOverlay: { x: 5, y: 5, size: 20 } });
    };

    const addLabelOverlay = () => {
        if (activePlan.labelOverlay) return;
        updateActivePlan({ labelOverlay: { x: 5, y: 12, text: 'LAGEPLAN', fontSize: 24 } });
    };

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="absolute top-3 right-3 z-40 flex flex-wrap gap-2 justify-end items-center max-w-[calc(100%-1.5rem)]">
                {onlineUsers && currentUser && (
                    <PresenceStack onlineUsers={onlineUsers} currentUser={currentUser} />
                )}
                <button
                    onClick={onAddStation}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-[#6bbfd4] rounded-full shadow-lg border border-[#6bbfd4]/20 cursor-pointer hover:bg-[#6bbfd4]/10 dark:hover:bg-[#6bbfd4]/20 transition-all active:scale-95 text-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Station</span>
                </button>
                <button
                    onClick={handleAutoLayout}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-all active:scale-95 text-sm font-medium"
                    title="Beschriftungen automatisch anordnen"
                >
                    <Move className="w-4 h-4" />
                    <span className="hidden sm:inline">Anordnen</span>
                </button>
                <button
                    onClick={handleDistributeColors}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-all active:scale-95 text-sm font-medium"
                    title="Farben gleichmäßig verteilen"
                >
                    <Palette className="w-4 h-4" />
                    <span className="hidden sm:inline">Farben</span>
                </button>
                {activePlan.backgroundImage && (
                    <div className="flex items-center bg-white dark:bg-gray-700 rounded-full shadow-lg border dark:border-gray-600 overflow-hidden">
                        <button
                            onClick={zoomOut}
                            disabled={currentZoom <= ZOOM_STEPS[0]}
                            className="px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
                            title="Hintergrundbild verkleinern"
                        >
                            <ZoomOut className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                        </button>
                        <select
                            value={currentZoom}
                            onChange={(e) => updateActivePlan({ bgZoom: Number(e.target.value) })}
                            className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-transparent border-none outline-none px-1 cursor-pointer"
                            title="Zoom-Stufe"
                        >
                            {ZOOM_STEPS.map(z => (
                                <option key={z} value={z}>{Math.round(z * 100)}%</option>
                            ))}
                        </select>
                        <button
                            onClick={zoomIn}
                            disabled={currentZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                            className="px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
                            title="Hintergrundbild vergrößern"
                        >
                            <ZoomIn className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                        </button>
                    </div>
                )}
                <button
                    onClick={exportToPDF}
                    className="flex items-center gap-2 px-3 py-2 bg-[#6bbfd4] text-white rounded-full shadow-lg border-none cursor-pointer hover:bg-[#5aaec3] transition-all active:scale-95 text-sm font-medium"
                >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">PDF</span>
                </button>
                <label className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-all active:scale-95 text-sm font-medium">
                    <Upload className="w-4 h-4 text-[#6bbfd4]" />
                    <span className="hidden sm:inline text-gray-600 dark:text-gray-300">Lageplan hochladen</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                </label>
                <button
                    onClick={() => {
                        if (maskDrawing) {
                            cancelMaskDrawing();
                        } else {
                            setMaskDrawing(true);
                        }
                    }}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border cursor-pointer transition-all active:scale-95 text-sm font-medium",
                        maskDrawing ? "bg-[#6bbfd4] text-white border-[#6bbfd4]" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                    )}
                    title="Weiße Maske zeichnen"
                >
                    <PenLine className="w-4 h-4" />
                    <span className="hidden sm:inline">{maskDrawing ? 'Abbrechen' : 'Maske'}</span>
                </button>
                {maskDrawing && currentMaskPoints.length >= 3 && (
                    <button
                        onClick={() => {
                            const masks = [...(activePlan.masks || []), { points: currentMaskPoints }];
                            updateActivePlan({ masks });
                            setCurrentMaskPoints([]);
                            setMaskDrawing(false);
                            setCursorPos(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-[#7bc9a0] text-white rounded-full shadow-lg border-none cursor-pointer hover:bg-[#6ab890] transition-all active:scale-95 text-sm font-medium"
                    >
                        <span>✓ Fertig</span>
                    </button>
                )}
                {(activePlan.masks?.length ?? 0) > 0 && !maskDrawing && (
                    <button
                        onClick={clearMasks}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-red-400 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/30 transition-all active:scale-95 text-sm font-medium"
                        title="Alle Masken löschen"
                    >
                        <Eraser className="w-4 h-4" />
                        <span className="hidden sm:inline">Masken löschen</span>
                    </button>
                )}
                {!activePlan.logoOverlay && (
                    <button
                        onClick={addLogoOverlay}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-all active:scale-95 text-sm font-medium"
                        title="Logo hinzufügen"
                    >
                        <ImageIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">Logo</span>
                    </button>
                )}
                {activePlan.logoOverlay && (
                    <button
                        onClick={() => updateActivePlan({ logoOverlay: undefined })}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-red-400 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/30 transition-all active:scale-95 text-sm font-medium"
                        title="Logo entfernen"
                    >
                        <ImageIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">Logo entfernen</span>
                    </button>
                )}
                {!activePlan.labelOverlay && (
                    <button
                        onClick={addLabelOverlay}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-all active:scale-95 text-sm font-medium"
                        title="Überschrift hinzufügen"
                    >
                        <Type className="w-4 h-4" />
                        <span className="hidden sm:inline">Überschrift</span>
                    </button>
                )}
                {activePlan.labelOverlay && (
                    <button
                        onClick={() => updateActivePlan({ labelOverlay: undefined })}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-red-400 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/30 transition-all active:scale-95 text-sm font-medium"
                        title="Überschrift entfernen"
                    >
                        <Type className="w-4 h-4" />
                        <span className="hidden sm:inline">Überschrift entf.</span>
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-auto p-2 sm:p-8 flex items-center justify-center" style={{ overscrollBehavior: 'contain' }}>
                <div
                    ref={containerRef}
                    role="application"
                    aria-label="Karten-Editor"
                    className={cn(
                        "relative bg-white shadow-2xl overflow-hidden border border-gray-200 transition-all duration-500",
                        aspectRatio === 'landscape' ? "aspect-[297/210] h-auto w-full max-w-5xl" : "aspect-[210/297] w-auto h-full max-h-[80vh]"
                    )}
                    onMouseMove={(e) => { handleMouseMove(e); handleMaskMouseMove(e); handleOverlayMouseMove(e.clientX, e.clientY); }}
                    onMouseUp={() => { handleMouseUp(); stopOverlayDrag(); }}
                    onMouseLeave={() => { handleMouseUp(); stopOverlayDrag(); }}
                    onTouchMove={(e) => { handleTouchMove(e); if (draggingOverlay) { e.preventDefault(); handleOverlayMouseMove(e.touches[0].clientX, e.touches[0].clientY); } }}
                    onTouchEnd={() => { handleMouseUp(); stopOverlayDrag(); }}
                    onClick={handleMapClick}
                    onDoubleClick={handleMapDoubleClick}
                    onKeyDown={(e) => { if (e.key === 'Escape') { handleMouseUp(); stopOverlayDrag(); } }}
                    style={{ cursor: maskDrawing ? 'crosshair' : undefined, touchAction: 'none' }}
                >
                    {/* Zoom-Wrapper: Hintergrundbild + Masken skalieren gemeinsam */}
                    <div
                        className="absolute inset-0 pointer-events-none origin-center"
                        style={{ transform: `scale(${currentZoom})` }}
                    >
                        {activePlan.backgroundImage && (
                            <div className="absolute inset-0 select-none overflow-hidden">
                                <img
                                    src={activePlan.backgroundImage}
                                    className="w-full h-full object-contain opacity-50"
                                    alt="Lageplan Background"
                                />
                            </div>
                        )}

                        {/* Inverted white masks: white everywhere, polygon cuts out hole */}
                        {(activePlan.masks?.length ?? 0) > 0 && (
                            <svg className="absolute z-10" style={{ inset: '-1px', width: 'calc(100% + 2px)', height: 'calc(100% + 2px)' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                                {activePlan.masks!.map((mask, mi) => (
                                    <path
                                        key={mi}
                                        fillRule="evenodd"
                                        fill="white"
                                        d={`M0,0 L100,0 L100,100 L0,100 Z M${mask.points.map(p => `${p.x},${p.y}`).join(' L')} Z`}
                                    />
                                ))}
                            </svg>
                        )}

                        {/* Active drawing preview */}
                        {maskDrawing && currentMaskPoints.length > 0 && (
                            <svg className="absolute inset-0 w-full h-full z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {currentMaskPoints.length >= 3 && (
                                    <polygon
                                        points={currentMaskPoints.map(p => `${p.x},${p.y}`).join(' ')}
                                        fill="white"
                                        opacity="0.6"
                                    />
                                )}
                                <polyline
                                    points={[...currentMaskPoints, ...(cursorPos ? [cursorPos] : [])].map(p => `${p.x},${p.y}`).join(' ')}
                                    fill="none"
                                    stroke="#6bbfd4"
                                    strokeWidth="0.5"
                                    strokeDasharray="2 1"
                                />
                                {currentMaskPoints.map((p, i) => (
                                    <circle key={i} cx={p.x} cy={p.y} r="1" fill="#6bbfd4" />
                                ))}
                            </svg>
                        )}
                    </div>

                    {!activePlan.backgroundImage && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-50/50 pointer-events-none">
                            <MapIcon className="w-16 h-16 mb-4 opacity-10" />
                            <p className="text-lg font-medium">Kein Lageplan vorhanden</p>
                            <p className="text-sm mt-1">Bild hochladen oder mit <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-xs">⌘V</kbd> aus Zwischenablage einfügen.</p>
                        </div>
                    )}

                    <div className="absolute inset-0 select-none">
                        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-20">
                            {activePlan.stations.map(s => (
                                <line
                                    key={s.id}
                                    x1={`${s.targetX}%`}
                                    y1={`${s.targetY}%`}
                                    x2={`${s.x}%`}
                                    y2={`${s.y}%`}
                                    stroke="black"
                                    strokeWidth="1.5"
                                    strokeDasharray="4 4"
                                    className="opacity-40"
                                />
                            ))}
                        </svg>

                        {activePlan.stations.map((s, idx) => {
                            const colors = [
                                { style: { borderColor: "#6bbfd4", backgroundColor: "white" }, bg: "#6bbfd4" }, // Türkis
                                { style: { borderColor: "#9b8ec4", backgroundColor: "white" }, bg: "#9b8ec4" }, // Lila
                                { style: { borderColor: "#7bc9a0", backgroundColor: "white" }, bg: "#7bc9a0" }, // Mint
                                { style: { borderColor: "#e07aaa", backgroundColor: "white" }, bg: "#e07aaa" }, // Pink
                            ];
                            // Use explicit colorVariant if available, otherwise fallback to index/number based
                            const colorIndex = s.colorVariant ?? (idx % colors.length);
                            const color = colors[colorIndex % colors.length];
                            // Simulate wrapping: break at hyphens/spaces first, then anywhere
                            const simulateLines = (text: string, cpl: number) => {
                                const segs = text.split(/(?<=[-\s])/);
                                let lines = 1, lc = 0;
                                for (const seg of segs) {
                                    if (lc + seg.length > cpl && lc > 0) { lines++; lc = seg.length; }
                                    else { lc += seg.length; }
                                    while (lc > cpl) { lines++; lc -= cpl; }
                                }
                                return lines;
                            };
                            const availW = 64, availH = 58, charRatio = 0.56, lineH = 1.2;
                            let computedFontSize = 7;
                            for (let f = 14; f >= 7; f--) {
                                const cpl = Math.floor(availW / (f * charRatio));
                                if (cpl < 1) continue;
                                if (simulateLines(s.name.toUpperCase(), cpl) * f * lineH <= availH) {
                                    computedFontSize = f; break;
                                }
                            }

                            return (
                                <React.Fragment key={s.id}>
                                    <div
                                        data-export-hidden
                                        className="absolute flex items-center justify-center cursor-move z-20"
                                        style={{ left: `${s.targetX}%`, top: `${s.targetY}%`, width: 44 * mapScale, height: 44 * mapScale, marginLeft: -22 * mapScale, marginTop: -22 * mapScale, touchAction: 'none' }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setDraggedItem({ id: s.id, type: 'target' });
                                        }}
                                        onTouchStart={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setDraggedItem({ id: s.id, type: 'target' });
                                        }}
                                    >
                                        <div className="rounded-full shadow-lg border-2 border-white hover:scale-125 transition-transform active:scale-90" style={{ backgroundColor: color.bg, width: 16 * mapScale, height: 16 * mapScale }} />
                                    </div>

                                    <div
                                        className="absolute rounded-full shadow-xl cursor-move transition-all duration-200 hover:ring-2 ring-gray-100 z-30"
                                        style={{ left: `${s.x}%`, top: `${s.y}%`, width: 96 * mapScale, height: 96 * mapScale, marginLeft: -48 * mapScale, marginTop: -48 * mapScale, touchAction: 'none' }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setDraggedItem({ id: s.id, type: 'bubble' });
                                        }}
                                        onTouchStart={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setDraggedItem({ id: s.id, type: 'bubble' });
                                        }}
                                    >
                                        <div
                                            className="w-full h-full rounded-full flex flex-col items-center justify-center text-center bg-white overflow-hidden"
                                            style={s.isFilled ? { backgroundColor: color.bg, borderColor: color.bg, borderWidth: 6 * mapScale, borderStyle: 'solid', padding: 8 * mapScale } : { ...color.style, borderWidth: 6 * mapScale, borderStyle: 'solid', padding: 8 * mapScale }}
                                        >
                                            <span
                                                className={cn("font-mono font-bold uppercase leading-tight line-clamp-5 tracking-tight w-full", s.isFilled ? "text-white" : "text-gray-400")}
                                                style={{ hyphens: 'auto', WebkitHyphens: 'auto', overflowWrap: 'anywhere', fontSize: `${computedFontSize * mapScale}px` }}
                                            >
                                                {s.name}
                                            </span>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Logo Overlay */}
                    {activePlan.logoOverlay && (() => {
                        const lo = activePlan.logoOverlay;
                        return (
                            <div
                                className="absolute z-40"
                                style={{ left: `${lo.x}%`, top: `${lo.y}%`, width: `${lo.size}%` }}
                            >
                                {/* drag handle = the image itself */}
                                <div
                                    className="cursor-move select-none"
                                    onMouseDown={(e) => { e.stopPropagation(); startOverlayDrag('logo', e.clientX, e.clientY); }}
                                    onTouchStart={(e) => { e.stopPropagation(); startOverlayDrag('logo', e.touches[0].clientX, e.touches[0].clientY); }}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/logo.jpeg"
                                        alt="Logo"
                                        className="w-full h-auto block"
                                        draggable={false}
                                        onError={(e) => {
                                            // Fallback: show placeholder box
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />
                                    <div className="hidden w-full aspect-square bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">
                                        Logo<br />(public/logo.jpeg)
                                    </div>
                                </div>
                                {/* Resize handle — bottom-right corner */}
                                {!isExporting && (
                                    <div
                                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#6bbfd4] rounded-full cursor-se-resize border-2 border-white shadow"
                                        onMouseDown={(e) => { e.stopPropagation(); startOverlayDrag('logo-resize', e.clientX, e.clientY); }}
                                        onTouchStart={(e) => { e.stopPropagation(); startOverlayDrag('logo-resize', e.touches[0].clientX, e.touches[0].clientY); }}
                                    />
                                )}
                            </div>
                        );
                    })()}

                    {/* Label Overlay */}
                    {activePlan.labelOverlay && (() => {
                        const lb = activePlan.labelOverlay;
                        return (
                            <div
                                className="absolute z-40 group"
                                style={{ left: `${lb.x}%`, top: `${lb.y}%`, position: 'absolute' }}
                            >
                                {!isExporting && editingLabel ? (
                                    <div className="flex flex-col gap-1">
                                        <input
                                            autoFocus
                                            value={lb.text}
                                            onChange={(e) => updateActivePlan({ labelOverlay: { ...lb, text: e.target.value } })}
                                            onBlur={() => setEditingLabel(false)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingLabel(false); }}
                                            className="bg-white/80 border border-[#6bbfd4] rounded px-1 font-bold uppercase tracking-widest outline-none"
                                            style={{ fontSize: lb.fontSize }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <input
                                            type="range"
                                            min={10} max={72} step={2}
                                            value={lb.fontSize}
                                            onChange={(e) => updateActivePlan({ labelOverlay: { ...lb, fontSize: Number(e.target.value) } })}
                                            className="w-full"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                ) : (
                                    <div className="relative inline-block">
                                        <div
                                            className="cursor-move select-none font-bold uppercase tracking-widest whitespace-nowrap"
                                            style={{ fontSize: lb.fontSize * mapScale, color: '#1a1a1a' }}
                                            onMouseDown={(e) => { e.stopPropagation(); startOverlayDrag('label', e.clientX, e.clientY); }}
                                            onTouchStart={(e) => { e.stopPropagation(); startOverlayDrag('label', e.touches[0].clientX, e.touches[0].clientY); }}
                                            onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(true); }}
                                            title="Doppelklick zum Bearbeiten"
                                        >
                                            {lb.text}
                                        </div>
                                        {/* Resize handle — bottom-right corner */}
                                        {!isExporting && (
                                            <div
                                                className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#6bbfd4] rounded-full cursor-se-resize border-2 border-white shadow"
                                                onMouseDown={(e) => { e.stopPropagation(); startOverlayDrag('label-resize', e.clientX, e.clientY); }}
                                                onTouchStart={(e) => { e.stopPropagation(); startOverlayDrag('label-resize', e.touches[0].clientX, e.touches[0].clientY); }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
