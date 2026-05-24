'use client';

import React, { useState, useEffect, useMemo, useRef, MutableRefObject } from 'react';
import { ChevronLeft, Plus, Trash2, List, Download, Upload, Loader2, BookOpen, FileText, Map as MapIcon, CalendarDays } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Plan, Station, StationTemplate, PlanningTask, TaskSection, DEFAULT_TASK_SECTIONS } from '@/lib/types';
import type { Phase, Task } from '@/components/zeitplan/types';
import { loadTemplates, createTemplate, updateTemplate, deleteTemplate, loadPlanningFull, loadPlanningTasks, createPlanningTask, deletePlanningTask, updatePlanningTask, updatePlanningTaskVolunteers } from '@/lib/db';
import ShareButton from './ShareButton';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';
import TemplatePickerDialog from './TemplatePickerDialog';
import NachdenktexteTab from '@/components/NachdenktexteTab';
import ExplanationPage from '@/components/ExplanationPage';
import MapView from '@/components/erki/MapView';
import StationsTable from '@/components/erki/StationsTable';
import ZeitplanView from '@/components/erki/ZeitplanView';
import RubrikenView from '@/components/erki/RubrikenView';
import { UndoToast } from '@/components/erki/UndoToast';
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync';
import { usePresence } from '@/lib/realtime/usePresence';
import { usePlanningTasksSync } from '@/lib/realtime/usePlanningTasksSync';
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

function stationsToPhases(stations: Station[]): Phase[] {
    const tasks: Task[] = stations.map(s => {
        const volunteers = [s.conductedBy, s.setupBy].filter(v => v && v.trim() !== '');
        return {
            id: s.id,
            name: `${s.number ? s.number + ' – ' : ''}${s.name}`,
            slots: 2,
            filled: volunteers.length,
            volunteers,
        };
    });
    if (tasks.length === 0) return [];
    return [{
        id: 'stationen',
        name: 'Stationen',
        description: 'Alle Stationen dieser Planung',
        time: '',
        tasks,
    }];
}

