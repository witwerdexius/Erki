'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Plus, Trash2, Map as MapIcon, List, Download, Upload, Link, Move, Palette, GripVertical, PenLine, Eraser, Image as ImageIcon, Type, ZoomIn, ZoomOut, BookTemplate, Bookmark, Pencil, Loader2, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import { Plan, Station, MaskPolygon, LogoOverlay, LabelOverlay, StationTemplate } from '@/lib/types';
import { importPlanFromUrl } from '@/lib/actions';
import { loadTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/lib/db';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import TemplatePickerDialog from './TemplatePickerDialog';
import NachdenktexteTab from '@/components/NachdenktexteTab';

interface ErkiAppProps {
    plan: Plan;
    user: User;
    onPlanUpdate: (plan: Plan) => void;
    onBack: () => void;
    isSaving?: boolean;
}

export default function ErkiApp({ plan, user, onPlanUpdate, onBack, isSaving = false }: ErkiAppProps) {
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [activeTab, setActiveTab] = useState<'map' | 'table' | 'templates' | 'nachdenk'>('table');
    const [templates, setTemplates] = useState<StationTemplate[]>([]);
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [editingTemplateData, setEditingTemplateData] = useState<Partial<StationTemplate>>({});
    const [aspectRatio, setAspectRatio] = useState<'portrait' | 'landscape'>('landscape');
    const [draggedItem, setDraggedItem] = useState<{ id: string; type: 'bubble' | 'target' } | null>(null);
    const [draggingOverlay, setDraggingOverlay] = useState<'logo' | 'label' | 'logo-resize' | 'label-resize' | null>(null);
    const [editingLabel, setEditingLabel] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const overlayDragStart = useRef<{ mouseX: number; mouseY: number; elemX: number; elemY: number; size?: number; fontSize?: number } | null>(null);
    const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
    const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
    const [maskDrawing, setMaskDrawing] = useState(false);
    const [currentMaskPoints, setCurrentMaskPoints] = useState<{ x: number; y: number }[]>([]);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    const activePlan = plan;
    const mapScale = containerWidth > 0 ? containerWidth / 800 : 1;

    // Templates lazy-laden beim ersten Wechsel zum Vorlagen-Tab oder beim Öffnen des Pickers
    const ensureTemplatesLoaded = async () => {
        if (templatesLoaded) return;
        try {
            const data = await loadTemplates();
            setTemplates(data);
        } catch (e) {
            console.error('Fehler beim Laden der Vorlagen:', e);
        }
        setTemplatesLoaded(true);
    };

    const handleSaveAsTemplate = async (station: Station) => {
        try {
            const t = await createTemplate({
                name: station.name,
                description: station.description,
                material: station.material,
                instructions: station.instructions,
                impulses: station.impulses,
                setupBy: station.setupBy,
                conductedBy: station.conductedBy,
            }, user.id);
            setTemplates(prev => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
            alert(`Vorlage „${t.name}" gespeichert.`);
        } catch (e) {
            console.error(e);
            alert('Fehler beim Speichern der Vorlage.');
        }
    };

    const handleApplyTemplate = (t: StationTemplate) => {
        // Neue Station anlegen mit Template-Werten
        if (!activePlan) return;
        const i = activePlan.stations.length;
        const maxNum = Math.max(0, ...activePlan.stations.map(s => parseInt(s.number) || 0));
        const side = i % 4, step = (Math.floor(i / 4) * 15) % 80;
        let x = 5, y = 5;
        if (side === 0) { x = 10 + step; y = 5; }
        else if (side === 1) { x = 95; y = 10 + step; }
        else if (side === 2) { x = 90 - step; y = 95; }
        else if (side === 3) { x = 5; y = 90 - step; }
        const newStation: Station = {
            id: crypto.randomUUID(),
            number: (maxNum + 1).toString(),
            name: t.name,
            description: t.description,
            material: t.material,
            instructions: t.instructions,
            impulses: t.impulses,
            setupBy: t.setupBy,
            conductedBy: t.conductedBy,
            x, y,
            targetX: 40 + (i % 3) * 10,
            targetY: 40 + (Math.floor(i / 3) * 10) % 20,
            isFilled: false,
            colorVariant: i % 4,
        };
        updateActivePlan({ stations: [...activePlan.stations, newStation] });
        setActiveTab('table');
    };

    const handleCreateBlankTemplate = async () => {
        try {
            const t = await createTemplate({ name: 'Neue Vorlage', description: '', material: '', instructions: '', impulses: [], setupBy: '', conductedBy: '' }, user.id);
            setTemplates(prev => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
            setEditingTemplateId(t.id);
            setEditingTemplateData(t);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveTemplateEdit = async () => {
        if (!editingTemplateId) return;
        try {
            await updateTemplate(editingTemplateId, editingTemplateData);
            setTemplates(prev => prev.map(t => t.id === editingTemplateId ? { ...t, ...editingTemplateData } : t).sort((a, b) => a.name.localeCompare(b.name)));
            setEditingTemplateId(null);
            setEditingTemplateData({});
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteTemplate = async (id: string, name: string) => {
        if (!confirm(`Vorlage „${name}" löschen?`)) return;
        try {
            await deleteTemplate(id);
            setTemplates(prev => prev.filter(t => t.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    const ZOOM_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];
    const currentZoom = activePlan?.bgZoom ?? 1;
    const zoomIn  = () => { const next = ZOOM_STEPS.find(z => z > currentZoom); if (next) updateActivePlan({ bgZoom: next }); };
    const zoomOut = () => { const prev = [...ZOOM_STEPS].reverse().find(z => z < currentZoom); if (prev) updateActivePlan({ bgZoom: prev }); };

    useEffect(() => {
        if (activePlan?.backgroundImage) {
            const img = new Image();
            img.onload = () => {
                setAspectRatio(img.width >= img.height ? 'landscape' : 'portrait');
            };
            img.src = activePlan.backgroundImage;
        }
    }, [activePlan?.backgroundImage]);

    // Escape cancels mask drawing
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelMaskDrawing(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [maskDrawing]);

    // Paste image from clipboard as background
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (!activePlan || activeTab !== 'map') return;
            const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
            if (!item) return;
            const file = item.getAsFile();
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                updateActivePlan({ backgroundImage: ev.target?.result as string });
            };
            reader.readAsDataURL(file);
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [activePlan, activeTab]);

    // Measure container width for responsive bubble scaling
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            setContainerWidth(entries[0].contentRect.width);
        });
        ro.observe(el);
        setContainerWidth(el.getBoundingClientRect().width);
        return () => ro.disconnect();
    }, []);

    // Re-measure when switching back to map tab (container was hidden/zero-width)
    useEffect(() => {
        if (activeTab !== 'map') return;
        const measure = () => {
            const w = containerRef.current?.getBoundingClientRect().width ?? 0;
            if (w > 0) setContainerWidth(w);
        };
        measure();
        const t = setTimeout(measure, 50);
        return () => clearTimeout(t);
    }, [activeTab]);

    // Auto-resize all textareas in the table when plan or tab changes
    useEffect(() => {
        if (activeTab !== 'table' || !tableRef.current) return;
        const textareas = tableRef.current.querySelectorAll('textarea');
        textareas.forEach((ta) => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
        });
    }, [activeTab, plan.id, activePlan?.stations]);

    const handleImport = async () => {
        if (!importUrl) return;
        setIsImporting(true);
        const result = await importPlanFromUrl(importUrl);
        if (result.success && result.data) {
            updateActivePlan({
                title: result.data.title,
                url: importUrl,
                stations: result.data.stations,
            });
            setImportUrl('');
        } else {
            alert('Import fehlgeschlagen: ' + result.error);
        }
        setIsImporting(false);
    };

    const updateActivePlan = (updates: Partial<Plan>) => {
        onPlanUpdate({ ...plan, ...updates });
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && activePlan) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const stations = [...activePlan.stations];
                // If many stations have target at 50/50, distribute them
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
                }

                updateActivePlan({
                    backgroundImage: ev.target?.result as string,
                    stations
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const content = ev.target?.result as string;
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id && parsed[0].stations) {
                        // Load first plan from backup into current editor
                        const imported = parsed[0];
                        updateActivePlan({
                            title: imported.title ?? plan.title,
                            stations: imported.stations,
                            backgroundImage: imported.backgroundImage,
                            masks: imported.masks,
                        });
                        alert('Backup geladen! Bitte speichern.');
                    } else {
                        alert('Ungültiges Dateiformat. Bitte eine gültige .rki-Datei wählen.');
                    }
                } catch (error) {
                    console.error('Failed to parse backup', error);
                    alert('Fehler beim Laden der Datei.');
                }
            };
            reader.readAsText(file);
        }
    };

    const addStation = () => {
        if (!activePlan) return;
        const i = activePlan.stations.length;

        // Find next highest number
        const maxNum = Math.max(0, ...activePlan.stations.map(s => parseInt(s.number) || 0));

        // Distribution logic
        const side = i % 4;
        const step = (Math.floor(i / 4) * 15) % 80;
        let x = 5, y = 5;
        if (side === 0) { x = 10 + step; y = 5; }
        else if (side === 1) { x = 95; y = 10 + step; }
        else if (side === 2) { x = 90 - step; y = 95; }
        else if (side === 3) { x = 5; y = 90 - step; }

        const targetX = 40 + (i % 3) * 10;
        const targetY = 40 + (Math.floor(i / 3) * 10) % 20;

        const newStation: Station = {
            id: crypto.randomUUID(),
            number: (maxNum + 1).toString(),
            name: 'Neue Station',
            description: '',
            material: '',
            instructions: '',
            impulses: [],
            setupBy: '',
            conductedBy: '',
            x,
            y,
            targetX,
            targetY,
            isFilled: false,
            colorVariant: i % 4,
        };
        updateActivePlan({ stations: [...activePlan.stations, newStation] });
    };

    const renumberStations = () => {
        if (!activePlan) return;
        const stations = [...activePlan.stations].sort((a, b) => parseInt(a.number) - parseInt(b.number));
        stations.forEach((s, idx) => {
            s.number = (idx + 1).toString();
        });
        updateActivePlan({ stations });
    };

    const exportToPDF = async () => {
        if (!containerRef.current || !activePlan) return;

        const hiddenEls: { el: HTMLElement; prev: string }[] = [];
        let bgStylePrev: string | null = null;

        try {
            const container = containerRef.current;
            setEditingLabel(false);
            setIsExporting(true);

            // Direkt per style ausblenden (Mobile Safari ignoriert CSS-Klassen zuverlässig nicht)
            container.querySelectorAll<HTMLElement>('[data-export-hidden]').forEach(el => {
                hiddenEls.push({ el, prev: el.style.display });
                el.style.display = 'none';
            });

            // Hintergrundbild als base64 direkt auf den Container setzen, damit Mobile Safari es rendert
            if (activePlan.backgroundImage) {
                bgStylePrev = container.style.backgroundImage;
                // Bild vorladen und auf complete warten
                const preload = new Image();
                preload.src = activePlan.backgroundImage;
                if (!(preload.complete && preload.naturalHeight !== 0)) {
                    await new Promise<void>(resolve => {
                        preload.onload = () => resolve();
                        preload.onerror = () => resolve();
                        setTimeout(resolve, 2000);
                    });
                }
                // Sicherstellen dass das <img>-Element im DOM das Bild hat
                const bgImg = container.querySelector<HTMLImageElement>('img[alt="Lageplan Background"]');
                if (bgImg) bgImg.src = activePlan.backgroundImage;
            }

            // Wartezeit für Mobile Safari Re-Render
            await new Promise<void>(resolve => setTimeout(resolve, 500));

            console.log('[PDF] Step 1: importing html-to-image');
            const { toPng } = await import('html-to-image');

            console.log('[PDF] Step 2: capturing canvas');
            const dataUrl = await toPng(container, {
                pixelRatio: 2,
                backgroundColor: '#ffffff',
                cacheBust: true,
                skipFonts: false,
                includeQueryParams: true,
                fetchRequestInit: { cache: 'force-cache' },
            });

            console.log('[PDF] Step 3: creating PDF');
            const img = new Image();
            img.src = dataUrl;
            await new Promise<void>(resolve => { img.onload = () => resolve(); });
            const imgAspect = img.naturalWidth / img.naturalHeight;

            const pdf = new jsPDF({
                orientation: aspectRatio,
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            let drawW = pdfWidth;
            let drawH = pdfWidth / imgAspect;
            if (drawH > pdfHeight) {
                drawH = pdfHeight;
                drawW = pdfHeight * imgAspect;
            }
            const offsetX = (pdfWidth - drawW) / 2;
            const offsetY = (pdfHeight - drawH) / 2;

            const sanitizedTitle = activePlan.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'lageplan';

            console.log('[PDF] Step 4: saving');
            pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, drawW, drawH);
            pdf.save(`${sanitizedTitle}.pdf`);
            console.log('[PDF] Done');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[PDF] Export failed:', error);
            alert(`PDF Export fehlgeschlagen:\n${msg}`);
        } finally {
            // Alle ausgeblendeten Elemente wiederherstellen
            hiddenEls.forEach(({ el, prev }) => { el.style.display = prev; });
            if (bgStylePrev !== null && containerRef.current) containerRef.current.style.backgroundImage = bgStylePrev;
            setIsExporting(false);
        }
    };

    const exportTableToPDF = async () => {
        if (!activePlan) return;
        try {
            const autoTable = (await import('jspdf-autotable')).default;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const createHyphenator = (await import('hyphen') as any).default ?? (await import('hyphen') as any);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dePatterns = ((await import('hyphen/patterns/de-1996')) as any).default ?? (await import('hyphen/patterns/de-1996'));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const hyphenate: (word: string) => string = createHyphenator(dePatterns);

            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            // Set cell font for accurate measurements
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);

            // Pre-wrap a text block so jsPDF receives already-broken lines with German syllable hyphens.
            // jsPDF only breaks on spaces, so we handle long words ourselves.
            const CELL_PADDING = 3; // mm (matches cellPadding below)
            const preWrap = (rawText: string, colWidthMm: number): string => {
                const maxW = colWidthMm - CELL_PADDING * 2;
                if (!rawText) return '';
                const measure = (s: string) => pdf.getTextWidth(s);
                const hyphenW = measure('-');
                const lines: string[] = [];

                for (const paragraph of rawText.split('\n')) {
                    let line = '';
                    let lineW = 0;

                    for (const word of paragraph.split(' ')) {
                        if (!word) continue;
                        const wordW = measure(word);
                        const sep = line ? measure(' ') : 0;

                        if (lineW + sep + wordW <= maxW) {
                            // Word fits
                            line = line ? line + ' ' + word : word;
                            lineW += sep + wordW;
                        } else {
                            // Word doesn't fit — flush current line and hyphenate
                            if (line) { lines.push(line); line = ''; lineW = 0; }
                            // Break the word across lines using hyphenation points
                            const parts = hyphenate(word).split('\u00AD');
                            let chunk = '';
                            let chunkW = 0;
                            for (const part of parts) {
                                const partW = measure(part);
                                if (!chunk) {
                                    chunk = part; chunkW = partW;
                                } else if (chunkW + partW + hyphenW <= maxW) {
                                    chunk += part; chunkW += partW;
                                } else {
                                    lines.push(chunk + '-');
                                    chunk = part; chunkW = partW;
                                }
                            }
                            line = chunk; lineW = chunkW;
                        }
                    }
                    if (line) lines.push(line);
                }

                return lines.join('\n');
            };

            const sanitizedTitle = activePlan.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'tabelle';

            // Title
            pdf.setFontSize(16);
            pdf.setFont('helvetica', 'bold');
            pdf.text(activePlan.title, 14, 16);
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(150);
            pdf.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, 14, 22);
            pdf.setTextColor(0);

            // Reset to cell font for measurements used in preWrap
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);

            // Column widths (mm)
            const W = { nr: 12, station: 30, desc: 65, mat: 72, imp: 40, setup: 20, cond: 20, stamp: 10 };

            autoTable(pdf, {
                startY: 27,
                head: [['Nr.', 'Station', 'Beschreibung', 'Material', 'Gesprächsimpulse', 'Aufbau', 'Durchführung', 'Stempelfeld']],
                body: activePlan.stations.map(s => [
                    s.number,
                    preWrap(s.name, W.station),
                    preWrap(s.description || '', W.desc),
                    preWrap(s.material || '', W.mat),
                    (s.impulses || []).map(imp => preWrap(imp, W.imp)).join('\n'),
                    preWrap(s.setupBy || '', W.setup),
                    preWrap(s.conductedBy || '', W.cond),
                    s.isFilled ? '✓' : '',
                ]),
                styles: { fontSize: 8, cellPadding: CELL_PADDING, overflow: 'linebreak' },
                headStyles: { fillColor: [107, 191, 212], textColor: 255, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: W.nr },
                    1: { cellWidth: W.station },
                    2: { cellWidth: W.desc },
                    3: { cellWidth: W.mat },
                    4: { cellWidth: W.imp },
                    5: { cellWidth: W.setup },
                    6: { cellWidth: W.cond },
                    7: { cellWidth: W.stamp, halign: 'center' },
                },
                alternateRowStyles: { fillColor: [249, 250, 251] },
            });

            pdf.save(`${sanitizedTitle}-tabelle.pdf`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[PDF Table] Export failed:', error);
            alert(`Tabellen-PDF Export fehlgeschlagen:\n${msg}`);
        }
    };

    const deleteStation = (id: string) => {
        if (!activePlan) return;
        updateActivePlan({ stations: activePlan.stations.filter(s => s.id !== id) });
    };

    const updateStation = (id: string, updates: Partial<Station>) => {
        if (!activePlan) return;
        updateActivePlan({
            stations: activePlan.stations.map(s => s.id === id ? { ...s, ...updates } : s)
        });
    };

    const resolveColorConflicts = (stationId: string, currentStations: Station[]) => {
        const station = currentStations.find(s => s.id === stationId);
        if (!station) return currentStations;

        const THRESHOLD = 8; // Distance in percent to consider "adjacent"
        const otherStations = currentStations.filter(s => s.id !== stationId);
        const stationIndex = currentStations.findIndex(s => s.id === stationId);

        // Fix: Use the same default logic as rendering (index % 4) instead of 0
        let newColorVariant = station.colorVariant ?? (stationIndex % 4);
        let conflictFound = true;
        let attempts = 0;

        while (conflictFound && attempts < 4) {
            conflictFound = false;
            for (const other of otherStations) {
                const dx = station.targetX - other.targetX;
                const dy = station.targetY - other.targetY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                const otherIndex = currentStations.findIndex(s => s.id === other.id);
                const otherColor = other.colorVariant ?? (otherIndex % 4);

                if (distance < THRESHOLD && otherColor === newColorVariant) {
                    conflictFound = true;
                    newColorVariant = (newColorVariant + 1) % 4;
                    break;
                }
            }
            attempts++;
        }

        if (station.colorVariant !== newColorVariant) {
            return currentStations.map(s => s.id === stationId ? { ...s, colorVariant: newColorVariant } : s);
        }
        return currentStations;
    };

    const handleDistributeColors = () => {
        if (!activePlan) return;
        const THRESHOLD = 20; // % distance – stations closer than this are "neighbors"
        const stations = activePlan.stations.map(s => ({ ...s }));

        // Greedy graph coloring: assign each station the lowest color not used by any neighbor
        for (let i = 0; i < stations.length; i++) {
            const usedByNeighbors = new Set<number>();
            for (let j = 0; j < i; j++) {
                const dx = stations[i].targetX - stations[j].targetX;
                const dy = stations[i].targetY - stations[j].targetY;
                if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) {
                    usedByNeighbors.add(stations[j].colorVariant ?? 0);
                }
            }
            // Pick the first color not used by neighbors
            let color = 0;
            while (usedByNeighbors.has(color)) color = (color + 1) % 4;
            stations[i].colorVariant = color;
        }
        updateActivePlan({ stations });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!draggedItem || !containerRef.current || !activePlan) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (draggedItem.type === 'bubble') {
            updateStation(draggedItem.id, { x, y });
        } else {
            updateStation(draggedItem.id, { targetX: x, targetY: y });
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!draggedItem || !containerRef.current || !activePlan) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = containerRef.current.getBoundingClientRect();
        const x = ((touch.clientX - rect.left) / rect.width) * 100;
        const y = ((touch.clientY - rect.top) / rect.height) * 100;
        if (draggedItem.type === 'bubble') {
            updateStation(draggedItem.id, { x, y });
        } else {
            updateStation(draggedItem.id, { targetX: x, targetY: y });
        }
    };

    const handleRowDragStart = (id: string) => setDraggedRowId(id);

    const handleRowDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        if (id !== draggedRowId) setDragOverRowId(id);
    };

    const handleRowDrop = (targetId: string) => {
        if (!activePlan || !draggedRowId || draggedRowId === targetId) return;
        const stations = [...activePlan.stations];
        const fromIdx = stations.findIndex(s => s.id === draggedRowId);
        const toIdx = stations.findIndex(s => s.id === targetId);
        const [moved] = stations.splice(fromIdx, 1);
        stations.splice(toIdx, 0, moved);
        stations.forEach((s, i) => { s.number = (i + 1).toString(); });
        updateActivePlan({ stations });
        setDraggedRowId(null);
        setDragOverRowId(null);
    };

    const handleRowDragEnd = () => {
        setDraggedRowId(null);
        setDragOverRowId(null);
    };

    const handleRowReorder = (id: string, inputValue: string) => {
        if (!activePlan) return;
        const stations = [...activePlan.stations];
        const fromIdx = stations.findIndex(s => s.id === id);
        if (fromIdx === -1) return;
        const parsed = parseInt(inputValue, 10);
        if (isNaN(parsed) || parsed < 1) return;
        const toIdx = Math.min(parsed - 1, stations.length - 1);
        if (toIdx === fromIdx) {
            // Keine Änderung, aber Nummer normalisieren
            updateActivePlan({ stations: stations.map((s, i) => ({ ...s, number: (i + 1).toString() })) });
            return;
        }
        const [moved] = stations.splice(fromIdx, 1);
        stations.splice(toIdx, 0, moved);
        stations.forEach((s, i) => { s.number = (i + 1).toString(); });
        updateActivePlan({ stations });
    };

    const handleMouseUp = () => {
        if (draggedItem && activePlan) {
            if (draggedItem.type === 'target') {
                const updatedStations = resolveColorConflicts(draggedItem.id, activePlan.stations);
                if (updatedStations !== activePlan.stations) {
                    updateActivePlan({ stations: updatedStations });
                }
            }
        }
        setDraggedItem(null);
    };

    const getMapCoords = (e: React.MouseEvent) => {
        if (!containerRef.current) return null;
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
        };
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
        const masks = [...(activePlan?.masks || []), { points: currentMaskPoints }];
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

    // ── Overlay drag helpers ────────────────────────────────────
    const getContainerPercent = (clientX: number, clientY: number) => {
        if (!containerRef.current) return null;
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: ((clientX - rect.left) / rect.width) * 100,
            y: ((clientY - rect.top) / rect.height) * 100,
        };
    };

    const startOverlayDrag = (
        type: 'logo' | 'label' | 'logo-resize' | 'label-resize',
        clientX: number,
        clientY: number,
    ) => {
        const logo = activePlan?.logoOverlay;
        const label = activePlan?.labelOverlay;
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
            updateActivePlan({ logoOverlay: { ...(activePlan?.logoOverlay ?? { x: 5, y: 5, size: 20 }), size: newSize } });
        } else if (draggingOverlay === 'logo') {
            updateActivePlan({ logoOverlay: { ...(activePlan?.logoOverlay ?? { x: 5, y: 5, size: 20 }), x: overlayDragStart.current.elemX + dx, y: overlayDragStart.current.elemY + dy } });
        } else if (draggingOverlay === 'label') {
            updateActivePlan({ labelOverlay: { ...(activePlan?.labelOverlay ?? { x: 5, y: 5, text: 'LAGEPLAN', fontSize: 24 }), x: overlayDragStart.current.elemX + dx, y: overlayDragStart.current.elemY + dy } });
        } else if (draggingOverlay === 'label-resize') {
            const newFontSize = Math.max(10, Math.min(120, (overlayDragStart.current.fontSize ?? 24) + dxPx * 0.3));
            updateActivePlan({ labelOverlay: { ...(activePlan?.labelOverlay ?? { x: 5, y: 5, text: 'LAGEPLAN', fontSize: 24 }), fontSize: newFontSize } });
        }
    };

    const stopOverlayDrag = () => {
        setDraggingOverlay(null);
        overlayDragStart.current = null;
    };

    const addLogoOverlay = () => {
        if (activePlan?.logoOverlay) return;
        updateActivePlan({ logoOverlay: { x: 5, y: 5, size: 20 } });
    };

    const addLabelOverlay = () => {
        if (activePlan?.labelOverlay) return;
        updateActivePlan({ labelOverlay: { x: 5, y: 12, text: 'LAGEPLAN', fontSize: 24 } });
    };

    return (
        <div className="flex h-screen w-full flex-col bg-[#fdfdfd] text-[#1a1a1a] font-sans selection:bg-[#e8f7fb]">
            {/* Header */}
            <header className="flex flex-col border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex h-14 items-center justify-between px-4 sm:px-8">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            onClick={onBack}
                            disabled={isSaving}
                            className="h-8 w-8 rounded-lg bg-[#6bbfd4] flex items-center justify-center text-white shrink-0 hover:bg-[#5aaec3] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                            title={isSaving ? 'Wird gespeichert…' : 'Zurück zur Übersicht'}
                        >
                            {isSaving
                                ? <Loader2 className="w-5 h-5 animate-spin" />
                                : <ChevronLeft className="w-5 h-5" />
                            }
                        </button>
                        <input
                            value={plan.title}
                            onChange={(e) => updateActivePlan({ title: e.target.value })}
                            className="text-lg font-bold tracking-tight bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1 min-w-0 w-full"
                            title="Titel bearbeiten"
                            maxLength={100}
                        />
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6">
                        <nav className="flex bg-gray-100 rounded-full p-1 border">
                            <button
                                onClick={() => setActiveTab('map')}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'map' ? "bg-white shadow-sm text-[#6bbfd4]" : "text-gray-500 hover:text-gray-700"
                                )}>
                                <MapIcon className="w-4 h-4" /> <span className="hidden xs:inline">Lageplan</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('table')}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'table' ? "bg-white shadow-sm text-[#6bbfd4]" : "text-gray-500 hover:text-gray-700"
                                )}>
                                <List className="w-4 h-4" /> <span className="hidden xs:inline">Tabelle</span>
                            </button>
                            <button
                                onClick={() => { setActiveTab('templates'); ensureTemplatesLoaded(); }}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'templates' ? "bg-white shadow-sm text-[#6bbfd4]" : "text-gray-500 hover:text-gray-700"
                                )}>
                                <BookTemplate className="w-4 h-4" /> <span className="hidden xs:inline">Vorlagen</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('nachdenk')}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'nachdenk' ? "bg-white shadow-sm text-[#6bbfd4]" : "text-gray-500 hover:text-gray-700"
                                )}>
                                <BookOpen className="w-4 h-4" /> <span className="hidden xs:inline">Nachdenk-Texte</span>
                            </button>
                        </nav>

                        <div className="hidden sm:flex items-center bg-gray-100 rounded-full px-3 py-1 border focus-within:ring-2 ring-[#6bbfd4]/30 transition-all">
                            <Link className="w-4 h-4 text-gray-400 mr-2" />
                            <input
                                type="text"
                                placeholder="Import URL (jugendarbeit.online)"
                                className="bg-transparent border-none outline-none text-sm w-48 h-8"
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleImport()}
                            />
                            <button
                                onClick={handleImport}
                                disabled={isImporting}
                                className="ml-2 bg-[#6bbfd4] text-white px-3 py-1 rounded-full text-xs font-semibold hover:bg-[#5aaec3] active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isImporting ? '...' : 'Import'}
                            </button>
                        </div>
                    </div>
                </div>
                {/* Mobile URL import bar */}
                <div className="sm:hidden flex items-center bg-gray-100 mx-4 mb-2 rounded-full px-3 py-1 border focus-within:ring-2 ring-[#6bbfd4]/30 transition-all">
                    <Link className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
                    <input
                        type="text"
                        placeholder="Import URL"
                        className="bg-transparent border-none outline-none text-sm flex-1 h-8 min-w-0"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleImport()}
                    />
                    <button
                        onClick={handleImport}
                        disabled={isImporting}
                        className="ml-2 bg-[#6bbfd4] text-white px-3 py-1 rounded-full text-xs font-semibold hover:bg-[#5aaec3] active:scale-95 transition-all disabled:opacity-50 shrink-0"
                    >
                        {isImporting ? '...' : 'Import'}
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Content */}
                <main className="flex-1 relative bg-gray-100 overflow-hidden flex flex-col">
                    {activeTab === 'map' ? (
                        <div className="flex-1 flex flex-col overflow-hidden relative">
                            <div className="absolute top-3 right-3 z-40 flex flex-wrap gap-2 justify-end max-w-[calc(100%-1.5rem)]">
                                <button
                                    onClick={addStation}
                                    className="flex items-center gap-2 px-3 py-2 bg-white text-[#6bbfd4] rounded-full shadow-lg border border-[#6bbfd4]/20 cursor-pointer hover:bg-[#6bbfd4]/10 transition-all active:scale-95 text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Station</span>
                                </button>
                                <button
                                    onClick={handleDistributeColors}
                                    className="flex items-center gap-2 px-3 py-2 bg-white text-gray-600 rounded-full shadow-lg border cursor-pointer hover:bg-gray-50 transition-all active:scale-95 text-sm font-medium"
                                    title="Farben gleichmäßig verteilen"
                                >
                                    <Palette className="w-4 h-4" />
                                    <span className="hidden sm:inline">Farben</span>
                                </button>
                                {activePlan?.backgroundImage && (
                                    <div className="flex items-center bg-white rounded-full shadow-lg border overflow-hidden">
                                        <button
                                            onClick={zoomOut}
                                            disabled={currentZoom <= ZOOM_STEPS[0]}
                                            className="px-2 py-2 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                                            title="Hintergrundbild verkleinern"
                                        >
                                            <ZoomOut className="w-4 h-4 text-gray-600" />
                                        </button>
                                        <select
                                            value={currentZoom}
                                            onChange={(e) => updateActivePlan({ bgZoom: Number(e.target.value) })}
                                            className="text-xs font-medium text-gray-600 bg-transparent border-none outline-none px-1 cursor-pointer"
                                            title="Zoom-Stufe"
                                        >
                                            {ZOOM_STEPS.map(z => (
                                                <option key={z} value={z}>{Math.round(z * 100)}%</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={zoomIn}
                                            disabled={currentZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                                            className="px-2 py-2 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                                            title="Hintergrundbild vergrößern"
                                        >
                                            <ZoomIn className="w-4 h-4 text-gray-600" />
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
                                <label className="flex items-center gap-2 px-3 py-2 bg-white rounded-full shadow-lg border cursor-pointer hover:bg-gray-50 transition-all active:scale-95 text-sm font-medium">
                                    <Upload className="w-4 h-4 text-[#6bbfd4]" />
                                    <span className="hidden sm:inline">Lageplan hochladen</span>
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
                                        maskDrawing ? "bg-[#6bbfd4] text-white border-[#6bbfd4]" : "bg-white text-gray-600 hover:bg-gray-50"
                                    )}
                                    title="Weiße Maske zeichnen"
                                >
                                    <PenLine className="w-4 h-4" />
                                    <span className="hidden sm:inline">{maskDrawing ? 'Abbrechen' : 'Maske'}</span>
                                </button>
                                {maskDrawing && currentMaskPoints.length >= 3 && (
                                    <button
                                        onClick={() => {
                                            const masks = [...(activePlan?.masks || []), { points: currentMaskPoints }];
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
                                {(activePlan?.masks?.length ?? 0) > 0 && !maskDrawing && (
                                    <button
                                        onClick={clearMasks}
                                        className="flex items-center gap-2 px-3 py-2 bg-white text-red-400 rounded-full shadow-lg border cursor-pointer hover:bg-red-50 transition-all active:scale-95 text-sm font-medium"
                                        title="Alle Masken löschen"
                                    >
                                        <Eraser className="w-4 h-4" />
                                        <span className="hidden sm:inline">Masken löschen</span>
                                    </button>
                                )}
                                {!activePlan?.logoOverlay && (
                                    <button
                                        onClick={addLogoOverlay}
                                        className="flex items-center gap-2 px-3 py-2 bg-white text-gray-600 rounded-full shadow-lg border cursor-pointer hover:bg-gray-50 transition-all active:scale-95 text-sm font-medium"
                                        title="Logo hinzufügen"
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                        <span className="hidden sm:inline">Logo</span>
                                    </button>
                                )}
                                {activePlan?.logoOverlay && (
                                    <button
                                        onClick={() => updateActivePlan({ logoOverlay: undefined })}
                                        className="flex items-center gap-2 px-3 py-2 bg-white text-red-400 rounded-full shadow-lg border cursor-pointer hover:bg-red-50 transition-all active:scale-95 text-sm font-medium"
                                        title="Logo entfernen"
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                        <span className="hidden sm:inline">Logo entfernen</span>
                                    </button>
                                )}
                                {!activePlan?.labelOverlay && (
                                    <button
                                        onClick={addLabelOverlay}
                                        className="flex items-center gap-2 px-3 py-2 bg-white text-gray-600 rounded-full shadow-lg border cursor-pointer hover:bg-gray-50 transition-all active:scale-95 text-sm font-medium"
                                        title="Überschrift hinzufügen"
                                    >
                                        <Type className="w-4 h-4" />
                                        <span className="hidden sm:inline">Überschrift</span>
                                    </button>
                                )}
                                {activePlan?.labelOverlay && (
                                    <button
                                        onClick={() => updateActivePlan({ labelOverlay: undefined })}
                                        className="flex items-center gap-2 px-3 py-2 bg-white text-red-400 rounded-full shadow-lg border cursor-pointer hover:bg-red-50 transition-all active:scale-95 text-sm font-medium"
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
                                    style={{ cursor: maskDrawing ? 'crosshair' : undefined, touchAction: 'none' }}
                                >
                                    {/* Zoom-Wrapper: Hintergrundbild + Masken skalieren gemeinsam */}
                                    <div
                                        className="absolute inset-0 pointer-events-none origin-center"
                                        style={{ transform: `scale(${currentZoom})` }}
                                    >
                                        {activePlan?.backgroundImage && (
                                            <div className="absolute inset-0 select-none overflow-hidden">
                                                <img
                                                    src={activePlan.backgroundImage}
                                                    className="w-full h-full object-contain opacity-50"
                                                    alt="Lageplan Background"
                                                />
                                            </div>
                                        )}

                                        {/* Inverted white masks: white everywhere, polygon cuts out hole */}
                                        {activePlan && (activePlan.masks?.length ?? 0) > 0 && (
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

                                    {!activePlan?.backgroundImage && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 bg-gray-50/50 pointer-events-none">
                                            <MapIcon className="w-16 h-16 mb-4 opacity-10" />
                                            <p className="text-lg font-medium">Kein Lageplan vorhanden</p>
                                            <p className="text-sm mt-1">Bild hochladen oder mit <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-mono text-xs">⌘V</kbd> aus Zwischenablage einfügen.</p>
                                        </div>
                                    )}

                                    {activePlan && (
                                        <div className="absolute inset-0 select-none">
                                            <svg data-export-hidden className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-20">
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
                                                                    className={cn("font-mono font-bold uppercase leading-tight line-clamp-5 tracking-tight w-full", s.isFilled ? "text-white" : "text-gray-300")}
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
                                    )}

                                    {/* Logo Overlay */}
                                    {activePlan?.logoOverlay && (() => {
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
                                    {activePlan?.labelOverlay && (() => {
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
                    ) : activeTab === 'nachdenk' ? (
                        <NachdenktexteTab activePlan={activePlan} updateActivePlan={updateActivePlan} />
                    ) : (
                        <div ref={tableRef} className="flex-1 overflow-auto p-4 sm:p-12" style={{ overscrollBehavior: 'contain' }}>
                            <div className="flex justify-end mb-4">
                                <button
                                    onClick={exportTableToPDF}
                                    className="flex items-center gap-2 px-4 py-2 bg-[#6bbfd4] text-white rounded-full shadow-lg border-none cursor-pointer hover:bg-[#5aaec3] transition-all active:scale-95 text-sm font-medium"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden sm:inline">Tabelle als PDF</span>
                                </button>
                            </div>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-200"
                            >
                                <div className="overflow-x-auto" style={{ overscrollBehavior: 'contain' }}>
                                <table className="w-full text-left border-collapse min-w-[700px]">
                                    <thead>
                                        <tr className="bg-gray-50 border-b">
                                            <th className="p-4 w-8"></th>
                                            <th className="p-4 w-10 text-xs font-bold uppercase text-gray-400 tracking-wider">Nr.</th>
                                            <th className="p-4 w-32 text-xs font-bold uppercase text-gray-400 tracking-wider">Station</th>
                                            <th className="p-4 w-48 text-xs font-bold uppercase text-gray-400 tracking-wider">Beschreibung</th>
                                            <th className="p-4 w-96 text-xs font-bold uppercase text-gray-400 tracking-wider">Material</th>
                                            <th className="p-4 w-40 text-xs font-bold uppercase text-gray-400 tracking-wider">Gesprächsimpulse</th>
                                            <th className="p-4 w-28 text-xs font-bold uppercase text-gray-400 tracking-wider">Aufbau</th>
                                            <th className="p-4 w-28 text-xs font-bold uppercase text-gray-400 tracking-wider">Durchführung</th>
                                            <th className="p-4 w-12 text-xs font-bold uppercase text-gray-400 tracking-wider">Stempelfeld</th>
                                            <th className="p-4 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {activePlan?.stations.map(s => (
                                            <tr
                                                key={s.id}
                                                draggable
                                                onDragStart={() => handleRowDragStart(s.id)}
                                                onDragOver={(e) => handleRowDragOver(e, s.id)}
                                                onDrop={() => handleRowDrop(s.id)}
                                                onDragEnd={handleRowDragEnd}
                                                className={cn(
                                                    "hover:bg-gray-50/50 transition-colors",
                                                    draggedRowId === s.id && "opacity-40",
                                                    dragOverRowId === s.id && "border-t-2 border-[#6bbfd4]"
                                                )}
                                            >
                                                <td className="p-4 w-8 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400">
                                                    <GripVertical className="w-4 h-4" />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        type="number"
                                                        defaultValue={s.number}
                                                        key={s.number}
                                                        min={1}
                                                        className="w-10 font-medium text-[#6bbfd4] bg-transparent border-none p-0 focus:ring-0 focus:bg-[#6bbfd4]/10 rounded text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                (e.target as HTMLInputElement).blur();
                                                            }
                                                        }}
                                                        onBlur={(e) => handleRowReorder(s.id, e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-4 align-top">
                                                    <textarea
                                                        value={s.name}
                                                        onChange={(e) => updateStation(s.id, { name: e.target.value })}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 font-bold resize-none overflow-hidden h-auto"
                                                        style={{ touchAction: 'pan-y' }}
                                                        rows={1}
                                                        onInput={(e) => {
                                                            const t = e.target as HTMLTextAreaElement;
                                                            t.style.height = 'auto';
                                                            t.style.height = t.scrollHeight + 'px';
                                                        }}
                                                    />
                                                </td>
                                                <td className="p-4 align-top">
                                                    <textarea
                                                        value={s.description}
                                                        onChange={(e) => updateStation(s.id, { description: e.target.value })}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm h-auto min-h-[4rem] resize-none overflow-hidden"
                                                        style={{ touchAction: 'pan-y' }}
                                                        placeholder="Keine Beschreibung..."
                                                        onInput={(e) => {
                                                            const target = e.target as HTMLTextAreaElement;
                                                            target.style.height = 'auto';
                                                            target.style.height = target.scrollHeight + 'px';
                                                        }}
                                                    />
                                                </td>
                                                <td className="p-4 align-top">
                                                    <textarea
                                                        value={s.material}
                                                        onChange={(e) => updateStation(s.id, { material: e.target.value })}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-xs h-auto min-h-[4rem] resize-none overflow-hidden text-gray-500"
                                                        style={{ touchAction: 'pan-y' }}
                                                        placeholder="Kein Material..."
                                                        onInput={(e) => {
                                                            const target = e.target as HTMLTextAreaElement;
                                                            target.style.height = 'auto';
                                                            target.style.height = target.scrollHeight + 'px';
                                                        }}
                                                    />
                                                </td>
                                                <td className="p-4 align-top">
                                                    <textarea
                                                        value={(s.impulses || []).join('\n')}
                                                        onChange={(e) => updateStation(s.id, { impulses: e.target.value.split('\n').filter(l => l.trim()) })}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm h-auto min-h-[4rem] resize-none overflow-hidden text-gray-500"
                                                        style={{ touchAction: 'pan-y' }}
                                                        placeholder="Keine Impulse..."
                                                        onInput={(e) => {
                                                            const target = e.target as HTMLTextAreaElement;
                                                            target.style.height = 'auto';
                                                            target.style.height = target.scrollHeight + 'px';
                                                        }}
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <textarea
                                                        value={s.setupBy}
                                                        onChange={(e) => {
                                                            updateStation(s.id, { setupBy: e.target.value });
                                                            e.target.style.height = 'auto';
                                                            e.target.style.height = e.target.scrollHeight + 'px';
                                                        }}
                                                        onInput={(e) => {
                                                            const t = e.target as HTMLTextAreaElement;
                                                            t.style.height = 'auto';
                                                            t.style.height = t.scrollHeight + 'px';
                                                        }}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm resize-none overflow-hidden"
                                                        placeholder="Name..."
                                                        rows={1}
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <textarea
                                                        value={s.conductedBy}
                                                        onChange={(e) => {
                                                            updateStation(s.id, { conductedBy: e.target.value });
                                                            e.target.style.height = 'auto';
                                                            e.target.style.height = e.target.scrollHeight + 'px';
                                                        }}
                                                        onInput={(e) => {
                                                            const t = e.target as HTMLTextAreaElement;
                                                            t.style.height = 'auto';
                                                            t.style.height = t.scrollHeight + 'px';
                                                        }}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm resize-none overflow-hidden"
                                                        placeholder="Name..."
                                                        rows={1}
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={s.isFilled || false}
                                                        onChange={(e) => updateStation(s.id, { isFilled: e.target.checked })}
                                                        className="rounded text-[#6bbfd4] focus:ring-[#6bbfd4] border-gray-300"
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleSaveAsTemplate(s)}
                                                            className="p-2 -m-2 text-gray-300 hover:text-[#6bbfd4] transition-colors opacity-0 group-hover:opacity-100"
                                                            title="Als Vorlage speichern"
                                                        >
                                                            <Bookmark className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteStation(s.id)}
                                                            className="p-2 -m-2 text-gray-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                                <div className="flex border-t divide-x">
                                    <button
                                        onClick={addStation}
                                        className="flex-1 p-5 text-gray-400 hover:text-[#6bbfd4] hover:bg-[#6bbfd4]/10 transition-all flex items-center justify-center gap-2 font-medium"
                                    >
                                        <Plus className="w-5 h-5" /> Station hinzufügen
                                    </button>
                                    <button
                                        onClick={() => { ensureTemplatesLoaded(); setShowTemplatePicker(true); }}
                                        className="flex-1 p-5 text-gray-400 hover:text-[#6bbfd4] hover:bg-[#6bbfd4]/10 transition-all flex items-center justify-center gap-2 font-medium"
                                    >
                                        <BookTemplate className="w-5 h-5" /> Aus Vorlage
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {activeTab === 'templates' && (
                        <div className="flex-1 overflow-auto p-4 sm:p-8">
                            <div className="max-w-2xl mx-auto">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold text-gray-900">Vorlagen</h2>
                                    <button
                                        onClick={handleCreateBlankTemplate}
                                        className="flex items-center gap-2 px-4 py-2 bg-[#6bbfd4] text-white rounded-xl text-sm font-medium hover:bg-[#5aaec3] active:scale-[0.98] transition-all"
                                    >
                                        <Plus className="w-4 h-4" /> Neue Vorlage
                                    </button>
                                </div>
                                {!templatesLoaded ? (
                                    <p className="text-center py-12 text-gray-400">Wird geladen…</p>
                                ) : templates.length === 0 ? (
                                    <div className="text-center py-12">
                                        <p className="text-gray-400 mb-4">Noch keine Vorlagen vorhanden.</p>
                                        <button
                                            onClick={handleCreateBlankTemplate}
                                            className="px-5 py-2.5 bg-[#6bbfd4] text-white rounded-xl text-sm font-medium hover:bg-[#5aaec3] transition-all"
                                        >
                                            Erste Vorlage erstellen
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {templates.map(t => (
                                            <div key={t.id} className="bg-white rounded-2xl border p-4 group">
                                                {editingTemplateId === t.id ? (
                                                    <div className="space-y-3">
                                                        <input
                                                            value={editingTemplateData.name ?? ''}
                                                            onChange={(e) => setEditingTemplateData(d => ({ ...d, name: e.target.value }))}
                                                            className="w-full font-semibold border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                                                            placeholder="Name…"
                                                        />
                                                        <textarea
                                                            value={editingTemplateData.description ?? ''}
                                                            onChange={(e) => setEditingTemplateData(d => ({ ...d, description: e.target.value }))}
                                                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                                                            placeholder="Beschreibung…"
                                                            rows={2}
                                                        />
                                                        <textarea
                                                            value={editingTemplateData.material ?? ''}
                                                            onChange={(e) => setEditingTemplateData(d => ({ ...d, material: e.target.value }))}
                                                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                                                            placeholder="Material…"
                                                            rows={2}
                                                        />
                                                        <textarea
                                                            value={(editingTemplateData.impulses ?? []).join('\n')}
                                                            onChange={(e) => setEditingTemplateData(d => ({ ...d, impulses: e.target.value.split('\n').filter(l => l.trim()) }))}
                                                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                                                            placeholder="Gesprächsimpulse (je Zeile ein Impuls)…"
                                                            rows={3}
                                                        />
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <input
                                                                value={editingTemplateData.setupBy ?? ''}
                                                                onChange={(e) => setEditingTemplateData(d => ({ ...d, setupBy: e.target.value }))}
                                                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                                                                placeholder="Aufbau…"
                                                            />
                                                            <input
                                                                value={editingTemplateData.conductedBy ?? ''}
                                                                onChange={(e) => setEditingTemplateData(d => ({ ...d, conductedBy: e.target.value }))}
                                                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                                                                placeholder="Durchführung…"
                                                            />
                                                        </div>
                                                        <div className="flex gap-2 justify-end">
                                                            <button
                                                                onClick={() => { setEditingTemplateId(null); setEditingTemplateData({}); }}
                                                                className="px-3 py-1.5 text-sm text-gray-500 border rounded-lg hover:bg-gray-50"
                                                            >Abbrechen</button>
                                                            <button
                                                                onClick={handleSaveTemplateEdit}
                                                                className="px-3 py-1.5 text-sm bg-[#6bbfd4] text-white rounded-lg hover:bg-[#5aaec3]"
                                                            >Speichern</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-semibold text-gray-900 text-sm">{t.name || '(Kein Name)'}</p>
                                                            {t.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>}
                                                            {t.material && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">Material: {t.material}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => { setEditingTemplateId(t.id); setEditingTemplateData(t); }}
                                                                className="p-1.5 text-gray-400 hover:text-[#6bbfd4] transition-colors"
                                                                title="Bearbeiten"
                                                            ><Pencil className="w-4 h-4" /></button>
                                                            <button
                                                                onClick={() => handleDeleteTemplate(t.id, t.name)}
                                                                className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                                                                title="Löschen"
                                                            ><Trash2 className="w-4 h-4" /></button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="px-4 sm:px-8 py-4 bg-white border-t flex items-center justify-between text-xs text-gray-400">
                        <p>© 2026 Erlebnis Kirche Planner · v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
                        <div className="flex gap-4">
                            <label className="hover:text-gray-600 transition-colors cursor-pointer flex items-center gap-1" title="Backup laden (.rki)">
                                <Upload className="w-4 h-4" />
                                <span className="hidden sm:inline">Backup laden</span>
                                <input type="file" className="hidden" accept=".rki" onChange={handleBackupImport} />
                            </label>
                            <button
                                onClick={() => {
                                    const data = JSON.stringify([plan]);
                                    const blob = new Blob([data], { type: 'application/octet-stream' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    const safeName = plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
                                    a.download = `erki-${safeName}-${new Date().toISOString().split('T')[0]}.rki`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="hover:text-gray-600 transition-colors"
                                title="Diese Planung als .rki exportieren"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </main>
            </div>

            {showTemplatePicker && (
                <TemplatePickerDialog
                    templates={templates}
                    onSelect={handleApplyTemplate}
                    onClose={() => setShowTemplatePicker(false)}
                />
            )}
        </div>
    );
}
