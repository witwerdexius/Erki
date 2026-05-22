'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Users } from 'lucide-react';
import type { PlanningTask, TaskSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Timeline } from '@/components/zeitplan/timeline';
import { FilterTabs } from '@/components/zeitplan/filter-tabs';
import { TaskCard } from '@/components/zeitplan/task-card';
import type { Phase, Task } from '@/components/zeitplan/types';

type RubrikenViewProps = {
  /** Anzahl Stationen — nur für den Zähler-Badge der Stationen-Sektion. */
  stationCount: number;
  /** Inhalt der Stationen-Sektion (ZeitplanView embedded). */
  stationenContent: React.ReactNode;
  tasks: PlanningTask[];
  onAddTask: (section: TaskSection, name: string, helpersRequired: number) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onSignUpTask: (taskId: string, name: string) => void;
  onRemoveFromTask: (taskId: string, name: string) => void;
  filter: 'all' | 'open' | 'mine';
  onFilterChange: (filter: 'all' | 'open' | 'mine') => void;
  phases: Phase[];
  currentUser: string;
};

type SectionId = TaskSection | 'stationen';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'aufbau', label: 'Aufbau' },
  { id: 'stationen', label: 'Stationen' },
  { id: 'feierzeit', label: 'Feierzeit' },
  { id: 'catering', label: 'Catering' },
  { id: 'abbau', label: 'Abbau' },
];

type AddFormState = {
  name: string;
  helpersRequired: number;
};

export default function RubrikenView({
  stationCount,
  stationenContent,
  tasks,
  onAddTask,
  onDeleteTask,
  onSignUpTask,
  onRemoveFromTask,
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

  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    aufbau: false,
    stationen: false,
    feierzeit: false,
    catering: false,
    abbau: false,
  });
  const [addingIn, setAddingIn] = useState<TaskSection | null>(null);
  const [addForm, setAddForm] = useState<AddFormState>({ name: '', helpersRequired: 1 });
  const [saving, setSaving] = useState(false);

  const toggleSection = (id: SectionId) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openAddForm = (section: TaskSection) => {
    setAddingIn(section);
    setAddForm({ name: '', helpersRequired: 1 });
  };

  const cancelAdd = () => {
    setAddingIn(null);
  };

  const submitAdd = async (section: TaskSection) => {
    const name = addForm.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      await onAddTask(section, name, addForm.helpersRequired);
      setAddingIn(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="px-4 pt-6 max-w-lg mx-auto space-y-3">
        {phases.length > 0 && <Timeline phases={phases} />}
        <FilterTabs
          filter={filter}
          onFilterChange={onFilterChange}
          openCount={openTasks}
          myCount={myTasks}
        />
      </div>
      <div className="px-4 py-3 pb-24 max-w-lg mx-auto space-y-3">
        {SECTIONS.map(({ id, label }) => {
          const isOpen = !collapsed[id];
          const isStationen = id === 'stationen';
          const sectionTasks = isStationen ? [] : filteredTasks.filter(t => t.section === id);
          const itemCount = isStationen ? stationCount : sectionTasks.length;

          return (
            <section key={id} className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Section Header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => toggleSection(id)}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">{label}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {itemCount}
                  </span>
                </div>
                {isOpen
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                }
              </button>

              {/* Section Content */}
              {isOpen && (
                <div className="border-t border-border">
                  {isStationen ? (
                    stationenContent
                  ) : (
                    <>
                      {sectionTasks.length > 0 && (
                        <div className="space-y-2 p-3">
                          {sectionTasks.map(task => {
                            const asTask: Task = {
                              id: task.id,
                              name: task.name,
                              slots: task.helpersRequired,
                              filled: task.volunteers.length,
                              volunteers: task.volunteers,
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
                              />
                            );
                          })}
                        </div>
                      )}

                      {/* Add Form */}
                      {addingIn === id ? (
                        <div className="px-4 py-3 flex flex-col gap-2 border-t border-border">
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
                          <div className="flex items-center gap-2">
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
                            <div className="flex-1" />
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
                      ) : (
                        <div className="px-4 py-3">
                          <button
                            onClick={() => openAddForm(id as TaskSection)}
                            className="flex items-center gap-2 text-sm text-[#6bbfd4] hover:text-[#5aaec3] transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            Aufgabe hinzufügen
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

