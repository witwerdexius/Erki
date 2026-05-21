"use client"

import { Users, AlertCircle, UserCheck } from "lucide-react"
import { Progress } from "@/components/ui/progress"

type StatsCardsProps = {
  totalSlots: number
  filledSlots: number
  openTasks: number
  myTasks: number
}

export function StatsCards({ totalSlots, filledSlots, openTasks, myTasks }: StatsCardsProps) {
  const fillPercentage = Math.round((filledSlots / totalSlots) * 100)
  
  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {/* Helfer Progress */}
      <div className="col-span-2 rounded-2xl bg-card p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Helfer</span>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold">{filledSlots}</span>
          <span className="text-sm text-muted-foreground">/ {totalSlots}</span>
          <span className="ml-auto text-sm font-medium text-primary">{fillPercentage}%</span>
        </div>
        <Progress value={fillPercentage} className="h-2" />
      </div>
      
      {/* My Tasks */}
      <div className="rounded-2xl bg-card p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <UserCheck className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Meine</span>
        </div>
        <span className="text-2xl font-bold">{myTasks}</span>
      </div>
      
      {/* Open Tasks - Warning banner when there are open tasks */}
      {openTasks > 0 && (
        <div className="col-span-3 rounded-2xl p-4 border" style={{ backgroundColor: 'var(--warning-bg)', borderColor: 'var(--warning)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--warning)' }}>
                <AlertCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--warning-foreground)' }}>{openTasks} offene Aufgaben</p>
                <p className="text-sm" style={{ color: 'var(--warning-foreground)', opacity: 0.8 }}>Deine Hilfe wird benoetigt</p>
              </div>
            </div>
            <span className="text-2xl font-bold" style={{ color: 'var(--warning-foreground)' }}>{openTasks}</span>
          </div>
        </div>
      )}
    </div>
  )
}
