'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Clock, Download, GripVertical, LayoutTemplate, Plus, Trash2, Users } from 'lucide-react';
import type { PlanningTask, Station, TaskSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FilterTabs } from '@/components/zeitplan/filter-tabs';
import { TaskCard } from '@/components/zeitplan/task-card';
import type { Phase, Task } from '@/components/zeitplan/types';
import { useBroadcast } from '@/lib/realtime/useBroadcast';
import { planningChannelNames } from '@/lib/realtime/channelNames';
import {
    applyTaskEditingBroadcast,
    pruneStaleEditing,
    type EditingMap,
    type TaskEditingBroadcast,
} from '@/lib/realtime/editingMapHelpers';
import type { PresenceUserLike } from '@/lib/realtime/presenceUtils';

type RubrikenViewProps = {
  /** Anzahl Stationen — nur für den Zähler-Badge der Stationen-Sektion. */
  stationCount: number;
  /** Inhalt der Stationen-Sektion (ZeitplanView embedded). */
  stationenContent: React.ReactNode;
  tasks: PlanningTask[];
  taskSections: string[];
  onAddTask: (section: TaskSection, name: string, helpersRequired: number, time?: string) => Promise<void>;
  onDeleteTask: (id: string) => void;
  onAddSection: (name: string) => void;
  onDeleteSection: (id: string) => void;
  onReorderSections: (sections: string[]) => void;
  onSignUpTask: (taskId: string, name: string) => void;
  onRemoveFromTask: (taskId: string, name: string) => void;
  onEditTask: (id: string, updates: { name: string; helpersRequired: number; time?: string }) => Promise<void>;
  filter: 'all' | 'open' | 'mine';
  onFilterChange: (filter: 'all' | 'open' | 'mine') => void;
  phases: Phase[];
  stations: Station[];
  currentUser: string;
  planningName: string;
  /** Plan-ID für den Broadcast-Channel (Soft-Lock). */
  planId?: string;
  /** Voller Presence-User des aktuellen Nutzers (für Broadcast). */
  currentUserPresence?: PresenceUserLike;
  /** Öffnet das Aufgaben-Vorlagen-Menü für eine bestimmte Rubrik. */
  onOpenTaskTemplatePicker?: (section: TaskSection, sectionLabel: string) => void;
};

type AddFormState = {
  name: string;
  helpersRequired: number;
  time?: string;
};

