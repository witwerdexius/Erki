'use client';

import React, { useState } from 'react';
import { GripVertical, Trash2, Bookmark } from 'lucide-react';
import type { Station } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getPresenceColor } from '@/lib/realtime/presenceUtils';
import type { EditingMap } from '@/lib/realtime/editingMapHelpers';
import type { PresenceUserLike } from '@/lib/realtime/presenceUtils';

/**
 * Auto-wachsende Textarea mit Echo-Schutz: der Wert wird nur dann aus den
 * Props in das DOM geschrieben, wenn das Feld NICHT fokussiert ist. So spuelen
 * eingehende Realtime-UPDATEs keinen gerade getippten Text weg (gleiches
 * Prinzip wie die contentEditable-Zellen der Tabellenansicht).
 */
function CardField({
    label,
    value,
    placeholder,
    onChange,
    onFocus,
    onBlur,
    className,
}: {
    label: string;
    value: string;
    placeholder: string;
    onChange: (v: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    className?: string;
}) {
    const resize = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = Math.max(el.scrollHeight, 24) + 'px';
    };
    return (
        <label className="block">
            <span className="block text-[11px] font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-1">{label}</span>
            <textarea
                ref={(el) => {
                    if (!el) return;
                    if (el !== document.activeElement && el.value !== value) el.value = value;
                    resize(el);
                }}
                defaultValue={value}
                placeholder={placeholder}
                rows={1}
                onChange={(e) => { resize(e.target); onChange(e.target.value); }}
                onFocus={onFocus}
                onBlur={onBlur}
                className={cn(
                    'w-full bg-transparent border-none p-0 focus:ring-0 text-sm resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600',
                    className,
                )}
                style={{ touchAction: 'pan-y', minHeight: '24px' }}
            />
        </label>
    );
}

export interface StationCardProps {
    station: Station;
    areaSelect: React.ReactNode;
    editingMap: EditingMap;
    currentUser?: PresenceUserLike;
    isDragged: boolean;
    isDragOver: boolean;
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: () => void;
    onDragEnd: () => void;
    onReorder: (value: string) => void;
    onUpdate: (updates: Partial<Station>) => void;
    onFieldFocus: () => void;
    onFieldBlur: () => void;
    onSaveAsTemplate: () => void;
    onDelete: () => void;
}

export default function StationCard({
    station: s,
    areaSelect,
    editingMap,
    currentUser,
    isDragged,
    isDragOver,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onReorder,
    onUpdate,
    onFieldFocus,
    onFieldBlur,
    onSaveAsTemplate,
    onDelete,
}: StationCardProps) {
    // Card ist nur draggable, solange der Griff gehalten wird – sonst wuerde
    // Drag & Drop die Textauswahl in den Feldern stoeren.
    const [dragArmed, setDragArmed] = useState(false);
    const editor = editingMap[s.id];
    const someoneElseEditing = editor && currentUser && editor.userId !== currentUser.userId;

    return (
        <div
            draggable={dragArmed}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={() => { setDragArmed(false); onDragEnd(); }}
            className={cn(
                'flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow',
                isDragged && 'opacity-40',
                isDragOver && 'ring-2 ring-[#6bbfd4]',
            )}
            style={someoneElseEditing ? { boxShadow: `0 0 0 2px ${getPresenceColor(editor.userId)}` } : undefined}
        >
            {/* Kopf: Griff, Nummer, Name, Aktionen */}
            <div className="flex items-start gap-2 p-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                <button
                    type="button"
                    aria-label="Station verschieben"
                    title="Ziehen zum Verschieben"
                    onMouseDown={() => setDragArmed(true)}
                    onMouseUp={() => setDragArmed(false)}
                    className="max-sm:hidden mt-1 -ml-1 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                    <GripVertical className="w-4 h-4" />
                </button>
                <input
                    type="number"
                    defaultValue={s.number}
                    key={s.number}
                    min={1}
                    aria-label="Nummer"
                    title="Nummer ändern zum Umsortieren"
                    className="w-9 h-8 shrink-0 font-bold text-[#6bbfd4] bg-[#6bbfd4]/10 border-none p-0 focus:ring-1 focus:ring-[#6bbfd4] rounded-lg text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onBlur={(e) => onReorder(e.target.value)}
                />
                <div className="flex-1 min-w-0">
                    <textarea
                        ref={(el) => {
                            if (!el) return;
                            if (el !== document.activeElement && el.value !== s.name) el.value = s.name;
                            el.style.height = 'auto';
                            el.style.height = el.scrollHeight + 'px';
                        }}
                        defaultValue={s.name}
                        rows={1}
                        placeholder="Stationsname"
                        aria-label="Stationsname"
                        onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; onUpdate({ name: e.target.value }); }}
                        onFocus={onFieldFocus}
                        onBlur={onFieldBlur}
                        className="w-full bg-transparent border-none p-0 pt-1 focus:ring-0 font-bold text-base resize-none min-h-0 placeholder-gray-300 dark:placeholder-gray-600"
                        style={{ touchAction: 'pan-y' }}
                    />
                    {someoneElseEditing && (
                        <div className="mt-1 flex items-center gap-1.5 text-xs italic text-gray-500 dark:text-gray-400">
                            <span
                                className="inline-block w-2 h-2 rounded-full animate-pulse"
                                style={{ backgroundColor: getPresenceColor(editor.userId) }}
                            />
                            <span>{editor.displayName} bearbeitet…</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={onSaveAsTemplate}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-[#6bbfd4] transition-colors"
                        title="Als Vorlage speichern"
                        aria-label="Als Vorlage speichern"
                    >
                        <Bookmark className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                        title="Station löschen"
                        aria-label="Station löschen"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Inhalt */}
            <div className="flex-1 p-4 space-y-3">
                <div>
                    <span className="block text-[11px] font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-1">Bereich</span>
                    {areaSelect}
                </div>
                <CardField
                    label="Beschreibung"
                    value={s.description || ''}
                    placeholder="Beschreibung eingeben…"
                    onChange={(v) => onUpdate({ description: v })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur}
                />
                <CardField
                    label="Material"
                    value={s.material || ''}
                    placeholder="Material eingeben…"
                    onChange={(v) => onUpdate({ material: v })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur}
                />
                <CardField
                    label="Gesprächsimpulse"
                    value={(s.impulses || []).join('\n')}
                    placeholder="Ein Impuls pro Zeile…"
                    onChange={(v) => onUpdate({ impulses: v.split('\n').filter(l => l.trim()) })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur}
                />
            </div>

            {/* Fuss: Zustaendigkeiten + Stempelfeld */}
            <div className="grid grid-cols-2 gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-b-2xl border-t border-gray-100 dark:border-gray-700">
                <CardField
                    label="Aufbau"
                    value={s.setupBy || ''}
                    placeholder="Wer?"
                    onChange={(v) => onUpdate({ setupBy: v })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur}
                />
                <CardField
                    label="Durchführung"
                    value={s.conductedBy || ''}
                    placeholder="Wer?"
                    onChange={(v) => onUpdate({ conductedBy: v })}
                    onFocus={onFieldFocus}
                    onBlur={onFieldBlur}
                />
                <label className="col-span-2 flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={s.isFilled || false}
                        onChange={(e) => onUpdate({ isFilled: e.target.checked })}
                        className="rounded text-[#6bbfd4] focus:ring-[#6bbfd4] border-gray-300"
                    />
                    <span className="text-[11px] font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider">Stempelfeld</span>
                </label>
            </div>
        </div>
    );
}
