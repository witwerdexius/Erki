'use client';

import React, { useEffect, useRef, useState, MutableRefObject } from 'react';
import { motion } from 'framer-motion';
import {
    ChevronDown, ChevronUp, Plus, Trash2, Download, GripVertical,
    BookTemplate, Bookmark,
} from 'lucide-react';
import type { Plan, Station } from '@/lib/types';
import { cn } from '@/lib/utils';
import { exportTablePDF } from '@/lib/pdfExport';
import { supabase } from '@/lib/supabase';
import {
    reorderStationsByDrop,
    reorderStationsByNumberInput,
} from '@/lib/stationsTableHelpers';
import type { PresenceUserLike } from '@/lib/realtime/presenceUtils';
import { getPresenceColor } from '@/lib/realtime/presenceUtils';
import PresenceStack from '@/components/erki/PresenceStack';
import { useBroadcast } from '@/lib/realtime/useBroadcast';
import { planningChannelNames } from '@/lib/realtime/channelNames';
import {
    applyEditingBroadcast,
    pruneStaleEditing,
    type EditingMap,
    type EditingBroadcast,
} from '@/lib/realtime/editingMapHelpers';

interface StationsTableProps {
    activePlan: Plan;
    updateActivePlan: (updates: Partial<Plan>) => void;
    onAddStation: () => void;
    onOpenTemplatePicker: () => void;
    onSaveAsTemplate: (station: Station) => void;
    onSaveNow: (plan: Plan) => Promise<void>;
    latestPlanRef: MutableRefObject<Plan | null>;
    onlineUsers?: PresenceUserLike[];
    currentUser?: PresenceUserLike;
}

