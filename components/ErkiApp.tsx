'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Map as MapIcon, List, Download, Upload, Link, Info, Move, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plan, Station } from '@/lib/types';
import { importPlanFromUrl } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

export default function ErkiApp() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [activeTab, setActiveTab] = useState<'map' | 'table'>('map');
    const [aspectRatio, setAspectRatio] = useState<'portrait' | 'landscape'>('landscape');
    const [draggedItem, setDraggedItem] = useState<{ id: string; type: 'bubble' | 'target' } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    // Persistence and aspect ratio detection
    useEffect(() => {
        const saved = localStorage.getItem('erki_plans');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setPlans(parsed);
                if (parsed.length > 0) {
                    // eslint-disable-next-line react-hooks/set-state-in-effect
                    setActivePlanId(parsed[0].id);
                }
            } catch (e) {
                console.error('Failed to load plans', e);
            }
        }
    }, []);

    useEffect(() => {
        if (plans.length > 0) {
            localStorage.setItem('erki_plans', JSON.stringify(plans));
        }
    }, [plans]);

    const activePlan = plans.find(p => p.id === activePlanId);

    useEffect(() => {
        if (activePlan?.backgroundImage) {
            const img = new Image();
            img.onload = () => {
                setAspectRatio(img.width >= img.height ? 'landscape' : 'portrait');
            };
            img.src = activePlan.backgroundImage;
        }
    }, [activePlan?.backgroundImage]);

    const handleImport = async () => {
        if (!importUrl) return;
        setIsImporting(true);
        const result = await importPlanFromUrl(importUrl);
        if (result.success && result.data) {
            const newPlan: Plan = {
                id: crypto.randomUUID(),
                title: result.data.title,
                url: importUrl,
                stations: result.data.stations,
            };
            setPlans(prev => [newPlan, ...prev]);
            setActivePlanId(newPlan.id);
            setImportUrl('');
        } else {
            alert('Import fehlgeschlagen: ' + result.error);
        }
        setIsImporting(false);
    };

    const handleCreatePlan = () => {
        const newPlan: Plan = {
            id: crypto.randomUUID(),
            title: 'Neuer Plan',
            stations: [],
        };
        setPlans(prev => [newPlan, ...prev]);
        setActivePlanId(newPlan.id);
    };

    const updateActivePlan = (updates: Partial<Plan>) => {
        if (!activePlanId) return;
        setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, ...updates } : p));
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
                    // Basic validation: check if it looks like an array of plans
                    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id && parsed[0].stations) {
                        setPlans(parsed);
                        setActivePlanId(parsed[0].id);
                        alert('Backup erfolgreich geladen!');
                    } else {
                        alert('Ungültiges Dateiformat. Bitte eine gültige Erki-Backup-Datei wählen.');
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

        try {
            // Temporarily remove shadow and border for clean white PDF output
            const container = containerRef.current;
            const originalShadow = container.style.boxShadow;
            const originalBorder = container.style.border;
            container.style.boxShadow = 'none';
            container.style.border = 'none';

            // Also temporarily remove shadows and tricky rendering classes from stations for print usage
            const shadowNodes = container.querySelectorAll('.shadow-xl, .shadow-lg');
            const originalShadows: string[] = [];
            const originalClasses: { el: HTMLElement, classes: string }[] = [];

            shadowNodes.forEach((node: Element) => {
                const el = node as HTMLElement;
                originalShadows.push(el.style.boxShadow);
                el.style.boxShadow = 'none';

                // Store and remove classes that might cause artifacts in html-to-image
                originalClasses.push({ el, classes: el.className });
                el.classList.remove('backdrop-blur', 'transition-all', 'duration-200');
            });

            const dataUrl = await toPng(container, {
                quality: 1,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
                style: {
                    margin: '0',
                    padding: '0'
                }
            });

            // Restore original styles
            container.style.boxShadow = originalShadow;
            container.style.border = originalBorder;
            shadowNodes.forEach((node: Element, i: number) => {
                const el = node as HTMLElement;
                el.style.boxShadow = originalShadows[i] || '';
            });

            // Restore original classes
            originalClasses.forEach(({ el, classes }) => {
                el.className = classes;
            });

            const pdf = new jsPDF({
                orientation: aspectRatio,
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const sanitizedTitle = activePlan.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'lageplan';

            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${sanitizedTitle}.pdf`);
        } catch (error) {
            console.error('PDF export failed:', error);
            alert('PDF Export fehlgeschlagen. Bitte versuche es erneut.');
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
        const stations = activePlan.stations.map((s, i) => ({
            ...s,
            colorVariant: i % 4
        }));
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

    const handleMouseUp = () => {
        if (draggedItem && activePlan) {
            // Only check conflicts if we moved a marker
            if (draggedItem.type === 'target') {
                const updatedStations = resolveColorConflicts(draggedItem.id, activePlan.stations);
                if (updatedStations !== activePlan.stations) {
                    updateActivePlan({ stations: updatedStations });
                }
            }
        }
        setDraggedItem(null);
    };

    return (
        <div className="flex h-screen w-full flex-col bg-[#fdfdfd] text-[#1a1a1a] font-sans selection:bg-[#ffedd5]">
            {/* Header */}
            <header className="flex h-16 items-center justify-between border-b px-8 bg-white/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold">EK</div>
                    <h1 className="text-xl font-bold tracking-tight">Erlebnis Kirche Planner</h1>
                </div>

                <div className="flex items-center gap-6">
                    <nav className="flex bg-gray-100 rounded-full p-1 border">
                        <button
                            onClick={() => setActiveTab('map')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                                activeTab === 'map' ? "bg-white shadow-sm text-orange-600" : "text-gray-500 hover:text-gray-700"
                            )}>
                            <MapIcon className="w-4 h-4" /> Lageplan
                        </button>
                        <button
                            onClick={() => setActiveTab('table')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                                activeTab === 'table' ? "bg-white shadow-sm text-orange-600" : "text-gray-500 hover:text-gray-700"
                            )}>
                            <List className="w-4 h-4" /> Tabelle
                        </button>
                    </nav>

                    <div className="flex items-center bg-gray-100 rounded-full px-3 py-1 border focus-within:ring-2 ring-orange-200 transition-all">
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
                            className="ml-2 bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-semibold hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isImporting ? '...' : 'Import'}
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Content */}
                <main className="flex-1 relative bg-gray-100 overflow-hidden flex flex-col">
                    {activeTab === 'map' ? (
                        <div className="flex-1 flex flex-col overflow-hidden relative">
                            <div className="absolute top-4 right-4 z-40 flex gap-2">
                                <button
                                    onClick={addStation}
                                    className="flex items-center gap-2 px-4 py-2 bg-white text-orange-600 rounded-full shadow-lg border border-orange-100 cursor-pointer hover:bg-orange-50 transition-all active:scale-95 text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    Station
                                </button>
                                <button
                                    onClick={renumberStations}
                                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 rounded-full shadow-lg border cursor-pointer hover:bg-gray-50 transition-all active:scale-95 text-sm font-medium"
                                    title="Neu nummerieren"
                                >
                                    <Move className="w-4 h-4" />
                                    Nummerieren
                                </button>
                                <button
                                    onClick={handleDistributeColors}
                                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 rounded-full shadow-lg border cursor-pointer hover:bg-gray-50 transition-all active:scale-95 text-sm font-medium"
                                    title="Farben gleichmäßig verteilen"
                                >
                                    <Palette className="w-4 h-4" />
                                    Farben
                                </button>
                                <button
                                    onClick={exportToPDF}
                                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-full shadow-lg border-none cursor-pointer hover:bg-orange-600 transition-all active:scale-95 text-sm font-medium"
                                >
                                    <Download className="w-4 h-4" />
                                    PDF Download
                                </button>
                                <label className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg border cursor-pointer hover:bg-gray-50 transition-all active:scale-95 text-sm font-medium">
                                    <Upload className="w-4 h-4 text-blue-500" />
                                    Lageplan hochladen
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                                </label>
                            </div>

                            <div className="flex-1 overflow-auto p-8 flex items-center justify-center">
                                <div
                                    ref={containerRef}
                                    className={cn(
                                        "relative bg-white shadow-2xl overflow-hidden border border-gray-200 transition-all duration-500",
                                        aspectRatio === 'landscape' ? "aspect-[297/210] h-auto w-full max-w-5xl" : "aspect-[210/297] w-auto h-full max-h-[80vh]"
                                    )}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                >
                                    {activePlan?.backgroundImage && (
                                        <div className="absolute inset-0 select-none pointer-events-none">
                                            <img
                                                src={activePlan.backgroundImage}
                                                className="w-full h-full object-contain opacity-50"
                                                alt="Lageplan Background"
                                            />
                                        </div>
                                    )}

                                    {!activePlan?.backgroundImage && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 bg-gray-50/50 pointer-events-none">
                                            <MapIcon className="w-16 h-16 mb-4 opacity-10" />
                                            <p className="text-lg font-medium">Kein Lageplan vorhanden</p>
                                            <p className="text-sm mt-1">Lade oben rechts ein Bild deiner Karte hoch.</p>
                                        </div>
                                    )}

                                    {activePlan && (
                                        <div className="absolute inset-0 select-none">
                                            <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
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
                                                    { style: { borderColor: "#8CD7E5", backgroundColor: "white" }, bg: "#8CD7E5" }, // Cyan
                                                    { style: { borderColor: "#AAA9E4", backgroundColor: "white" }, bg: "#AAA9E4" }, // Lavender
                                                    { style: { borderColor: "#A1E9BD", backgroundColor: "white" }, bg: "#A1E9BD" }, // Mint
                                                    { style: { borderColor: "#EA99C0", backgroundColor: "white" }, bg: "#EA99C0" }, // Pink
                                                ];
                                                // Use explicit colorVariant if available, otherwise fallback to index/number based
                                                const colorIndex = s.colorVariant ?? (idx % colors.length);
                                                const color = colors[colorIndex % colors.length];
                                                const fontSize = s.name.length > 30 ? 'text-[10px]' : s.name.length > 15 ? 'text-xs' : 'text-sm';

                                                return (
                                                    <React.Fragment key={s.id}>
                                                        <div
                                                            className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full shadow-lg border-2 border-white cursor-move hover:scale-125 transition-transform active:scale-90 z-20"
                                                            style={{ left: `${s.targetX}%`, top: `${s.targetY}%`, backgroundColor: color.bg }}
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                setDraggedItem({ id: s.id, type: 'target' });
                                                            }}
                                                        />

                                                        <div
                                                            className="absolute w-24 h-24 -ml-12 -mt-12 rounded-full border-[6px] flex flex-col items-center justify-center p-2 text-center shadow-xl cursor-move bg-white/95 backdrop-blur transition-all duration-200 hover:ring-2 ring-gray-100 z-30"
                                                            style={{
                                                                left: `${s.x}%`,
                                                                top: `${s.y}%`,
                                                                ...(s.isFilled ? { backgroundColor: color.bg, borderColor: color.bg } : color.style),
                                                                hyphens: 'auto',
                                                                WebkitHyphens: 'auto'
                                                            }}
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                setDraggedItem({ id: s.id, type: 'bubble' });
                                                            }}
                                                        >
                                                            <span className={cn("font-black uppercase leading-tight line-clamp-5 break-words tracking-tight", fontSize, s.isFilled ? "text-white" : "text-gray-300")}>
                                                                {s.name}
                                                            </span>
                                                        </div>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto p-12">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-200"
                            >
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b">
                                            <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider">Nr.</th>
                                            <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider">Station</th>
                                            <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider">Beschreibung</th>
                                            <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider">Material</th>
                                            <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider">Aufbau</th>
                                            <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider">Durchführung</th>
                                            <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider">Voll</th>
                                            <th className="p-4"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {activePlan?.stations.map(s => (
                                            <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="p-4">
                                                    <input
                                                        value={s.number}
                                                        onChange={(e) => updateStation(s.id, { number: e.target.value })}
                                                        className="w-12 bg-transparent border-none p-0 focus:ring-0 font-medium text-orange-600"
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        value={s.name}
                                                        onChange={(e) => updateStation(s.id, { name: e.target.value })}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 font-bold"
                                                    />
                                                </td>
                                                <td className="p-4 align-top">
                                                    <textarea
                                                        value={s.description}
                                                        onChange={(e) => updateStation(s.id, { description: e.target.value })}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm h-auto min-h-[4rem] resize-none overflow-hidden"
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
                                                        placeholder="Kein Material..."
                                                        onInput={(e) => {
                                                            const target = e.target as HTMLTextAreaElement;
                                                            target.style.height = 'auto';
                                                            target.style.height = target.scrollHeight + 'px';
                                                        }}
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        value={s.setupBy}
                                                        onChange={(e) => updateStation(s.id, { setupBy: e.target.value })}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm"
                                                        placeholder="Name..."
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        value={s.conductedBy}
                                                        onChange={(e) => updateStation(s.id, { conductedBy: e.target.value })}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm"
                                                        placeholder="Name..."
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={s.isFilled || false}
                                                        onChange={(e) => updateStation(s.id, { isFilled: e.target.checked })}
                                                        className="rounded text-orange-500 focus:ring-orange-500 border-gray-300"
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <button
                                                        onClick={() => deleteStation(s.id)}
                                                        className="text-gray-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button
                                    onClick={addStation}
                                    className="w-full p-6 text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-all flex items-center justify-center gap-2 font-medium"
                                >
                                    <Plus className="w-5 h-5" /> Station hinzufügen
                                </button>
                            </motion.div>
                        </div>
                    )}

                    <div className="px-8 py-4 bg-white border-t flex items-center justify-between text-xs text-gray-400">
                        <p>© 2026 Erlebnis Kirche Planner | Made with ❤️ for community</p>
                        <div className="flex gap-4">
                            <label className="hover:text-gray-600 transition-colors cursor-pointer flex items-center gap-1" title="Backup laden">
                                <Upload className="w-4 h-4" />
                                <span className="hidden sm:inline">Backup laden</span>
                                <input type="file" className="hidden" accept=".json" onChange={handleBackupImport} />
                            </label>
                            <button
                                onClick={() => {
                                    const data = JSON.stringify(plans);
                                    const blob = new Blob([data], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `erki-plaene-${new Date().toISOString().split('T')[0]}.json`;
                                    a.click();
                                }}
                                className="hover:text-gray-600 transition-colors"
                                title="Export als JSON"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