export default function ErkiApp({ plan, user, onPlanUpdate, onExternalPlanUpdate, onSaveNow, onBack, onImmediateSave, isSaving = false, latestPlanRef, isDirtyRef }: ErkiAppProps) {
    const tabKey = `activeTab_${plan.id}`;
    const [activeTab, setActiveTab] = useState<'map' | 'table' | 'nachdenk' | 'explanation' | 'zeitplan'>(() => {
        const stored = sessionStorage.getItem(tabKey);
        const valid: string[] = ['map', 'table', 'nachdenk', 'explanation', 'zeitplan'];
        return (valid.includes(stored ?? '') ? stored : 'table') as 'map' | 'table' | 'nachdenk' | 'explanation' | 'zeitplan';
    });
    const [zeitplanPhases, setZeitplanPhases] = useState<Phase[]>([]);
    const [zeitplanFilter, setZeitplanFilter] = useState<'all' | 'open' | 'mine'>('all');
    const zeitplanInitializedForPlanRef = useRef<string | null>(null);
    const [planningTasks, setPlanningTasks] = useState<PlanningTask[]>([]);
    const aufgabenLoadedForPlanRef = useRef<string | null>(null);

    // ── Undo-Toast ──────────────────────────────────────────────────────────
    type UndoEntry = { message: string; commit: () => Promise<void>; restore: () => void };
    const [undoDisplay, setUndoDisplay] = useState<{ key: string; message: string } | null>(null);
    const pendingUndoRef = useRef<UndoEntry | null>(null);
    const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showUndo = (entry: UndoEntry) => {
        // Commit any pending previous action immediately
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        if (pendingUndoRef.current) void pendingUndoRef.current.commit();
        pendingUndoRef.current = entry;
        setUndoDisplay({ key: String(Date.now()), message: entry.message });
        undoTimerRef.current = setTimeout(() => {
            if (pendingUndoRef.current) { void pendingUndoRef.current.commit(); pendingUndoRef.current = null; }
            setUndoDisplay(null);
        }, 15000);
    };

    const handleUndoClick = () => {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        pendingUndoRef.current?.restore();
        pendingUndoRef.current = null;
        setUndoDisplay(null);
    };

    const handleDismissToast = () => {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        if (pendingUndoRef.current) { void pendingUndoRef.current.commit(); pendingUndoRef.current = null; }
        setUndoDisplay(null);
    };
    // ────────────────────────────────────────────────────────────────────────
    const [templates, setTemplates] = useState<StationTemplate[]>([]);
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);

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

    const handleCreateBlankTemplate = async (): Promise<StationTemplate | null> => {
        try {
            const t = await createTemplate({ name: 'Neue Vorlage', description: '', material: '', instructions: '', impulses: [], setupBy: '', conductedBy: '' }, user.id);
            setTemplates(prev => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
            return t;
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    const handleSaveTemplateEdit = async (id: string, data: Partial<StationTemplate>) => {
        try {
            await updateTemplate(id, data);
            setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...data } : t).sort((a, b) => a.name.localeCompare(b.name)));
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

    // Zeitplan-Phasen aus Stationen ableiten, wenn der Tab geöffnet wird.
    // Einmalig pro Plan-ID initialisieren, damit lokale Sign-up-Interaktionen erhalten bleiben.
    useEffect(() => {
        if (activeTab === 'zeitplan' && zeitplanInitializedForPlanRef.current !== plan.id) {
            zeitplanInitializedForPlanRef.current = plan.id;
            setZeitplanPhases(stationsToPhases(activePlan.stations));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, plan.id]);

    const handleZeitplanSignUp = (phaseId: string, taskId: string, name: string) => {
        setZeitplanPhases(prev => prev.map(phase => {
            if (phase.id !== phaseId) return phase;
            return {
                ...phase,
                tasks: phase.tasks.map(task => {
                    if (task.id !== taskId) return task;
                    return { ...task, filled: task.filled + 1, volunteers: [...task.volunteers, name] };
                }),
            };
        }));
    };

    const handleZeitplanRemove = (phaseId: string, taskId: string, volunteerName: string) => {
        const snapshot = zeitplanPhases;
        setZeitplanPhases(prev => prev.map(phase => {
            if (phase.id !== phaseId) return phase;
            return {
                ...phase,
                tasks: phase.tasks.map(task => {
                    if (task.id !== taskId) return task;
                    const newVolunteers = task.volunteers.filter(v => v !== volunteerName);
                    return { ...task, filled: newVolunteers.length, volunteers: newVolunteers };
                }),
            };
        }));
        showUndo({
            message: `${volunteerName} wurde ausgetragen.`,
            commit: async () => {},
            restore: () => setZeitplanPhases(snapshot),
        });
    };

    // Aufgaben-Rubriken: Tasks beim ersten Öffnen des Zeitplan-Tabs laden
    useEffect(() => {
        if (activeTab === 'zeitplan' && aufgabenLoadedForPlanRef.current !== plan.id) {
            aufgabenLoadedForPlanRef.current = plan.id;
            loadPlanningTasks(plan.id)
                .then(setPlanningTasks)
                .catch(e => console.error('[Zeitplan] loadPlanningTasks Fehler:', e));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, plan.id]);

    // Reset tasks state when a different plan is opened
    useEffect(() => {
        setPlanningTasks([]);
        aufgabenLoadedForPlanRef.current = null;
    }, [plan.id]);

    const handleAddTask = async (section: TaskSection, name: string, helpersRequired: number, time?: string) => {
        try {
            const task = await createPlanningTask(plan.id, section, name, helpersRequired, time);
            // Realtime-Insert wird via usePlanningTasksSync verarbeitet; lokaler Fallback:
            setPlanningTasks(prev => [...prev, task]);
        } catch (e) {
            console.error('[handleAddTask] Fehler beim Erstellen der Aufgabe:', e);
        }
    };

    const handleDeleteTask = (id: string) => {
        const task = planningTasks.find(t => t.id === id);
        if (!task) return;
        // Optimistic remove — DB commit deferred until toast expires / dismissed
        setPlanningTasks(prev => prev.filter(t => t.id !== id));
        showUndo({
            message: `Aufgabe „${task.name}" gelöscht.`,
            commit: async () => {
                try { await deletePlanningTask(id); }
                catch (e) { console.error('[handleDeleteTask] Fehler:', e); }
            },
            restore: () => setPlanningTasks(prev => [...prev, task]),
        });
    };

    const handleEditTask = async (id: string, updates: { name: string; helpersRequired: number; time?: string }) => {
        // Optimistic update
        setPlanningTasks(prev => prev.map(t => t.id === id ? { ...t, name: updates.name, helpersRequired: updates.helpersRequired, time: updates.time } : t));
        try {
            await updatePlanningTask(id, updates);
        } catch (e) {
            console.error('[handleEditTask] Fehler:', e);
            // Revert on error — realtime will re-sync
        }
    };

    const handlePlanningTaskSignUp = async (taskId: string, name: string) => {
        const task = planningTasks.find(t => t.id === taskId);
        if (!task) return;
        const newVolunteers = [...task.volunteers, name];
        // Optimistic update
        setPlanningTasks(prev => prev.map(t => t.id === taskId ? { ...t, volunteers: newVolunteers } : t));
        try {
            await updatePlanningTaskVolunteers(taskId, newVolunteers);
        } catch (e) {
            console.error('[handlePlanningTaskSignUp] Fehler:', e);
        }
    };

    const handlePlanningTaskRemove = (taskId: string, name: string) => {
        const task = planningTasks.find(t => t.id === taskId);
        if (!task) return;
        const oldVolunteers = task.volunteers;
        const newVolunteers = oldVolunteers.filter(v => v !== name);
        // Optimistic update — DB commit deferred
        setPlanningTasks(prev => prev.map(t => t.id === taskId ? { ...t, volunteers: newVolunteers } : t));
        showUndo({
            message: `${name} wurde ausgetragen.`,
            commit: async () => {
                try { await updatePlanningTaskVolunteers(taskId, newVolunteers); }
                catch (e) { console.error('[handlePlanningTaskRemove] Fehler:', e); }
            },
            restore: () => setPlanningTasks(prev => prev.map(t => t.id === taskId ? { ...t, volunteers: oldVolunteers } : t)),
        });
    };

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

    usePlanningTasksSync({
        planId: plan.id,
        onInsert: (task) => setPlanningTasks(prev =>
            prev.some(t => t.id === task.id) ? prev : [...prev, task],
        ),
        onUpdate: (task) => setPlanningTasks(prev =>
            prev.map(t => t.id === task.id ? task : t),
        ),
        onDelete: (taskId) => setPlanningTasks(prev => prev.filter(t => t.id !== taskId)),
        enabled: true,
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

    const taskSections = activePlan.taskSections ?? DEFAULT_TASK_SECTIONS;

    const handleAddSection = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const current = (latestPlanRef.current ?? plan).taskSections ?? DEFAULT_TASK_SECTIONS;
        if (current.includes(trimmed)) return;
        updateActivePlan({ taskSections: [...current, trimmed] });
    };

    const handleDeleteSection = (id: string) => {
        const current = (latestPlanRef.current ?? plan).taskSections ?? DEFAULT_TASK_SECTIONS;
        const idx = current.indexOf(id);
        const reduced = current.filter(s => s !== id);
        updateActivePlan({ taskSections: reduced });
        const label = id.charAt(0).toUpperCase() + id.slice(1);
        showUndo({
            message: `Rubrik „${label}" gelöscht.`,
            commit: async () => {},
            restore: () => {
                const restored = [...reduced];
                if (idx >= 0) restored.splice(idx, 0, id);
                updateActivePlan({ taskSections: restored });
            },
        });
    };

    const handleReorderSections = (sections: string[]) => {
        updateActivePlan({ taskSections: sections });
    };

    const handleDeleteStation = (station: Station) => {
        const currentStations = (latestPlanRef.current ?? activePlan).stations;
        const idx = currentStations.findIndex(s => s.id === station.id);
        updateActivePlan({ stations: currentStations.filter(s => s.id !== station.id) });
        showUndo({
            message: `Station „${station.name || `Station ${station.number}`}" gelöscht.`,
            commit: async () => {
                // Snapshot anlegen (fire-and-forget)
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.access_token) {
                    fetch('/api/admin/snapshots', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                        body: JSON.stringify({ planningId: activePlan.id, triggerAction: 'before_station_delete' }),
                    }).catch(() => {});
                }
            },
            restore: () => {
                const latest = (latestPlanRef.current ?? activePlan).stations;
                const restored = [...latest];
                if (idx >= 0) restored.splice(idx, 0, station);
                else restored.push(station);
                updateActivePlan({ stations: restored });
            },
        });
    };

    return (
        <div className="flex h-[100dvh] w-full flex-col bg-[#fdfdfd] dark:bg-gray-900 text-[#1a1a1a] dark:text-gray-100 font-sans selection:bg-[#e8f7fb]">
            {/* Header */}
            <header className="flex flex-col border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-50">
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
                            className="hidden sm:block text-lg font-bold tracking-tight bg-transparent border-none outline-none focus:bg-gray-50 dark:focus:bg-gray-800 dark:text-gray-50 rounded px-1 min-w-0 w-full"
                            title="Titel bearbeiten"
                            maxLength={200}
                        />
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6">
                        <nav className="flex bg-gray-100 dark:bg-gray-800 rounded-full p-1 border border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => { setActiveTab('map'); void ensureFullDataLoaded(); }}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'map' ? "bg-white dark:bg-gray-700 shadow-sm text-[#6bbfd4]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                )}>
                                <MapIcon className="w-4 h-4" /> <span className="hidden xs:inline">Lageplan</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('table')}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'table' ? "bg-white dark:bg-gray-700 shadow-sm text-[#6bbfd4]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                )}>
                                <List className="w-4 h-4" /> <span className="hidden xs:inline">Tabelle</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('nachdenk')}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'nachdenk' ? "bg-white dark:bg-gray-700 shadow-sm text-[#6bbfd4]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                )}>
                                <BookOpen className="w-4 h-4" /> <span className="hidden xs:inline">Nachdenk-Texte</span>
                            </button>
                            <button
                                onClick={() => { setActiveTab('explanation'); void ensureFullDataLoaded(); }}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'explanation' ? "bg-white dark:bg-gray-700 shadow-sm text-[#6bbfd4]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                )}>
                                <FileText className="w-4 h-4" /> <span className="hidden xs:inline">Erklärung</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('zeitplan')}
                                className={cn(
                                    "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                                    activeTab === 'zeitplan' ? "bg-white dark:bg-gray-700 shadow-sm text-[#6bbfd4]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                )}>
                                <CalendarDays className="w-4 h-4" /> <span className="hidden xs:inline">Zeitplan</span>
                            </button>
                        </nav>

                        <ThemeToggle />
                        <ShareButton planningId={plan.id} planningTitle={plan.title} />
                    </div>
                </div>
                {/* Mobile title row */}
                <div className="sm:hidden px-4 pb-1">
                    <input
                        value={plan.title}
                        onChange={(e) => updateActivePlan({ title: e.target.value })}
                        className="text-base font-bold tracking-tight bg-transparent border-none outline-none focus:bg-gray-50 dark:focus:bg-gray-800 dark:text-gray-50 rounded px-1 w-full"
                        title="Titel bearbeiten"
                        maxLength={200}
                    />
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Content */}
                <main className="flex-1 relative bg-gray-100 dark:bg-gray-800 overflow-hidden flex flex-col">
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
                            onDeleteStation={handleDeleteStation}
                        />
                    ) : activeTab === 'zeitplan' ? (
                        <RubrikenView
                            stationCount={activePlan.stations.length}
                            taskSections={taskSections}
                            onAddSection={handleAddSection}
                            onDeleteSection={handleDeleteSection}
                            onReorderSections={handleReorderSections}
                            stationenContent={
                                <ZeitplanView
                                    embedded
                                    hideFilterBar
                                    phases={zeitplanPhases}
                                    filter={zeitplanFilter}
                                    onFilterChange={setZeitplanFilter}
                                    onSignUp={handleZeitplanSignUp}
                                    onRemove={handleZeitplanRemove}
                                    currentUser={presenceUser.displayName}
                                />
                            }
                            tasks={planningTasks}
                            onAddTask={handleAddTask}
                            onDeleteTask={handleDeleteTask}
                            onEditTask={handleEditTask}
                            onSignUpTask={handlePlanningTaskSignUp}
                            onRemoveFromTask={handlePlanningTaskRemove}
                            filter={zeitplanFilter}
                            onFilterChange={setZeitplanFilter}
                            phases={zeitplanPhases}
                            currentUser={presenceUser.displayName}
                            planningName={activePlan.title}
                        />
                    ) : null}

                    <div className="px-4 sm:px-8 py-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <label className="hover:text-gray-600 transition-colors cursor-pointer flex items-center gap-1" title="Backup laden (.rki)">
                            <Upload className="w-4 h-4" />
                            <span className="hidden sm:inline">Backup laden</span>
                            <input type="file" className="hidden" accept=".rki" onChange={handleBackupImport} />
                        </label>
                        <p className="text-center">© 2026 Erlebnis Kirche Planner · v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
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
                </main>
            </div>

            {showTemplatePicker && (
                <TemplatePickerDialog
                    templates={templates}
                    onSelect={handleApplyTemplate}
                    onClose={() => setShowTemplatePicker(false)}
                    onCreateTemplate={handleCreateBlankTemplate}
                    onSaveTemplate={handleSaveTemplateEdit}
                    onDeleteTemplate={handleDeleteTemplate}
                />
            )}

            {undoDisplay && (
                <UndoToast
                    toastKey={undoDisplay.key}
                    message={undoDisplay.message}
                    onUndo={handleUndoClick}
                    onDismiss={handleDismissToast}
                    duration={15000}
                />
            )}
        </div>
    );
}