export default function StationsTable({
    activePlan,
    updateActivePlan,
    onAddStation,
    onOpenTemplatePicker,
    onSaveAsTemplate,
    onSaveNow,
    latestPlanRef,
    onlineUsers,
    currentUser,
}: StationsTableProps) {
    const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
    const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [editingMap, setEditingMap] = useState<EditingMap>({});

    const tableRef = useRef<HTMLDivElement>(null);

    // Soft-Lock: Broadcast bei Focus/Blur eines Felds einer Station. Andere
    // Clients sehen daraufhin "X bearbeitet…" als visuellen Hinweis (kein harter Lock).
    const { send: sendEditing } = useBroadcast<EditingBroadcast>({
        channelName: planningChannelNames(activePlan.id).broadcast,
        event: 'editing',
        onMessage: (msg) => {
            setEditingMap(curr => applyEditingBroadcast(curr, msg, Date.now()));
        },
        enabled: !!currentUser,
    });

    // Periodisch stale Eintraege wegraeumen (User schliesst Tab ohne 'stop'-Send).
    useEffect(() => {
        const interval = setInterval(() => {
            setEditingMap(curr => pruneStaleEditing(curr, Date.now()));
        }, 5_000);
        return () => clearInterval(interval);
    }, []);

    const handleFieldFocus = (stationId: string) => {
        if (!currentUser) return;
        void sendEditing({
            stationId,
            action: 'start',
            userId: currentUser.userId,
            displayName: currentUser.displayName,
        });
    };
    const handleFieldBlur = (stationId: string) => {
        if (!currentUser) return;
        void sendEditing({
            stationId,
            action: 'stop',
            userId: currentUser.userId,
        });
    };

    // Auto-resize textareas (Stationsname + akkordeon-Felder) bei Plan-Wechsel
    // bzw. Stationsänderung. Identisch zur ehemaligen Inline-Implementierung in
    // ErkiApp (war zuvor an `activeTab === 'table'` gebunden — entfällt hier,
    // da die Komponente nur gemountet ist, wenn der Tab aktiv ist).
    useEffect(() => {
        if (!tableRef.current) return;
        tableRef.current.querySelectorAll('textarea').forEach(ta => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
        });
    }, [activePlan.id, activePlan?.stations]);

    const exportTableToPDF = async () => {
        await exportTablePDF({
            title: activePlan.title,
            stations: activePlan.stations,
        });
    };

    const deleteStation = (id: string) => {
        const planId = activePlan.id;
        // Snapshot vor dem Löschen anlegen (fire-and-forget, blockiert die UI nicht).
        // Logik 1:1 aus ErkiApp übernommen.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.access_token) {
                fetch('/api/admin/snapshots', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ planningId: planId, triggerAction: 'before_station_delete' }),
                }).catch(() => {});
            }
        });
        updateActivePlan({ stations: activePlan.stations.filter(s => s.id !== id) });
    };

    const updateStation = (id: string, updates: Partial<Station>) => {
        updateActivePlan({
            stations: activePlan.stations.map(s => s.id === id ? { ...s, ...updates } : s),
        });
    };

    const toggleExpandedRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleRowDragStart = (id: string) => setDraggedRowId(id);

    const handleRowDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        if (id !== draggedRowId) setDragOverRowId(id);
    };

    const handleRowDrop = (targetId: string) => {
        if (!draggedRowId) return;
        const next = reorderStationsByDrop(activePlan.stations, draggedRowId, targetId);
        if (next !== activePlan.stations) {
            updateActivePlan({ stations: next });
        }
        setDraggedRowId(null);
        setDragOverRowId(null);
    };

    const handleRowDragEnd = () => {
        setDraggedRowId(null);
        setDragOverRowId(null);
    };

    const handleRowReorder = (id: string, inputValue: string) => {
        const next = reorderStationsByNumberInput(activePlan.stations, id, inputValue);
        if (next !== activePlan.stations) {
            updateActivePlan({ stations: next });
        }
    };

    return (
        <div ref={tableRef} className="flex-1 min-h-0 overflow-auto p-4 sm:p-12" style={{ overscrollBehavior: 'contain' }}>
            {onlineUsers && currentUser && (
                <div className="flex justify-end mb-4">
                    <PresenceStack onlineUsers={onlineUsers} currentUser={currentUser} />
                </div>
            )}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700"
            >
                <div className="overflow-x-auto" style={{ overflowY: 'clip', overscrollBehaviorX: 'contain' }}>
                <table className="w-full table-fixed text-left border-collapse sm:min-w-[700px]">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                            <th className="max-sm:hidden sm:table-cell p-4 w-8"></th>
                            <th className="p-4 w-10 text-xs font-bold uppercase text-gray-600 dark:text-gray-400 tracking-wider">Nr.</th>
                            <th className="p-4 w-48 text-xs font-bold uppercase text-gray-600 dark:text-gray-400 tracking-wider">Station</th>
                            <th className="max-sm:hidden sm:table-cell p-4 w-64 text-xs font-bold uppercase text-gray-600 dark:text-gray-400 tracking-wider">Beschreibung</th>
                            <th className="max-sm:hidden sm:table-cell p-4 w-64 text-xs font-bold uppercase text-gray-600 dark:text-gray-400 tracking-wider">Material</th>
                            <th className="max-sm:hidden sm:table-cell p-4 w-40 text-xs font-bold uppercase text-gray-600 dark:text-gray-400 tracking-wider">Gesprächsimpulse</th>
                            <th className="max-sm:hidden sm:table-cell p-4 w-28 text-xs font-bold uppercase text-gray-600 dark:text-gray-400 tracking-wider">Aufbau</th>
                            <th className="max-sm:hidden sm:table-cell p-4 w-28 text-xs font-bold uppercase text-gray-600 dark:text-gray-400 tracking-wider">Durchführung</th>
                            <th className="max-sm:hidden sm:table-cell p-4 w-12 text-xs font-bold uppercase text-gray-600 dark:text-gray-400 tracking-wider">Stempelfeld</th>
                            <th className="max-sm:hidden sm:table-cell p-4 w-24"></th>
                            <th className="sm:hidden p-4 w-16"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {activePlan?.stations.map(s => (
                            <React.Fragment key={s.id}>
                            <tr
                                draggable
                                onDragStart={() => handleRowDragStart(s.id)}
                                onDragOver={(e) => handleRowDragOver(e, s.id)}
                                onDrop={() => handleRowDrop(s.id)}
                                onDragEnd={handleRowDragEnd}
                                className={cn(
                                    "hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors",
                                    draggedRowId === s.id && "opacity-40",
                                    dragOverRowId === s.id && "border-t-2 border-[#6bbfd4]"
                                )}
                            >
                                <td className="max-sm:hidden sm:table-cell p-4 w-8 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
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
                                <td className="p-4 align-top max-w-0 overflow-hidden">
                                    <textarea
                                        ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                                        value={s.name}
                                        onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; updateStation(s.id, { name: e.target.value }); }}
                                        onFocus={() => handleFieldFocus(s.id)}
                                        onBlur={() => handleFieldBlur(s.id)}
                                        className="w-full bg-transparent border-none p-0 focus:ring-0 font-bold resize-none min-h-0"
                                        style={{ touchAction: 'pan-y' }}
                                    />
                                    {editingMap[s.id] && currentUser && editingMap[s.id].userId !== currentUser.userId && (
                                        <div
                                            className="mt-1 flex items-center gap-1.5 text-xs italic text-gray-500 dark:text-gray-400"
                                            title={`${editingMap[s.id].displayName} bearbeitet diese Station gerade`}
                                        >
                                            <span
                                                className="inline-block w-2 h-2 rounded-full animate-pulse"
                                                style={{ backgroundColor: getPresenceColor(editingMap[s.id].userId) }}
                                            />
                                            <span>{editingMap[s.id].displayName} bearbeitet…</span>
                                        </div>
                                    )}
                                </td>
                                {/* Echo-Schutz: nur den DOM-Textinhalt überschreiben, wenn das
                                    Element NICHT fokussiert ist. Verhindert, dass eingehende
                                    Realtime-UPDATEs gerade getippten Text wegspülen. Pattern
                                    bewusst verbatim aus der alten Inline-Implementierung. */}
                                <td className="max-sm:hidden sm:table-cell p-4 w-64 align-top max-w-0 overflow-hidden">
                                    <div
                                        ref={(el) => { if (el && el !== document.activeElement) el.textContent = s.description || ''; }}
                                        contentEditable
                                        suppressContentEditableWarning
                                        className="w-full text-sm whitespace-pre-wrap outline-none min-h-[4rem] cursor-text"
                                        style={{ touchAction: 'pan-y' }}
                                        onInput={(e) => updateStation(s.id, { description: e.currentTarget.innerText })}
                                        onBlur={(e) => updateStation(s.id, { description: e.currentTarget.innerText })}
                                    />
                                </td>
                                <td className="max-sm:hidden sm:table-cell p-4 w-64 align-top max-w-0 overflow-hidden">
                                    <div
                                        ref={(el) => { if (el && el !== document.activeElement) el.textContent = s.material || ''; }}
                                        contentEditable
                                        suppressContentEditableWarning
                                        className="w-full text-xs whitespace-pre-wrap outline-none min-h-[4rem] cursor-text text-gray-500 dark:text-gray-400"
                                        style={{ touchAction: 'pan-y' }}
                                        onInput={(e) => updateStation(s.id, { material: e.currentTarget.innerText })}
                                        onBlur={(e) => updateStation(s.id, { material: e.currentTarget.innerText })}
                                    />
                                </td>
                                <td className="max-sm:hidden sm:table-cell p-4 align-top">
                                    <div
                                        ref={(el) => { if (el && el !== document.activeElement) el.textContent = (s.impulses || []).join('\n'); }}
                                        contentEditable
                                        suppressContentEditableWarning
                                        className="w-full text-sm whitespace-pre-wrap outline-none min-h-[4rem] cursor-text text-gray-500 dark:text-gray-400"
                                        style={{ touchAction: 'pan-y' }}
                                        onInput={(e) => updateStation(s.id, { impulses: e.currentTarget.innerText.split('\n').filter(l => l.trim()) })}
                                        onBlur={(e) => updateStation(s.id, { impulses: e.currentTarget.innerText.split('\n').filter(l => l.trim()) })}
                                    />
                                </td>
                                <td className="max-sm:hidden sm:table-cell p-4">
                                    <div
                                        ref={(el) => { if (el && el !== document.activeElement) el.textContent = s.setupBy || ''; }}
                                        contentEditable
                                        suppressContentEditableWarning
                                        className="w-full text-sm whitespace-pre-wrap outline-none cursor-text"
                                        style={{ touchAction: 'pan-y' }}
                                        onInput={(e) => updateStation(s.id, { setupBy: e.currentTarget.innerText })}
                                        onBlur={(e) => updateStation(s.id, { setupBy: e.currentTarget.innerText })}
                                    />
                                </td>
                                <td className="max-sm:hidden sm:table-cell p-4">
                                    <div
                                        ref={(el) => { if (el && el !== document.activeElement) el.textContent = s.conductedBy || ''; }}
                                        contentEditable
                                        suppressContentEditableWarning
                                        className="w-full text-sm whitespace-pre-wrap outline-none cursor-text"
                                        style={{ touchAction: 'pan-y' }}
                                        onInput={(e) => updateStation(s.id, { conductedBy: e.currentTarget.innerText })}
                                        onBlur={(e) => updateStation(s.id, { conductedBy: e.currentTarget.innerText })}
                                    />
                                </td>
                                <td className="max-sm:hidden sm:table-cell p-4">
                                    <input
                                        type="checkbox"
                                        checked={s.isFilled || false}
                                        onChange={(e) => updateStation(s.id, { isFilled: e.target.checked })}
                                        className="rounded text-[#6bbfd4] focus:ring-[#6bbfd4] border-gray-300"
                                    />
                                </td>
                                <td className="max-sm:hidden sm:table-cell p-4 w-24">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => onSaveAsTemplate(s)}
                                            className="p-2 -m-2 text-gray-500 dark:text-gray-400 hover:text-[#6bbfd4] transition-colors"
                                            title="Als Vorlage speichern"
                                        >
                                            <Bookmark className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => deleteStation(s.id)}
                                            className="p-2 -m-2 text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                                <td className="sm:hidden p-4 align-middle">
                                    <button
                                        onClick={() => toggleExpandedRow(s.id)}
                                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        {expandedRows.has(s.id)
                                            ? <ChevronUp className="w-4 h-4" />
                                            : <ChevronDown className="w-4 h-4" />
                                        }
                                    </button>
                                </td>
                            </tr>
                            {expandedRows.has(s.id) && (
                                <tr className="sm:hidden bg-gray-50/80 dark:bg-gray-700/80">
                                    <td colSpan={3} className="px-4 pb-4 pt-2 space-y-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-1">Beschreibung</p>
                                            <textarea
                                                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 24) + 'px'; } }}
                                                value={s.description || ''}
                                                placeholder="Beschreibung eingeben…"
                                                onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.max(e.target.scrollHeight, 24) + 'px'; updateStation(s.id, { description: e.target.value }); }}
                                                className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600"
                                                style={{ touchAction: 'pan-y', minHeight: '24px' }}
                                            />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-1">Material</p>
                                            <textarea
                                                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 24) + 'px'; } }}
                                                value={s.material || ''}
                                                placeholder="Material eingeben…"
                                                onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.max(e.target.scrollHeight, 24) + 'px'; updateStation(s.id, { material: e.target.value }); }}
                                                className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600"
                                                style={{ touchAction: 'pan-y', minHeight: '24px' }}
                                            />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-1">Gesprächsimpulse</p>
                                            <textarea
                                                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 24) + 'px'; } }}
                                                value={(s.impulses || []).join('\n')}
                                                placeholder="Impulse eingeben…"
                                                onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.max(e.target.scrollHeight, 24) + 'px'; updateStation(s.id, { impulses: e.target.value.split('\n').filter(l => l.trim()) }); }}
                                                className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600"
                                                style={{ touchAction: 'pan-y', minHeight: '24px' }}
                                            />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-1">Aufbau</p>
                                            <textarea
                                                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 24) + 'px'; } }}
                                                value={s.setupBy || ''}
                                                placeholder="Aufbau eingeben…"
                                                onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.max(e.target.scrollHeight, 24) + 'px'; updateStation(s.id, { setupBy: e.target.value }); }}
                                                className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600"
                                                style={{ touchAction: 'pan-y', minHeight: '24px' }}
                                            />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-1">Durchführung</p>
                                            <textarea
                                                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 24) + 'px'; } }}
                                                value={s.conductedBy || ''}
                                                placeholder="Durchführung eingeben…"
                                                onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.max(e.target.scrollHeight, 24) + 'px'; updateStation(s.id, { conductedBy: e.target.value }); }}
                                                className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600"
                                                style={{ touchAction: 'pan-y', minHeight: '24px' }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-bold uppercase text-gray-400 tracking-wider">Stempelfeld</p>
                                                <input
                                                    type="checkbox"
                                                    checked={s.isFilled || false}
                                                    onChange={(e) => updateStation(s.id, { isFilled: e.target.checked })}
                                                    className="rounded text-[#6bbfd4] focus:ring-[#6bbfd4] border-gray-300"
                                                />
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteStation(s.id); }}
                                                className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
                </div>
                <div className="flex border-t dark:border-gray-700 divide-x dark:divide-gray-700">
                    <button
                        onClick={onAddStation}
                        className="flex-1 p-5 text-gray-600 dark:text-gray-400 hover:text-[#6bbfd4] hover:bg-[#6bbfd4]/10 transition-all flex items-center justify-center gap-2 font-medium"
                    >
                        <Plus className="w-5 h-5" /> Station hinzufügen
                    </button>
                    <button
                        onClick={onOpenTemplatePicker}
                        className="flex-1 p-5 text-gray-600 dark:text-gray-400 hover:text-[#6bbfd4] hover:bg-[#6bbfd4]/10 transition-all flex items-center justify-center gap-2 font-medium"
                    >
                        <BookTemplate className="w-5 h-5" /> Aus Vorlage
                    </button>
                </div>
            </motion.div>
            <div className="flex justify-center mt-4">
                <button
                    onClick={exportTableToPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-[#6bbfd4] text-white rounded-full shadow-lg border-none cursor-pointer hover:bg-[#5aaec3] transition-all active:scale-95 text-sm font-medium"
                >
                    <Download className="w-4 h-4" />
                    <span>Tabelle als PDF</span>
                </button>
            </div>
        </div>
    );
}
