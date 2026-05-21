'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Users } from 'lucide-react';
import type { Station, PlanningTask, TaskSection } from '@/lib/types';
import { cn } from '@/lib/utils';

type RubrikenViewProps = {
  stations: Station[];
  tasks: PlanningTask[];
  onAddTask: (section: TaskSection, name: string, helpersRequired: number) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onUpdateStationHelpers: (stationId: string, helpersRequired: number) => void;
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
  stations,
  tasks,
  onAddTask,
  onDeleteTask,
  onUpdateStationHelpers,
}: RubrikenViewProps) {
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
      <div className="px-4 py-6 pb-24 max-w-lg mx-auto space-y-3">
        {SECTIONS.map(({ id, label }) => {
          const isOpen = !collapsed[id];
          const isStationen = id === 'stationen';
          const sectionTasks = isStationen
            ? []
            : tasks.filter(t => t.section === id);
          const itemCount = isStationen ? stations.length : sectionTasks.length;

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
                    /* Stationen: automatisch aus Planung */
                    stations.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted-foreground">
                        Noch keine Stationen in dieser Planung.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {stations.map(station => (
                          <StationRow
                            key={station.id}
                            station={station}
                            onUpdateHelpers={(n) => onUpdateStationHelpers(station.id, n)}
                          />
                        ))}
                      </ul>
                    )
                  ) : (
                    /* Manuelle Rubriken */
                    <>
                      {sectionTasks.length > 0 && (
                        <ul className="divide-y divide-border">
                          {sectionTasks.map(task => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              onDelete={() => onDeleteTask(task.id)}
                            />
                          ))}
                        </ul>
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

function StationRow({
  station,
  onUpdateHelpers,
}: {
  station: Station;
  onUpdateHelpers: (n: number) => void;
}) {
  const [localValue, setLocalValue] = useState(station.helpersRequired ?? 1);

  const handleBlur = () => {
    const n = Math.max(1, localValue);
    setLocalValue(n);
    if (n !== (station.helpersRequired ?? 1)) {
      onUpdateHelpers(n);
    }
  };

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex-1 text-sm truncate">
        {station.number ? `${station.number} – ` : ''}{station.name}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="number"
          min={1}
          max={99}
          className="w-14 h-8 rounded-lg border border-border bg-background px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
          value={localValue}
          onChange={e => setLocalValue(Math.max(1, parseInt(e.target.value) || 1))}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label={`Benötigte Helfer für ${station.name}`}
        />
      </div>
    </li>
  );
}

function TaskRow({
  task,
  onDelete,
}: {
  task: PlanningTask;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex-1 text-sm truncate">{task.name}</span>
      <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground text-xs">
        <Users className="h-3.5 w-3.5" />
        <span>{task.helpersRequired}</span>
      </div>
      <button
        onClick={onDelete}
        className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
        aria-label={`${task.name} löschen`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
