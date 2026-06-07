"use client"

import type { Phase } from "@/components/zeitplan/types"
import { TaskCard } from "./task-card"
import { Progress } from "@/components/ui/progress"
import { Clock, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type PhaseListProps = {
  phases: Phase[]
  onSignUp: (phaseId: string, taskId: string, name: string) => void
  onRemove: (phaseId: string, taskId: string, volunteerName: string) => void
  currentUser: string
  hidePhaseTitles?: boolean
  onEditTask?: (taskId: string, updates: { name: string; slots: number; time?: string; symbol?: string }) => void
  readonlyTaskName?: boolean
}

export function PhaseList({ phases, onSignUp, onRemove, currentUser, hidePhaseTitles = false, onEditTask, readonlyTaskName }: PhaseListProps) {
  return (
    <div className="space-y-6">
      {phases.map((phase) => {
        const totalSlots = phase.tasks.reduce((acc, task) => acc + task.slots, 0)
        const filledSlots = phase.tasks.reduce((acc, task) => acc + task.filled, 0)
        const percentage = Math.round((filledSlots / totalSlots) * 100)
        const openCount = phase.tasks.filter(t => t.filled < t.slots).length

        return (
          <section
            key={phase.id}
            id={`phase-${phase.id}`}
            className="scroll-mt-20"
          >
            {/* Phase Header */}
            {!hidePhaseTitles && <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{phase.name}</h2>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="h-5 w-5 rounded-full hover:bg-secondary flex items-center justify-center">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{phase.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{phase.time}</span>
                </div>
              </div>
              
              {/* Phase Progress */}
              <div className="flex items-center gap-3">
                <Progress value={percentage} className="flex-1 h-1.5" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {filledSlots}/{totalSlots}
                  {openCount > 0 && (
                    <span className="ml-1" style={{ color: 'var(--warning-foreground)' }}>({openCount} offen)</span>
                  )}
                </span>
              </div>
            </div>}

            {/* Tasks */}
            <div className="space-y-2">
              {phase.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  phaseId={phase.id}
                  onSignUp={onSignUp}
                  onRemove={onRemove}
                  currentUser={currentUser}
                  onEdit={onEditTask ? (updates) => { onEditTask(task.id, updates); return Promise.resolve(); } : undefined}
                  readonlyName={readonlyTaskName}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
