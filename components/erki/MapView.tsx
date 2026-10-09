'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
    Plus, Map as MapIcon, Download, Upload, Move, Palette, PenLine, Eraser,
    Image as ImageIcon, Type, ZoomIn, ZoomOut, LassoSelect, Eye, EyeOff,
} from 'lucide-react';
import type { Plan, Station, LogoOverlay, LabelOverlay, PlanArea } from '@/lib/types';
import { areaToVisual, polygonCentroid, removeArea } from '@/lib/areas';
import { softHyphenate } from '@/lib/hyphenation';
import { useHyphenator } from '@/lib/useHyphenator';
import { cn } from '@/lib/utils';
import { exportLageplanPDF } from '@/lib/pdfExport';
import { computePolygonPerimeterSlots, type BlockedZone, type MaskPolygon } from '@/lib/bubbleLayoutMath';
import {
    clientToPercent,
    visualToStoredPercent,
    fitPageSize,
    stationColorHex,
    deriveContainerHeight,
    computeMapScale,
    distributeColors,
    resolveColorConflicts,
    spreadPiledStations,
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
    masks?: { points: { x: number; y: number }[] }[],
    bgZoom?: number,
): Station[] {
    if (stations.length === 0 || containerWidth === 0 || containerHeight === 0) return stations;

    const mapScale = computeMapScale(containerWidth, containerHeight);
    const bubbleRadius = 48 * mapScale;
    const blockedZones: BlockedZone[] = [];
    if (logoOverlay) {
        const logoPad = 1.5;
        blockedZones.push({
            x: logoOverlay.x - logoPad,
            y: logoOverlay.y - logoPad,
            width: logoOverlay.size + 2 * logoPad,
            height: logoOverlay.size * 0.8 + 2 * logoPad,
        });
    }
    if (labelOverlay) {
        const renderedFontSize = labelOverlay.fontSize * mapScale;
        const approxWPx = labelOverlay.text.length * renderedFontSize * 0.7;
        const approxHPx = renderedFontSize * 1.4;
        blockedZones.push({
            x: labelOverlay.x,
            y: labelOverlay.y,
            width: (approxWPx / containerWidth) * 100,
            height: (approxHPx / containerWidth) * 100,
        });
    }

    const markers = stations.map(s => ({
        id: s.id,
        x: (s.targetX / 100) * containerWidth,
        y: (s.targetY / 100) * containerHeight,
    }));

    const maskPolygons: MaskPolygon[] | undefined = masks?.map(m => ({ points: m.points }));

    const slots = computePolygonPerimeterSlots({
        markers,
        containerWidth,
        containerHeight,
        masks: maskPolygons,
        bgZoom,
        blockedZones,
        bubbleRadius,
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

// Farben der Bereiche (gedeckt, klar unterscheidbar von den Stationsfarben)
const AREA_COLORS = ['#e0a33a', '#5b8def', '#d9534f', '#3aa17e', '#8e6bbf'];

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
    // ── Bereiche (benannte Flaechen, nur Editor/Tabelle, nicht im PDF) ──────────
    const [areaDrawing, setAreaDrawing] = useState(false);
    const [currentAreaPoints, setCurrentAreaPoints] = useState<{ x: number; y: number }[]>([]);
    // Namens-Dialog: neuer Bereich (mit Punkten) oder bestehender (Umbenennen/Loeschen)
    const [areaDialog, setAreaDialog] = useState<{ mode: 'new'; points: { x: number; y: number }[] } | { mode: 'edit'; id: string } | null>(null);
    const [areaNameDraft, setAreaNameDraft] = useState('');
    // Ein-/Ausblenden pro Betrachter (lokal gemerkt)
    const [showAreas, setShowAreas] = useState<boolean>(() => {
        try { return typeof window === 'undefined' || localStorage.getItem('erki.showAreas') !== '0'; } catch { return true; }
    });
    const toggleShowAreas = () => {
        setShowAreas(v => {
            const next = !v;
            try { localStorage.setItem('erki.showAreas', next ? '1' : '0'); } catch { /* egal */ }
            return next;
        });
    };

    const containerRef = useRef<HTMLDivElement>(null);
    // Einheitliche Silbentrennung (wie im PDF): weiche Trennzeichen aus TeX-Mustern,
    // Browser-Trennung aus. Bis die Muster geladen sind, trennt der Browser.
    const hyphenate = useHyphenator();
    const labelHyphenStyle: React.CSSProperties = hyphenate
        ? { hyphens: 'manual', WebkitHyphens: 'manual' }
        : { hyphens: 'auto', WebkitHyphens: 'auto' };
    // Verfuegbarer Bereich fuer das Blatt (Scroll-Wrapper, ohne Padding).
    const pageAreaRef = useRef<HTMLDivElement>(null);
    const [pageArea, setPageArea] = useState<{ w: number; h: number; vh: number }>({ w: 0, h: 0, vh: 0 });
    useEffect(() => {
        const el = pageAreaRef.current;
        if (!el) return;
        const measure = () => {
            const cs = getComputedStyle(el);
            const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
            setPageArea({ w: el.clientWidth - padX, h: el.clientHeight - padY, vh: window.innerHeight });
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener('resize', measure);
        return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
    }, []);
    const [containerWidth, setContainerWidth] = useState(0);
    const mapScale = containerWidth > 0
        ? computeMapScale(containerWidth, deriveContainerHeight(containerWidth, aspectRatio))
        : 1;

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
    }, [maskDrawing, areaDrawing]);

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

    // Einmalige Verteilung gestapelter Marker beim ersten Laden des Plans.
    // Läuft erneut wenn sich die Masken nachladen (Mask-Anzahl ändert sich).
    const spreadDoneRef = useRef<string | null>(null);
    useEffect(() => {
        if (containerWidth === 0) return;
        const planKey = `${activePlan.id}:${(activePlan.masks ?? []).length}`;
        if (spreadDoneRef.current === planKey) return;
        spreadDoneRef.current = planKey;
        const spread = spreadPiledStations(activePlan.stations, activePlan.masks);
        if (spread !== activePlan.stations) {
            updateActivePlan({ stations: spread });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePlan.id, activePlan.masks, containerWidth]);

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
            activePlan.masks,
            activePlan.bgZoom,
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

    // Masken-Koordinaten: Maske liegt im Zoom-Wrapper (scale um die Mitte),
    // daher Klickposition in ungezoomte % zurueckrechnen.
    const getMapCoords = (e: React.MouseEvent) => {
        if (!containerRef.current) return null;
        const visual = clientToPercent(e.clientX, e.clientY, containerRef.current.getBoundingClientRect());
        return visualToStoredPercent(visual, currentZoom);
    };

    const handleMapClick = (e: React.MouseEvent) => {
        if (areaDrawing) {
            const pos = getMapCoords(e);
            if (pos) setCurrentAreaPoints(prev => [...prev, pos]);
            return;
        }
        if (!maskDrawing) return;
        const pos = getMapCoords(e);
        if (!pos) return;
        setCurrentMaskPoints(prev => [...prev, pos]);
    };

    // Bereich abschliessen -> Namens-Dialog
    const finishAreaDrawing = (points: { x: number; y: number }[]) => {
        if (points.length < 3) return;
        setAreaDialog({ mode: 'new', points });
        setAreaNameDraft('');
        setAreaDrawing(false);
        setCurrentAreaPoints([]);
        setCursorPos(null);
    };

    const saveAreaDialog = () => {
        if (!areaDialog) return;
        const name = areaNameDraft.trim();
        if (!name) return;
        if (areaDialog.mode === 'new') {
            const area: PlanArea = { id: crypto.randomUUID(), name, points: areaDialog.points };
            updateActivePlan({ areas: [...(activePlan.areas ?? []), area] });
            setShowAreas(true);
        } else {
            updateActivePlan({
                areas: (activePlan.areas ?? []).map(a => (a.id === areaDialog.id ? { ...a, name } : a)),
            });
        }
        setAreaDialog(null);
    };

    const deleteAreaFromDialog = () => {
        if (!areaDialog || areaDialog.mode !== 'edit') return;
        const { areas, stations } = removeArea(activePlan.areas ?? [], activePlan.stations, areaDialog.id);
        updateActivePlan({ areas, stations });
        setAreaDialog(null);
    };

    const handleMapDoubleClick = (e: React.MouseEvent) => {
        if (areaDrawing) {
            e.preventDefault();
            // Doppelklick setzt vorher zwei Klick-Punkte an dieselbe Stelle -> den doppelten verwerfen
            finishAreaDrawing(currentAreaPoints.slice(0, -1).length >= 3 ? currentAreaPoints.slice(0, -1) : currentAreaPoints);
            return;
        }
        if (!maskDrawing || currentMaskPoints.length < 3) return;
        e.preventDefault();
        const masks = [...(activePlan.masks || []), { points: currentMaskPoints }];
        updateActivePlan({ masks });
        setCurrentMaskPoints([]);
        setMaskDrawing(false);
        setCursorPos(null);
    };

    const handleMaskMouseMove = (e: React.MouseEvent) => {
        if (!maskDrawing && !areaDrawing) return;
        setCursorPos(getMapCoords(e));
    };

    // bricht jedes laufende Zeichnen ab (Maske und Bereich), auch per Escape
    const cancelMaskDrawing = () => {
        setMaskDrawing(false);
        setCurrentMaskPoints([]);
        setAreaDrawing(false);
        setCurrentAreaPoints([]);
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

    // Blattgroesse in px (A4 exakt, browserunabhaengig). max-w-5xl = 1024px, max-h = 80vh.
    const pageSize = fitPageSize(pageArea.w, pageArea.h, aspectRatio, 1024, pageArea.vh * 0.8 || Infinity);
    const pageStyle = pageSize.width > 0 ? { width: pageSize.width, height: pageSize.height } : undefined;

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="relative shrink-0 px-2 pt-2 sm:p-0 sm:absolute sm:top-3 sm:right-3 z-40 flex flex-wrap gap-2 justify-center sm:justify-end items-center sm:max-w-[calc(100%-1.5rem)]">
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
                            cancelMaskDrawing();
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
                <button
                    onClick={() => {
                        if (areaDrawing) {
                            cancelMaskDrawing();
                        } else {
                            cancelMaskDrawing();
                            setAreaDrawing(true);
                            setShowAreas(true);
                        }
                    }}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border cursor-pointer transition-all active:scale-95 text-sm font-medium",
                        areaDrawing ? "bg-[#e0a33a] text-white border-[#e0a33a]" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                    )}
                    title="Bereich einzeichnen (Eckpunkte antippen, Doppelklick oder „Fertig“ schließt) – erscheint nicht im PDF"
                >
                    <LassoSelect className="w-4 h-4" />
                    <span className="hidden sm:inline">{areaDrawing ? 'Abbrechen' : 'Bereich'}</span>
                </button>
                {areaDrawing && currentAreaPoints.length >= 3 && (
                    <button
                        onClick={() => finishAreaDrawing(currentAreaPoints)}
                        className="flex items-center gap-2 px-3 py-2 bg-[#7bc9a0] text-white rounded-full shadow-lg border-none cursor-pointer hover:bg-[#6ab890] transition-all active:scale-95 text-sm font-medium"
                    >
                        <span>✓ Fertig</span>
                    </button>
                )}
                {(activePlan.areas?.length ?? 0) > 0 && !areaDrawing && (
                    <button
                        onClick={toggleShowAreas}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-all active:scale-95 text-sm font-medium"
                        title={showAreas ? 'Bereiche ausblenden' : 'Bereiche einblenden'}
                        aria-pressed={showAreas}
                    >
                        {showAreas ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        <span className="hidden sm:inline">{showAreas ? 'Bereiche aus' : 'Bereiche ein'}</span>
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

            <div ref={pageAreaRef} className="flex-1 min-h-0 overflow-auto p-2 sm:p-8 flex items-center justify-center" style={{ overscrollBehavior: 'contain' }}>
                <div
                    ref={containerRef}
                    role="application"
                    aria-label="Karten-Editor"
                    className={cn(
                        "relative bg-white shadow-2xl overflow-hidden border border-gray-200 transition-all duration-500",
                        // CSS nur als Fallback bis zur ersten Messung; danach feste px-Groesse (pageStyle)
                        aspectRatio === 'landscape' ? "aspect-[297/210] h-auto w-full max-w-5xl" : "aspect-[210/297] w-auto h-full max-h-[80vh]",
                        "shrink-0"
                    )}
                    onMouseMove={(e) => { handleMouseMove(e); handleMaskMouseMove(e); handleOverlayMouseMove(e.clientX, e.clientY); }}
                    onMouseUp={() => { handleMouseUp(); stopOverlayDrag(); }}
                    onMouseLeave={() => { handleMouseUp(); stopOverlayDrag(); }}
                    onTouchMove={(e) => { handleTouchMove(e); if (draggingOverlay) { e.preventDefault(); handleOverlayMouseMove(e.touches[0].clientX, e.touches[0].clientY); } }}
                    onTouchEnd={() => { handleMouseUp(); stopOverlayDrag(); }}
                    onClick={handleMapClick}
                    onDoubleClick={handleMapDoubleClick}
                    onKeyDown={(e) => { if (e.key === 'Escape') { handleMouseUp(); stopOverlayDrag(); } }}
                    style={{ ...pageStyle, cursor: maskDrawing || areaDrawing ? 'crosshair' : undefined, touchAction: 'none' }}
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

                        {/* Bereiche (nicht im PDF – der PDF-Export zeichnet nur aus den Daten) */}
                        {showAreas && !maskDrawing && (activePlan.areas?.length ?? 0) > 0 && (
                            <svg data-export-hidden className="absolute inset-0 w-full h-full z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {activePlan.areas!.map((a, i) => (
                                    <polygon
                                        key={a.id}
                                        points={a.points.map(p => `${p.x},${p.y}`).join(' ')}
                                        fill={AREA_COLORS[i % AREA_COLORS.length]}
                                        fillOpacity={0.14}
                                        stroke={AREA_COLORS[i % AREA_COLORS.length]}
                                        strokeWidth={0.35}
                                        strokeDasharray="1.2 0.8"
                                        vectorEffect="non-scaling-stroke"
                                    />
                                ))}
                            </svg>
                        )}

                        {/* Bereich zeichnen: Vorschau */}
                        {areaDrawing && currentAreaPoints.length > 0 && (
                            <svg className="absolute inset-0 w-full h-full z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {currentAreaPoints.length >= 3 && (
                                    <polygon
                                        points={currentAreaPoints.map(p => `${p.x},${p.y}`).join(' ')}
                                        fill="#e0a33a"
                                        fillOpacity={0.18}
                                    />
                                )}
                                <polyline
                                    points={[...currentAreaPoints, ...(cursorPos ? [cursorPos] : [])].map(p => `${p.x},${p.y}`).join(' ')}
                                    fill="none"
                                    stroke="#e0a33a"
                                    strokeWidth="0.5"
                                    strokeDasharray="2 1"
                                />
                                {currentAreaPoints.map((p, i) => (
                                    <circle key={i} cx={p.x} cy={p.y} r="1" fill="#e0a33a" />
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

                    {!maskDrawing && <div className={cn("absolute inset-0 select-none", areaDrawing && "pointer-events-none opacity-60")}>
                        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-20">
                            {activePlan.stations.map((s, idx) => (
                                <line
                                    key={s.id}
                                    x1={`${s.targetX}%`}
                                    y1={`${s.targetY}%`}
                                    x2={`${s.x}%`}
                                    y2={`${s.y}%`}
                                    stroke={stationColorHex(s.colorVariant, idx)}
                                    strokeWidth="1.5"
                                    strokeDasharray="4 4"
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
                                                style={{ ...labelHyphenStyle, overflowWrap: 'anywhere', fontSize: `${computedFontSize * mapScale}px` }}
                                            >
                                                {hyphenate ? softHyphenate(s.name, hyphenate) : s.name}
                                            </span>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>}

                    {/* Logo Overlay */}
                    {!maskDrawing && !areaDrawing && activePlan.logoOverlay && (() => {
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
                    {!maskDrawing && !areaDrawing && activePlan.labelOverlay && (() => {
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

                    {/* Bereichs-Namen (klickbar: umbenennen/loeschen) */}
                    {showAreas && !maskDrawing && !areaDrawing && (activePlan.areas?.length ?? 0) > 0 && (
                        <div data-export-hidden className="absolute inset-0 pointer-events-none z-[25]">
                            {activePlan.areas!.map((a, i) => {
                                const c = polygonCentroid(areaToVisual(a, currentZoom));
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-white/85 dark:bg-gray-800/85 shadow border font-semibold whitespace-nowrap hover:bg-white"
                                        style={{
                                            left: `${c.x}%`,
                                            top: `${c.y}%`,
                                            fontSize: Math.max(10, 12 * mapScale),
                                            color: AREA_COLORS[i % AREA_COLORS.length],
                                            borderColor: AREA_COLORS[i % AREA_COLORS.length],
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onTouchStart={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAreaDialog({ mode: 'edit', id: a.id });
                                            setAreaNameDraft(a.name);
                                        }}
                                        title="Bereich umbenennen oder löschen"
                                    >
                                        {a.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Dialog: Bereich benennen / umbenennen / loeschen */}
            {areaDialog && (
                <div
                    className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
                    onClick={() => setAreaDialog(null)}
                >
                    <div
                        role="dialog"
                        aria-label={areaDialog.mode === 'new' ? 'Bereich benennen' : 'Bereich bearbeiten'}
                        className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-4 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="font-semibold text-gray-800 dark:text-gray-100">
                            {areaDialog.mode === 'new' ? 'Neuer Bereich' : 'Bereich bearbeiten'}
                        </p>
                        <input
                            autoFocus
                            value={areaNameDraft}
                            onChange={(e) => setAreaNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') saveAreaDialog();
                                if (e.key === 'Escape') setAreaDialog(null);
                            }}
                            placeholder="Name, z. B. Saal, Garten, Kirche"
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                        />
                        <div className="flex items-center gap-2">
                            {areaDialog.mode === 'edit' && (
                                <button
                                    type="button"
                                    onClick={deleteAreaFromDialog}
                                    className="px-3 py-2 rounded-full text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                                >
                                    Löschen
                                </button>
                            )}
                            <div className="flex-1" />
                            <button
                                type="button"
                                onClick={() => setAreaDialog(null)}
                                className="px-3 py-2 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                Abbrechen
                            </button>
                            <button
                                type="button"
                                onClick={saveAreaDialog}
                                disabled={!areaNameDraft.trim()}
                                className="px-4 py-2 rounded-full text-sm font-medium bg-[#6bbfd4] text-white disabled:opacity-40"
                            >
                                Speichern
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