export default function RubrikenView({
  stationCount,
  stationenContent,
  tasks,
  taskSections,
  onAddTask,
  onDeleteTask,
  onAddSection,
  onDeleteSection,
  onReorderSections,
  onSignUpTask,
  onRemoveFromTask,
  onEditTask,
  filter,
  onFilterChange,
  phases,
  stations,
  currentUser,
  planningName,
  planId,
  currentUserPresence,
  onOpenTaskTemplatePicker,
}: RubrikenViewProps) {
  const openStationTasks = phases.reduce((acc, p) => acc + p.tasks.filter(t => t.filled < t.slots).length, 0);
  const myStationTasks = phases.reduce((acc, p) => acc + p.tasks.filter(t => t.volunteers.includes(currentUser)).length, 0);
  const openPlanningTasks = tasks.filter(t => t.volunteers.length < t.helpersRequired).length;
  const myPlanningTasks = tasks.filter(t => t.volunteers.includes(currentUser)).length;
  const openTasks = openStationTasks + openPlanningTasks;
  const myTasks = myStationTasks + myPlanningTasks;

  const filteredTasks =
    filter === 'mine' ? tasks.filter(t => t.volunteers.includes(currentUser)) :
    filter === 'open' ? tasks.filter(t => t.volunteers.length < t.helpersRequired) :
    tasks;

  // Build ordered section list — stationen ist beweglich und wird in taskSections gespeichert.
  // Fallback für ältere Pläne ohne 'stationen' in taskSections: nach dem ersten Element einfügen.
  const fullSectionIds = taskSections.includes('stationen')
    ? taskSections
    : taskSections.length > 0
      ? [taskSections[0], 'stationen', ...taskSections.slice(1)]
      : ['stationen'];

  const allSections = fullSectionIds.map(id =>
    id === 'stationen'
      ? { id: 'stationen', label: 'Stationen', isStationen: true }
      : { id, label: id.charAt(0).toUpperCase() + id.slice(1), isStationen: false }
  );

  const [editingMap, setEditingMap] = useState<EditingMap>({});

  const { send: sendEditing } = useBroadcast<TaskEditingBroadcast>({
    channelName: planId ? planningChannelNames(planId).broadcast : '',
    event: 'task-editing',
    onMessage: (msg) => {
      setEditingMap(curr => applyTaskEditingBroadcast(curr, msg, Date.now()));
    },
    enabled: !!planId && !!currentUserPresence,
  });

  useEffect(() => {
    if (!planId) return;
    const interval = setInterval(() => {
      setEditingMap(curr => pruneStaleEditing(curr, Date.now()));
    }, 5_000);
    return () => clearInterval(interval);
  }, [planId]);

  const handleTaskEditOpen = (taskId: string) => {
    if (!currentUserPresence) return;
    void sendEditing({
      taskId,
      action: 'start',
      userId: currentUserPresence.userId,
      displayName: currentUserPresence.displayName,
    });
  };

  const handleTaskEditClose = (taskId: string) => {
    if (!currentUserPresence) return;
    void sendEditing({
      taskId,
      action: 'stop',
      userId: currentUserPresence.userId,
    });
  };

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingIn, setAddingIn] = useState<TaskSection | null>(null);
  const [addForm, setAddForm] = useState<AddFormState>({ name: '', helpersRequired: 1 });
  const [saving, setSaving] = useState(false);

  const [showAddSectionForm, setShowAddSectionForm] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [isReordering, setIsReordering] = useState(false);

  const [colCount, setColCount] = useState(1);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setColCount(w >= 1536 ? 4 : w >= 1024 ? 3 : w >= 768 ? 2 : 1);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const toggleSection = (id: string) => {
    if (isReordering) return;
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const moveSection = (id: string, direction: 'up' | 'down') => {
    const idx = fullSectionIds.indexOf(id);
    if (idx === -1) return;
    const next = [...fullSectionIds];
    if (direction === 'up' && idx > 0) {
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    } else if (direction === 'down' && idx < next.length - 1) {
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    }
    onReorderSections(next);
  };

  const openAddForm = (section: TaskSection) => {
    setCollapsed(prev => ({ ...prev, [section]: false }));
    setAddingIn(section);
    setAddForm({ name: '', helpersRequired: 1, time: '' });
  };

  const cancelAdd = () => {
    setAddingIn(null);
  };

  const submitAdd = async (section: TaskSection) => {
    const name = addForm.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      await onAddTask(section, name, addForm.helpersRequired, addForm.time || undefined);
      setAddingIn(null);
    } finally {
      setSaving(false);
    }
  };

  const submitAddSection = () => {
    const name = newSectionName.trim();
    if (!name) return;
    onAddSection(name);
    setShowAddSectionForm(false);
    setNewSectionName('');
  };

  const downloadPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(planningName, 14, 18);

    const rows: string[][] = [];
    for (const sectionId of fullSectionIds) {
      if (sectionId === 'stationen') {
        for (const s of stations) {
          const name = `${s.number ? s.number + ' – ' : ''}${s.name}`;
          const assigned = [s.conductedBy, s.setupBy].filter(v => v && v.trim());
          const helfer = assigned.length > 0 ? assigned.join(', ') : String(s.helpersRequired ?? 2);
          rows.push(['Stationen', name, s.time ?? '', helfer]);
        }
      } else {
        const sectionLabel = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
        const sectionTasks = tasks.filter(t => t.section === sectionId);
        for (const task of sectionTasks) {
          rows.push([sectionLabel, task.name, task.time ?? '', task.volunteers.join(', ')]);
        }
      }
    }

    autoTable(doc, {
      startY: 26,
      head: [['Rubrik', 'Aufgabe', 'Uhrzeit', 'Helfer']],
      body: rows,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [107, 191, 212] },
    });

    const safeName = planningName.replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '').trim().replace(/ /g, '-');
    doc.save(`${safeName}-aufgaben.pdf`);
  };

  // Sections visible after active filter
  const visibleSections = allSections.filter(({ id, isStationen }) => {
    if (filter === 'all') return true;
    if (isStationen) {
      return phases.flatMap(p => p.tasks).some(t =>
        filter === 'open' ? t.filled < t.slots : t.volunteers.includes(currentUser)
      );
    }
    return filteredTasks.some(t => t.section === id);
  });

  // Rolling-average column distribution — original order preserved
  const BASE_H = 56;
  const ITEM_H = 60;
  const heights = visibleSections.map(({ id, isStationen }) => {
    const count = isStationen ? stationCount : filteredTasks.filter(t => t.section === id).length;
    return BASE_H + count * ITEM_H;
  });
  const masonryColumns: typeof visibleSections[] = Array.from({ length: Math.max(1, colCount) }, () => []);
  if (colCount <= 1) {
    masonryColumns[0] = visibleSections;
  } else {
    let currentCol = 0;
    let currentColHeight = 0;
    let remainingHeight = heights.reduce((a, b) => a + b, 0);
    let remainingCols = colCount;
    let avg = remainingHeight / remainingCols;
    for (let i = 0; i < visibleSections.length; i++) {
      if (currentColHeight + heights[i] > avg && currentColHeight > 0 && currentCol < colCount - 1) {
        currentCol++;
        currentColHeight = 0;
        remainingHeight = heights.slice(i).reduce((a, b) => a + b, 0);
        remainingCols = colCount - currentCol;
        avg = remainingHeight / remainingCols;
      }
      masonryColumns[currentCol].push(visibleSections[i]);
      currentColHeight += heights[i];
    }
  }

  const renderSection = ({ id, label, isStationen }: { id: string; label: string; isStationen: boolean }) => {
    const isOpen = !(collapsed[id] ?? false);
    const sectionTasks = isStationen ? [] : filteredTasks.filter(t => t.section === id);
    const allSectionTasks = isStationen ? [] : tasks.filter(t => t.section === id);
    const itemCount = isStationen ? stationCount : sectionTasks.length;
    const canDelete = !isStationen && !isReordering && allSectionTasks.length === 0;
    const sectionIdx = fullSectionIds.indexOf(id);
    const showContent = !isReordering && isOpen && (isStationen || sectionTasks.length > 0 || addingIn === id);
    return (
      <motion.section layout="position" key={id} transition={{ type: 'spring', stiffness: 400, damping: 35 }} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 overflow-hidden">
        <div
          className={cn(
            "w-full flex items-center justify-between px-4 h-14 transition-colors select-none",
            isReordering ? "cursor-default" : "hover:bg-muted/50 cursor-pointer",
          )}
          onClick={() => toggleSection(id)}
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onKeyDown={e => { if (!isReordering && (e.key === 'Enter' || e.key === ' ')) toggleSection(id); }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold text-base truncate">{label}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">{itemCount}</span>
            {!isReordering && !isStationen && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); openAddForm(id as TaskSection); }}
                  className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-[#6bbfd4]/20 text-[#6bbfd4] transition-colors shrink-0"
                  aria-label={`Aufgabe zu ${label} hinzufügen`}
                >
                  <Plus className="h-4 w-4" />
                </button>
                {onOpenTaskTemplatePicker && (
                  <button
                    onClick={e => { e.stopPropagation(); onOpenTaskTemplatePicker(id as TaskSection, label); }}
                    className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-[#6bbfd4]/20 text-[#6bbfd4] transition-colors shrink-0"
                    aria-label={`Vorlage zu ${label} hinzufügen`}
                    title="Aus Vorlage hinzufügen"
                  >
                    <LayoutTemplate className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
            {canDelete && (
              <button
                onClick={e => { e.stopPropagation(); onDeleteSection(id); }}
                className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                aria-label={`Rubrik ${label} löschen`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          {isReordering ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={e => { e.stopPropagation(); moveSection(id, 'up'); }}
                disabled={sectionIdx <= 0}
                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted disabled:opacity-25 transition-colors"
                aria-label={`${label} nach oben`}
              >
                <ChevronUp className="h-5 w-5" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); moveSection(id, 'down'); }}
                disabled={sectionIdx >= fullSectionIds.length - 1}
                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted disabled:opacity-25 transition-colors"
                aria-label={`${label} nach unten`}
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>
          ) : (
            isOpen
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <AnimatePresence initial={false}>
          {showContent && (
            <motion.div
              key="content"
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-border">
                {isStationen ? stationenContent : (
                  <>
                    {sectionTasks.length > 0 && (
                      <div className="space-y-2 px-3 pt-1 pb-3">
                        {sectionTasks.map(task => {
                          const asTask: Task = {
                            id: task.id, name: task.name, slots: task.helpersRequired,
                            filled: task.volunteers.length, volunteers: task.volunteers, time: task.time,
                          };
                          const entry = editingMap[task.id];
                          const editingEntry = entry && currentUserPresence && entry.userId !== currentUserPresence.userId ? entry : undefined;
                          return (
                            <TaskCard
                              key={task.id}
                              task={asTask}
                              phaseId={id as string}
                              onSignUp={(_phaseId, taskId, name) => onSignUpTask(taskId, name)}
                              onRemove={(_phaseId, taskId, name) => onRemoveFromTask(taskId, name)}
                              currentUser={currentUser}
                              onDelete={() => onDeleteTask(task.id)}
                              onEdit={(updates) => onEditTask(task.id, { name: updates.name, helpersRequired: updates.slots, time: updates.time })}
                              editingEntry={editingEntry}
                              onEditOpen={() => handleTaskEditOpen(task.id)}
                              onEditClose={() => handleTaskEditClose(task.id)}
                            />
                          );
                        })}
                      </div>
                    )}
                    {addingIn === id && (
                      <div className={cn('px-4 py-3 flex flex-col gap-2', sectionTasks.length > 0 && 'border-t border-border')}>
                        <input
                          className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                          placeholder="Aufgabe benennen…"
                          value={addForm.name}
                          autoFocus
                          onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') void submitAdd(id as TaskSection);
                            if (e.key === 'Escape') cancelAdd();
                          }}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <Users className="h-3.5 w-3.5" /> Helfer
                          </label>
                          <input
                            type="number" min={1} max={99}
                            className="w-16 h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                            value={addForm.helpersRequired}
                            onChange={e => setAddForm(f => ({ ...f, helpersRequired: Math.max(1, parseInt(e.target.value) || 1) }))}
                            onFocus={e => e.target.select()}
                          />
                          <label className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <Clock className="h-3.5 w-3.5" /> Uhrzeit
                          </label>
                          <input
                            type="time"
                            className="w-32 h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                            value={addForm.time}
                            onChange={e => setAddForm(f => ({ ...f, time: e.target.value }))}
                          />
                          <div className="flex-1" />
                          <div className="flex gap-2 ml-auto">
                            <button
                              disabled={saving || !addForm.name.trim()}
                              onClick={() => void submitAdd(id as TaskSection)}
                              className={cn(
                                'h-10 px-4 rounded-full text-sm font-medium bg-[#6bbfd4] text-white hover:bg-[#5aaec3] transition-colors',
                                (saving || !addForm.name.trim()) && 'opacity-50 cursor-not-allowed',
                              )}
                            >
                              Hinzufügen
                            </button>
                            <button onClick={cancelAdd} className="h-10 px-3 rounded-full text-sm text-muted-foreground hover:bg-muted transition-colors">
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800">
      <div className="px-4 pt-6 max-w-lg mx-auto space-y-3 md:max-w-none md:px-6">
        <FilterTabs
          filter={filter}
          onFilterChange={onFilterChange}
          openCount={openTasks}
          myCount={myTasks}
        />
      </div>

      {colCount <= 1 ? (
        <div className="px-4 py-3 max-w-lg mx-auto space-y-3">
          {visibleSections.map(s => renderSection(s))}
        </div>
      ) : (
        <div className="px-6 py-3 flex flex-row gap-3">
          {masonryColumns.map((col, i) => (
            <div key={i} className="flex-1 min-w-0 flex flex-col gap-3">
              {col.map(s => renderSection(s))}
            </div>
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div className="px-4 pb-24 max-w-lg mx-auto md:pb-4 md:pt-2 md:px-6 md:max-w-none">
        {filter === 'all' && showAddSectionForm ? (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-4 py-3 flex items-center gap-2">
            <input
              className="flex-1 h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
              placeholder="Name der Rubrik…"
              value={newSectionName}
              autoFocus
              onChange={e => setNewSectionName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitAddSection();
                if (e.key === 'Escape') { setShowAddSectionForm(false); setNewSectionName(''); }
              }}
            />
            <button
              disabled={!newSectionName.trim()}
              onClick={submitAddSection}
              className={cn(
                'h-10 px-4 rounded-full text-sm font-medium bg-[#6bbfd4] text-white hover:bg-[#5aaec3] transition-colors shrink-0',
                !newSectionName.trim() && 'opacity-50 cursor-not-allowed',
              )}
            >
              Hinzufügen
            </button>
            <button
              onClick={() => { setShowAddSectionForm(false); setNewSectionName(''); }}
              className="h-10 px-3 rounded-full text-sm text-muted-foreground hover:bg-muted transition-colors shrink-0"
            >
              Abbrechen
            </button>
          </div>
        ) : filter === 'all' ? (
          <div className="flex gap-2">
            <button
              onClick={() => void downloadPDF()}
              className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-transparent px-4 py-3 text-muted-foreground hover:border-[#6bbfd4] hover:text-[#6bbfd4] transition-colors"
              aria-label="Aufgabenliste als PDF herunterladen"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setIsReordering(false); setShowAddSectionForm(true); }}
              className="flex-1 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-transparent py-3 text-sm text-muted-foreground hover:border-[#6bbfd4] hover:text-[#6bbfd4] transition-colors"
            >
              ＋ Rubrik hinzufügen
            </button>
            {taskSections.length > 1 && (
              <button
                onClick={() => setIsReordering(r => !r)}
                className={cn(
                  'rounded-2xl border px-4 text-sm font-medium transition-colors',
                  isReordering
                    ? 'border-[#6bbfd4] bg-[#6bbfd4]/10 text-[#6bbfd4]'
                    : 'border-dashed border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-[#6bbfd4] hover:text-[#6bbfd4]',
                )}
                aria-label="Reihenfolge der Rubriken ändern"
              >
                {isReordering ? 'Fertig' : <GripVertical className="h-4 w-4" />}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
