'use client';

import React, { useState, useEffect, useMemo, useRef, MutableRefObject } from 'react';
import { ChevronLeft, Plus, Trash2, List, Download, Upload, Link, BookTemplate, Pencil, Loader2, BookOpen, FileText, Map as MapIcon, CalendarDays } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { Plan, Station, StationTemplate } from '@/lib/types';
import { importPlanFromUrl } from '@/lib/actions';
import { loadTemplates, createTemplate, updateTemplate, deleteTemplate, loadPlanningFull } from '@/lib/db';
import ShareButton from './ShareButton';
import { cn } from '@/lib/utils';
import TemplatePickerDialog from './TemplatePickerDialog';
import NachdenktexteTab from '@/components/NachdenktexteTab';
import ExplanationPage from '@/components/ExplanationPage';
import MapView from '@/components/erki/MapView';
import StationsTable from '@/components/erki/StationsTable';
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync';
import { usePresence } from '@/lib/realtime/usePresence';
import { planningChannelNames } from '@/lib/realtime/channelNames';

interface ErkiAppProps {
    plan: Plan;
    user: User;
    onPlanUpdate: (plan: Plan) => void;
    // Externes Update durch anderen Client (Realtime) – triggert keinen Auto-Save.
    onExternalPlanUpdate?: (plan: Plan) => void;
    // Sofort-Speichern mit explizitem Plan-Argument (umgeht Ref-Timing-Probleme,
    // die bei addStation zu verlorenen Stationen führten, wenn der User direkt
    // danach "Zurück" klickte).
    onSaveNow: (plan: Plan) => Promise<void>;
    onBack: () => void;
    onImmediateSave?: () => void;
    isSaving?: boolean;
    latestPlanRef: MutableRefObject<Plan | null>;
    isDirtyRef: MutableRefObject<boolean>;
}

