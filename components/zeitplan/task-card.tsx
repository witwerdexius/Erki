"use client"

import { useState } from "react"
import type { Task } from "@/components/zeitplan/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  UserPlus,
  Zap,
  Check,
  X,
  AlertTriangle,
  CheckCircle,
  Trash2,
} from "lucide-react"

type TaskCardProps = {
  task: Task
  phaseId: string
  onSignUp: (phaseId: string, taskId: string, name: string) => void
  onRemove: (phaseId: string, taskId: string, volunteerName: string) => void
  currentUser: string
  /** Wenn gesetzt: Eintragen-Button und Expand werden ausgeblendet, stattdessen Löschen-Button. */
  onDelete?: () => void
}

export function TaskCard({ task, phaseId, onSignUp, onRemove, currentUser, onDelete }: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [name, setName] = useState("")
  
  const isFull = task.filled >= task.slots
  const isOverbooked = task.filled > task.slots
  const isEmpty = task.filled === 0
  const percentage = Math.min(100, Math.round((task.filled / task.slots) * 100))
  const isUserSignedUp = task.volunteers.includes(currentUser)
  
  const handleSignUp = () => {
    if (name.trim()) {
      onSignUp(phaseId, task.id, name.trim())
      setName("")
      setIsSigningUp(false)
    }
  }

  const handleQuickSignUp = () => {
    onSignUp(phaseId, task.id, currentUser)
  }

  const getStatusStyle = () => {
    if (isOverbooked) return { borderColor: 'var(--over)', backgroundColor: 'var(--over-bg)' }
    if (isFull) return { borderColor: 'var(--success)', backgroundColor: 'var(--success-bg)' }
    if (isEmpty) return { borderColor: 'var(--error)', backgroundColor: 'var(--error-bg)' }
    return { borderColor: 'var(--warning)', backgroundColor: 'var(--warning-bg)' }
  }

  const getStrokeColor = () => {
    if (isOverbooked) return 'var(--over)'
    if (isFull) return 'var(--success)'
    if (isEmpty) return 'var(--error)'
    return 'var(--warning)'
  }

  return (
    <div 
      className="rounded-2xl border bg-card transition-all"
      style={getStatusStyle()}
    >
      {/* Main Content — Klick auf die Karte klappt auf/zu */}
      <div className="p-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        {/* Top Row: Circle + Name + Button */}
        <div className="flex items-start gap-3">
          {/* Progress Circle */}
          <div className="relative h-10 w-10 shrink-0 mt-0.5">
            <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                className="stroke-border"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                style={{ stroke: getStrokeColor() }}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${percentage * 0.94} 100`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {isFull && !isOverbooked ? (
                <CheckCircle className="h-5 w-5" style={{ color: 'var(--success)' }} />
              ) : (
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
          
          {/* Title & Badges */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p
              className="font-semibold text-base leading-snug"
              style={{ hyphens: 'auto', wordBreak: 'break-word' }}
              lang="de"
            >
              {task.name}
              {task.time && (
                <span className="ml-1.5 font-normal text-muted-foreground text-sm">· {task.time}</span>
              )}
              {task.isAuto && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="h-5 px-1.5 gap-0.5 ml-2 align-middle inline-flex">
                      <Zap className="h-3 w-3" />
                      <span className="text-[10px]">auto</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Automatisch zugewiesen</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {isOverbooked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="h-5 px-1.5 gap-0.5 ml-2 align-middle inline-flex" style={{ borderColor: 'var(--over)', color: 'var(--over-foreground)' }}>
                      <AlertTriangle className="h-3 w-3" />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{task.filled - task.slots} Person(en) zu viel eingetragen</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </p>
          </div>
          
          {/* Sign Up Button - Top Right */}
          {!isSigningUp && !isUserSignedUp && (
            <Button
              onClick={(e) => { e.stopPropagation(); handleQuickSignUp(); }}
              size="sm"
              className="h-10 px-4 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Eintragen
            </Button>
          )}
          {isUserSignedUp && (
            <Badge className="h-10 px-4 rounded-full shrink-0" style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success-foreground)' }}>
              <Check className="h-4 w-4 mr-2" />
              Eingetragen
            </Badge>
          )}
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-border mt-0">
          <div className="pt-4">
            {/* Helfer-Info */}
            <div className="mb-4 text-sm text-muted-foreground">
              <span className={cn(isEmpty && "font-medium", isOverbooked && "font-medium")}
                style={isEmpty ? { color: 'var(--error-foreground)' } : isOverbooked ? { color: 'var(--over-foreground)' } : undefined}>
                {task.filled}/{task.slots} Helfer
              </span>
              {!isFull && (
                <span className="ml-2" style={{ color: 'var(--warning-foreground)' }}>
                  ({task.slots - task.filled} offen)
                </span>
              )}
            </div>

            {/* Volunteers List */}
            {task.volunteers.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Eingetragene Helfer
                </p>
                <div className="flex flex-wrap gap-2">
                  {task.volunteers.map((volunteer, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className={cn(
                        "h-8 rounded-full flex items-center",
                        volunteer === currentUser
                          ? "pl-3 pr-1 gap-1 bg-primary text-primary-foreground"
                          : "px-3"
                      )}
                    >
                      {volunteer}
                      {volunteer === currentUser && (
                        <button
                          onClick={() => onRemove(phaseId, task.id, volunteer)}
                          className="ml-1 h-6 w-6 rounded-full hover:bg-background/20 flex items-center justify-center"
                          aria-label={`${volunteer} austragen`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {/* Sign Up Form + optional Delete */}
            {isSigningUp ? (
              <div className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dein Name"
                  className="flex-1 h-12 text-base rounded-xl"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSignUp()
                    if (e.key === "Escape") setIsSigningUp(false)
                  }}
                />
                <Button onClick={handleSignUp} className="h-12 px-4 rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setIsSigningUp(false)}
                  className="h-12 px-4 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsSigningUp(true)}
                  variant="outline"
                  className="flex-1 h-12 rounded-full"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Weitere Person eintragen
                </Button>
                {onDelete && (
                  <Button
                    variant="ghost"
                    onClick={onDelete}
                    className="h-12 w-12 rounded-full hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`${task.name} löschen`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
