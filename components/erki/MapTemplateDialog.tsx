'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Download, Trash2, RefreshCw, Map as MapIcon, Loader2 } from 'lucide-react';
import type { MapTemplate, Plan } from '@/lib/types';
import {
    loadMapTemplates, createMapTemplate, overwriteMapTemplate, deleteMapTemplate, loadProfile,
} from '@/lib/db';
import { applyMapTemplate, mapTemplateContentFromPlan, planHasMapContent } from '@/lib/mapTemplates';
import { cn } from '@/lib/utils';

interface Props {
    plan: Plan;
    userId: string;
    onApply: (updates: Partial<Plan>) => void;
    onClose: () => void;
}

const normName = (s: string) => s.trim().toLowerCase();

export default function MapTemplateDialog({ plan, userId, onApply, onClose }: Props) {
    const [templates, setTemplates] = useState<MapTemplate[] | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([loadMapTemplates(), loadProfile(userId).catch(() => null)])
            .then(([list, profile]) => {
                if (cancelled) return;
                setTemplates(list);
                setIsAdmin(profile?.role === 'admin');
            })
            .catch(e => { if (!cancelled) setError('Vorlagen konnten nicht geladen werden: ' + (e?.message ?? e)); });
        return () => { cancelled = true; };
    }, [userId]);

    const canEdit = (t: MapTemplate) => t.userId === userId || isAdmin;
    const hasContent = planHasMapContent(plan);
    const existing = useMemo(
        () => (templates ?? []).find(t => normName(t.name) === normName(name)),
        [templates, name],
    );

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try { await fn(); }
        catch (e) { setError((e as Error)?.message ?? String(e)); }
        finally { setBusy(false); }
    };

    const handleSave = () => run(async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const content = mapTemplateContentFromPlan(plan);
        if (existing) {
            if (!canEdit(existing)) {
                setError(`Es gibt bereits eine Vorlage „${existing.name}“ von jemand anderem. Bitte einen anderen Namen wählen.`);
                return;
            }
            if (!window.confirm(`Vorlage „${existing.name}“ mit dem aktuellen Lageplan überschreiben?`)) return;
            const updated = await overwriteMapTemplate(existing.id, content);
            setTemplates(prev => (prev ?? []).map(t => t.id === updated.id ? updated : t));
        } else {
            const created = await createMapTemplate(trimmed, content, userId);
            setTemplates(prev => [...(prev ?? []), created].sort((a, b) => a.name.localeCompare(b.name, 'de')));
        }
        setName('');
    });

    const handleOverwrite = (t: MapTemplate) => run(async () => {
        if (!window.confirm(`Vorlage „${t.name}“ mit dem aktuellen Lageplan überschreiben?`)) return;
        const updated = await overwriteMapTemplate(t.id, mapTemplateContentFromPlan(plan));
        setTemplates(prev => (prev ?? []).map(x => x.id === updated.id ? updated : x));
    });

    const handleDelete = (t: MapTemplate) => run(async () => {
        if (!window.confirm(`Vorlage „${t.name}“ löschen? Planungen, die sie verwendet haben, bleiben unverändert.`)) return;
        await deleteMapTemplate(t.id);
        setTemplates(prev => (prev ?? []).filter(x => x.id !== t.id));
    });

    const handleLoad = (t: MapTemplate) => {
        if (hasContent && !window.confirm(
            `Vorlage „${t.name}“ laden?\n\n` +
            'Hintergrundbild, Zoom, Masken, Bereiche, Logo und Überschrift dieser Planung werden ersetzt. ' +
            'Die Stationen bleiben; feste Bereichszuordnungen werden auf automatisch zurückgesetzt.',
        )) return;
        onApply(applyMapTemplate(plan, t));
        onClose();
    };

    return (
        <div
            role="button"
            tabIndex={0}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
            onClick={onClose}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
        >
            <div
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden cursor-default"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="font-semibold text-gray-900 dark:text-gray-50 leading-tight">Lageplan-Vorlagen</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Bild, Zoom, Masken, Bereiche, Logo, Überschrift</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="Schließen">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Aktuellen Lageplan speichern */}
                <form
                    className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2"
                    onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
                >
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Aktuellen Lageplan als Vorlage speichern</label>
                    <div className="flex gap-2">
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Name, z. B. „Herz Jesu Pfarrzentrum“"
                            disabled={!hasContent || busy}
                            className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!hasContent || busy || !name.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6bbfd4] text-white rounded-lg text-sm font-medium hover:bg-[#5aaec3] active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4" />
                            {existing && canEdit(existing) ? 'Überschreiben' : 'Speichern'}
                        </button>
                    </div>
                    {!hasContent && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Diese Planung hat noch keinen Lageplan.</p>
                    )}
                </form>

                {error && (
                    <p className="px-5 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/40">{error}</p>
                )}

                {/* Vorlagenliste */}
                <div className="overflow-y-auto flex-1">
                    {templates === null && !error ? (
                        <div className="flex justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                    ) : (templates ?? []).length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-10">Noch keine Lageplan-Vorlagen vorhanden.</p>
                    ) : (
                        (templates ?? []).map(t => (
                            <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                                <div className="w-14 h-10 shrink-0 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                    {t.backgroundImage
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={t.backgroundImage} alt="" className="w-full h-full object-cover" />
                                        : <MapIcon className="w-5 h-5 text-gray-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{t.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {t.areas.length} Bereich{t.areas.length === 1 ? '' : 'e'}
                                        {t.userId === userId ? ' · eigene' : ''}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => handleLoad(t)}
                                        disabled={busy}
                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#6bbfd4] text-white rounded-lg hover:bg-[#5aaec3] transition-colors disabled:opacity-40"
                                        title="Vorlage in diese Planung laden"
                                    >
                                        <Download className="w-3.5 h-3.5" /> Laden
                                    </button>
                                    {canEdit(t) && (
                                        <>
                                            <button
                                                onClick={() => void handleOverwrite(t)}
                                                disabled={busy || !hasContent}
                                                className={cn('p-1.5 text-gray-400 dark:text-gray-500 hover:text-[#6bbfd4] transition-colors disabled:opacity-30')}
                                                title="Mit aktuellem Lageplan überschreiben"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => void handleDelete(t)}
                                                disabled={busy}
                                                className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors disabled:opacity-30"
                                                title="Vorlage löschen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