export default function ErkiApp({ plan, user, onPlanUpdate, onExternalPlanUpdate, onSaveNow, onBack, onImmediateSave, isSaving = false, latestPlanRef, isDirtyRef }: ErkiAppProps) {
    const router = useRouter();
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const tabKey = `activeTab_${plan.id}`;
    const [activeTab, setActiveTab] = useState<'map' | 'table' | 'templates' | 'nachdenk' | 'explanation'>(() => {
        const stored = sessionStorage.getItem(tabKey);
        return (stored as 'map' | 'table' | 'templates' | 'nachdenk' | 'explanation' | null) ?? 'table';
    });
    const [templates, setTemplates] = useState<StationTemplate[]>([]);
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [editingTemplateData, setEditingTemplateData] = useState<Partial<StationTemplate>>({});

    // Immer die aktuellste Version des Plans verwenden. latestPlanRef.current
    // wird in updateActivePlan synchron gesetzt, bevor React re-rendert — ist
    // also aktueller als das prop `plan`, wenn mehrere Updates im selben Tick
    // feuern (z. B. blur + click). Ohne diese Indirektion würden parallele
    // Calls wie updateStation(...) { stations: plan.stations.map(...) } mit
    // einem stale `plan` spreaden und eben gerade hinzugefügte Stationen
    // wieder aus latestPlanRef rausschreiben.
    const activePlan = latestPlanRef.current ?? plan;

    // Ref that always holds the current activeTab value — used inside realtime callbacks.
    const activeTabRef = useRef(activeTab);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    // Track whether background_image / explanation_data / masks / overlays have been loaded.
    // Reset whenever a different plan is opened.
    const fullDataLoadedRef = useRef(false);
    useEffect(() => { fullDataLoadedRef.current = false; }, [plan.id]);

    // If the session-restored tab is already a heavy tab, kick off the load immediately.
    useEffect(() => {
        if (activeTab === 'map' || activeTab === 'explanation') {
            void ensureFullDataLoaded();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan.id]);

    // Loads heavy fields (background_image, masks, overlays, explanation_data) from the DB
    // and merges them into the current plan state without marking the plan as dirty.
    const ensureFullDataLoaded = async () => {
        if (fullDataLoadedRef.current) return;
        fullDataLoadedRef.current = true;
        try {
            const full = await loadPlanningFull((latestPlanRef.current ?? plan).id);
            const base = latestPlanRef.current ?? plan;
            onExternalPlanUpdate?.({
                ...base,
                backgroundImage: base.backgroundImage ?? full.backgroundImage,
                masks: (base.masks && base.masks.length > 0) ? base.masks : (full.masks ?? []),
                logoOverlay: base.logoOverlay ?? full.logoOverlay,
                labelOverlay: base.labelOverlay ?? full.labelOverlay,
                explanationData: base.explanationData ?? full.explanationData,
            });
        } catch (e) {
            fullDataLoadedRef.current = false;
            console.error('[LazyLoad] Fehler beim Laden der Bilddaten:', e);
        }
    };

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
        // Belt-and-suspenders: Station-Add sofort persistieren, ohne auf den
        // 1.5s Auto-Save-Timer zu warten. Sequenzialisiert im Parent.
        onImmediateSave?.();
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

    useEffect(() => {
        sessionStorage.setItem(tabKey, activeTab);
    }, [activeTab, tabKey]);

    // Realtime-Sync: plannings-UPDATEs + stations-INSERT/UPDATE/DELETE.
    // Verhalten (Echo-Skip, Heavy-Field-Lazy-Loading, Cleanup beider Channels)
    // ist im Hook gekapselt — Logik unverändert gegenüber der ehemaligen
    // Inline-Implementierung. Siehe lib/realtime/useRealtimeSync.ts.
    const isOnHeavyTabRef = useRef(activeTab === 'map' || activeTab === 'explanation');
    useEffect(() => {
        isOnHeavyTabRef.current = activeTab === 'map' || activeTab === 'explanation';
    }, [activeTab]);
    useRealtimeSync({
        planId: plan.id,
        // Wenn der Parent kein onExternalPlanUpdate bereitstellt, machen wir
        // nichts — entspricht dem alten `if (!onExternalPlanUpdate) return;`.
        onExternalUpdate: onExternalPlanUpdate ?? (() => {}),
        latestPlanRef,
        isOnHeavyTabRef,
        enabled: !!onExternalPlanUpdate,
    });

    // Presence: dedizierter Channel pro Planung. Drei Hooks (sync/presence/
    // broadcast) müssen disjunkte Channel-Namen nutzen — sonst .on()-after-
    // .subscribe() Race auf Supabase-Singleton. Naming via planningChannelNames.
    const presenceUser = useMemo(() => ({
        userId: user.id,
        displayName:
            (user.user_metadata?.name as string | undefined) ||
            (user.user_metadata?.display_name as string | undefined) ||
            user.email ||
            'Unbekannt',
    }), [user.id, user.user_metadata?.name, user.user_metadata?.display_name, user.email]);

    const { online } = usePresence({
        channelName: planningChannelNames(plan.id).presence,
        payload: presenceUser,
    });

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
        // Als Basis die aktuellste Version nehmen – das prop `plan` kann stale
        // sein, wenn mehrere Updates im gleichen Event-Tick passieren.
        const base = latestPlanRef.current ?? plan;
        const newPlan = { ...base, ...updates };
        latestPlanRef.current = newPlan;
        isDirtyRef.current = true;
        onPlanUpdate(newPlan);
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
        // Nuclear option: Plan EXPLIZIT als Funktions-Argument übergeben –
        // kein Umweg über Refs, kein Timing-Risiko. onPlanUpdate für das
        // UI-State-Update, onSaveNow für den sofortigen Persistenz-Call mit
        // garantiert korrektem Plan-Inhalt (inkl. neuer Station).
        const newPlan: Plan = { ...activePlan, stations: [...activePlan.stations, newStation] };
        onPlanUpdate(newPlan);
        void onSaveNow(newPlan);
    };

    return (
        <div className="flex h-[100dvh] w-full flex-col bg-[#fdfdfd] text-[#1a1a1a] font-sans selection:bg-[#e8f7fb]">
            {/* Header */}
            <header className="flex flex-col border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex h-14 items-center justify-between px-4 sm:px-8">
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-4">
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
                            className="hidden sm:block text-lg font-bold tracking-tight bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1 min-w-0 w-full"
                            title="Titel bearbeiten"
                            maxLength={200}
                        />
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6">
                        <nav className="flex bg-gray-100 rounded-full p-1 border">
                            <button
                                onClick={() => { setActiveTab('map'); void ensureFullDataLoaded(); }}
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
                            <button
                                onClick={() => { setActiveTab('explanation'); void ensureFullDataLoaded(); }}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'explanation' ? "bg-white shadow-sm text-[#6bbfd4]" : "text-gray-500 hover:text-gray-700"
                                )}>
                                <FileText className="w-4 h-4" /> <span className="hidden xs:inline">Erklärung</span>
                            </button>
                            <button
                                onClick={() => router.push(`/planning/${plan.id}/zeitplan`)}
                                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all text-gray-500 hover:text-gray-700 hover:bg-white/60"
                                title="Zeitplan öffnen">
                                <CalendarDays className="w-4 h-4" /> <span className="hidden xs:inline">Zeitplan</span>
                            </button>
                        </nav>

                        <ShareButton planningId={plan.id} planningTitle={plan.title} />

                        <div className="hidden sm:flex items-center bg-gray-100 rounded-full px-3 py-1 border focus-within:ring-2 ring-[#6bbfd4]/30 transition-all">
                            <Link className="w-4 h-4 text-gray-500 mr-2" />
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
                {/* Mobile title row */}
                <div className="sm:hidden px-4 pb-1">
                    <input
                        value={plan.title}
                        onChange={(e) => updateActivePlan({ title: e.target.value })}
                        className="text-base font-bold tracking-tight bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1 w-full"
                        title="Titel bearbeiten"
                        maxLength={200}
                    />
                </div>
                {/* Mobile URL import bar */}
                <div className="sm:hidden flex items-center bg-gray-100 mx-4 mb-2 rounded-full px-3 py-1 border focus-within:ring-2 ring-[#6bbfd4]/30 transition-all">
                    <Link className="w-4 h-4 text-gray-500 mr-2 shrink-0" />
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
                        <MapView
                            activePlan={activePlan}
                            updateActivePlan={updateActivePlan}
                            onAddStation={addStation}
                            onlineUsers={online}
                            currentUser={presenceUser}
                        />
                    ) : activeTab === 'nachdenk' ? (
                        <NachdenktexteTab activePlan={activePlan} updateActivePlan={updateActivePlan} />
                    ) : activeTab === 'explanation' ? (
                        <ExplanationPage activePlan={activePlan} updateActivePlan={updateActivePlan} />
                    ) : activeTab === 'table' ? (
                        <StationsTable
                            activePlan={activePlan}
                            updateActivePlan={updateActivePlan}
                            onAddStation={addStation}
                            onOpenTemplatePicker={() => { ensureTemplatesLoaded(); setShowTemplatePicker(true); }}
                            onSaveAsTemplate={handleSaveAsTemplate}
                            onSaveNow={onSaveNow}
                            latestPlanRef={latestPlanRef}
                            onlineUsers={online}
                            currentUser={presenceUser}
                        />
                    ) : null}
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
                                    <p className="text-center py-12 text-gray-600">Wird geladen…</p>
                                ) : templates.length === 0 ? (
                                    <div className="text-center py-12">
                                        <p className="text-gray-600 mb-4">Noch keine Vorlagen vorhanden.</p>
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
                                                            {t.material && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">Material: {t.material}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => { setEditingTemplateId(t.id); setEditingTemplateData(t); }}
                                                                className="p-1.5 text-gray-500 hover:text-[#6bbfd4] transition-colors"
                                                                title="Bearbeiten"
                                                            ><Pencil className="w-4 h-4" /></button>
                                                            <button
                                                                onClick={() => handleDeleteTemplate(t.id, t.name)}
                                                                className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
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

                    <div className="px-4 sm:px-8 py-4 bg-white border-t flex items-center justify-between text-xs text-gray-500">
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
                                    const safeName = plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(?:^-+)|(?:-+$)/g, '') || 'plan';
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
