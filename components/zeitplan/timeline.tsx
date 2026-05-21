"use client"

import type { Phase } from "@/components/zeitplan/types"

type TimelineProps = {
  phases: Phase[]
  onPhaseClick?: (phaseId: string) => void
}

// Phase color mapping based on original app
const phaseColors: Record<string, { bg: string; text: string }> = {
  "aufbau": { bg: "var(--aufbau-bg)", text: "var(--aufbau-foreground)" },
  "empfang": { bg: "var(--empfang-bg)", text: "var(--empfang-foreground)" },
  "feierzeit": { bg: "var(--feier-bg)", text: "var(--feier-foreground)" },
  "feier": { bg: "var(--feier-bg)", text: "var(--feier-foreground)" },
  "essen": { bg: "var(--essen-bg)", text: "var(--essen-foreground)" },
  "abbau": { bg: "var(--abbau-bg)", text: "var(--abbau-foreground)" },
}

function getPhaseColors(phaseName: string) {
  const key = phaseName.toLowerCase()
  return phaseColors[key] || { bg: "var(--secondary)", text: "var(--secondary-foreground)" }
}

export function Timeline({ phases, onPhaseClick }: TimelineProps) {
  const scrollToPhase = (phaseId: string) => {
    const element = document.getElementById(`phase-${phaseId}`)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    onPhaseClick?.(phaseId)
  }

  return (
    <div className="mb-4">
      {/* Timeline Strip - horizontal colored blocks like original */}
      <div className="flex items-stretch rounded-xl border border-border overflow-hidden">
        {phases.map((phase) => {
          const colors = getPhaseColors(phase.name)
          const filledSlots = phase.tasks.reduce((acc, task) => acc + task.filled, 0)
          const totalSlots = phase.tasks.reduce((acc, task) => acc + task.slots, 0)
          
          return (
            <button
              key={phase.id}
              onClick={() => scrollToPhase(phase.id)}
              className="flex-1 py-2 px-1 text-center min-w-0 transition-opacity hover:opacity-80 active:opacity-70"
              style={{ 
                backgroundColor: colors.bg, 
                color: colors.text 
              }}
              aria-label={`Zu ${phase.name} springen`}
            >
              <div className="text-[11px] font-semibold leading-tight truncate">
                {phase.name}
              </div>
              <div className="text-[9px] opacity-70 mt-0.5">
                {phase.time.split(" - ")[0]}
              </div>
            </button>
          )
        })}
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-1">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
          <span className="text-xs text-muted-foreground">Voll</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--warning)' }} />
          <span className="text-xs text-muted-foreground">Teilweise</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--error)' }} />
          <span className="text-xs text-muted-foreground">Offen</span>
        </div>
      </div>
    </div>
  )
}
