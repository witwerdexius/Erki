'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Plus, Trash2, Users } from 'lucide-react';
import type { PlanningTask, TaskSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FilterTabs } from '@/components/zeitplan/filter-tabs';
import { TaskCard } from '@/components/zeitplan/task-card';
import type { Phase, Task } from '@/components/zeitplan/types';

type RubrikenViewProps = {
  /** Anzahl Stationen — nur für den Zähler-Badge der Stationen-Sektion. */
  stationCount: number;
  /** Inhalt der Stationen-Sektion (ZeitplanView embedded). */
  stationenContent: React.ReactNode;
  tasks: PlanningTask[];
  taskSections: string[];
  onAddTask: (section: TaskSection, name: string, helpersRequired: number, time?: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onAddSection: (name: string) => void;
  onDeleteSection: (id: string) => void;
  onSignUpTask: (taskId: string, name: string) => void;
  onRemoveFromTask: (taskId: string, name: string) => void;
  onEditTask: (id: string, updates: { name: string; helpersRequired: number; time?: string }) => Promise<void>;
  filter: 'all' | 'open' | 'mine';
  onFilterChange: (filter: 'all' | 'open' | 'mine') => void;
  phases: Phase[];
  currentUser: string;
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
  onSignUpTask,
  onRemoveFromTask,
  onEditTask,
  filter,
  onFilterChange,
  phases,
  currentUser,
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

  // Build ordered section list: first custom section, then stationen, then the rest
  const customSections = taskSections.map(id => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), isStationen: false }));
  const stationenEntry = { id: 'stationen', label: 'Stationen', isStationen: true };
  const allSections = customSections.length > 0
    ? [customSections[0], stationenEntry, ...customSections.slice(1)]
    : [stationenEntry];

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingIn, setAddingIn] = useState<TaskSection | null>(null);
  const [addForm, setAddForm] = useState<AddFormState>({ name: '', helpersRequired: 1 });
  const [saving, setSaving] = useState(false);

  const [showAddSectionForm, setShowAddSectionForm] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  const toggleSection = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
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

  return (
    <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800">
      <div className="px-4 pt-6 max-w-lg mx-auto space-y-3">
        <FilterTabs
          filter={filter}
          onFilterChange={onFilterChange}
          openCount={openTasks}
          myCount={myTasks}
        />
      </div>
      <div className="px-4 py-3 pb-24 max-w-lg mx-auto space-y-3">
        {allSections.map(({ id, label, isStationen }) => {
          const isOpen = !(collapsed[id] ?? false);
          const sectionTasks = isStationen ? [] : filteredTasks.filter(t => t.section === id);
          const allSectionTasks = isStationen ? [] : tasks.filter(t => t.section === id);
          const itemCount = isStationen ? stationCount : sectionTasks.length;
          const canDelete = !isStationen && allSectionTasks.length === 0;

          // Bei aktivem Filter: Rubrik ausblenden wenn keine Aufgaben übrig
          if (filter !== 'all') {
            if (isStationen) {
              const visibleStationTasks = phases.flatMap(p => p.tasks).filter(t => {
                if (filter === 'open') return t.filled < t.slots;
                if (filter === 'mine') return t.volunteers.includes(currentUser);
                return true;
              });
              if (visibleStationTasks.length === 0) return null;
            } else {
              if (sectionTasks.length === 0) return null;
            }
          }

          return (
            <section key={id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 overflow-hidden">
              {/* Section Header */}
              <div
                className="w-full flex items-center justify-between px-4 h-14 hover:bg-muted/50 transition-colors cursor-pointer select-none"
                onClick={() => toggleSection(id)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleSection(id); }}
              >
                <div className="flex items-center gap-2 flex-1">
                  <span className="font-semibold text-base">{label}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {itemCount}
                  </span>
                  {!isStationen && (
                    <button
                      onClick={e => { e.stopPropagation(); openAddForm(id as TaskSection); }}
                      className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-[#6bbfd4]/20 text-[#6bbfd4] transition-colors"
                      aria-label={`Aufgabe zu ${label} hinzufügen`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteSection(id); }}
                      className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors"
                      aria-label={`Rubrik ${label} löschen`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {isOpen
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                }
              </div>

              {/* Section Content */}
              {isOpen && (isStationen || sectionTasks.length > 0 || addingIn === id) && (
                <div className="border-t border-border">
                  {isStationen ? (
                    stationenContent
                  ) : (
                    <>
                      {sectionTasks.length > 0 && (
                        <div className="space-y-2 px-3 pt-1 pb-3">
                          {sectionTasks.map(task => {
                            const asTask: Task = {
                              id: task.id,
                              name: task.name,
                              slots: task.helpersRequired,
                              filled: task.volunteers.length,
                              volunteers: task.volunteers,
                              time: task.time,
                            };
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
                              <Users className="h-3.5 w-3.5" />
                              Helfer
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              className="w-16 h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                              value={addForm.helpersRequired}
                              onChange={e => setAddForm(f => ({ ...f, helpersRequired: Math.max(1, parseInt(e.target.value) || 1) }))}
                            />
                            <label className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                              <Clock className="h-3.5 w-3.5" />
                              Uhrzeit
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
                              <button
                                onClick={cancelAdd}
                                className="h-10 px-3 rounded-full text-sm text-muted-foreground hover:bg-muted transition-colors"
                              >
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {/* Rubrik hinzufügen */}
        {showAddSectionForm ? (
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
        ) : (
          <button
            onClick={() => setShowAddSectionForm(true)}
            className="w-full rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-transparent py-3 text-sm text-muted-foreground hover:border-[#6bbfd4] hover:text-[#6bbfd4] transition-colors"
          >
            ＋ Rubrik hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}
