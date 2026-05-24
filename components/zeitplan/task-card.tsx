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
  Settings,
  Users,
  Clock,
} from "lucide-react"
import type { EditingEntry } from "@/lib/realtime/editingMapHelpers"
import { getPresenceColor } from "@/lib/realtime/presenceUtils"

type TaskCardProps = {
  task: Task
  phaseId: string
  onSignUp: (phaseId: string, taskId: string, name: string) => void
  onRemove: (phaseId: string, taskId: string, volunteerName: string) => void
  currentUser: string
  /** Wenn gesetzt: Zahnrad-Button erscheint, Löschen im Edit-Formular möglich. */
  onDelete?: () => void
  /** Wenn gesetzt: Parameter der Aufgabe bearbeitbar. */
  onEdit?: (updates: { name: string; slots: number; time?: string; symbol?: string }) => Promise<void>
  /** Wenn true: Namensfeld im Edit-Formular ausgeblendet (z.B. bei Stationskarten). */
  readonlyName?: boolean
  /** Soft-Lock: Eintrag eines anderen Users, der diese Aufgabe gerade bearbeitet. */
  editingEntry?: EditingEntry
  /** Callback wenn Edit-Formular geöffnet wird (für Broadcast). */
  onEditOpen?: () => void
  /** Callback wenn Edit-Formular geschlossen wird (für Broadcast). */
  onEditClose?: () => void
}

export function TaskCard({ task, phaseId, onSignUp, onRemove, currentUser, onDelete, onEdit, readonlyName, editingEntry, onEditOpen, onEditClose }: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [name, setName] = useState("")

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(task.name)
  const [editSlots, setEditSlots] = useState(task.slots)
  const [editTime, setEditTime] = useState(task.time ?? '')
  const [editSymbol, setEditSymbol] = useState(task.symbol ?? '')
  const [editSaving, setEditSaving] = useState(false)

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

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditName(task.name)
    setEditSlots(task.slots)
    setEditTime(task.time ?? '')
    setEditSymbol(task.symbol ?? '')
    setIsSigningUp(false)
    setIsEditing(true)
    onEditOpen?.()
  }

  const closeEdit = () => {
    setIsEditing(false)
    onEditClose?.()
  }

  const handleSaveEdit = async () => {
    if (!readonlyName && !editName.trim()) return
    if (!onEdit) return
    setEditSaving(true)
    try {
      await onEdit({
        name: readonlyName ? task.name : editName.trim(),
        slots: editSlots,
        time: editTime || undefined,
        symbol: editSymbol || undefined,
      })
      closeEdit()
    } finally {
      setEditSaving(false)
    }
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
      {/* Soft-Lock Indicator */}
      {editingEntry && (
        <div
          className="px-4 pt-2 pb-0 flex items-center gap-1.5 text-xs italic text-muted-foreground"
          title={`${editingEntry.displayName} bearbeitet diese Aufgabe gerade`}
        >
          <span
            className="inline-block w-2 h-2 rounded-full animate-pulse shrink-0"
            style={{ backgroundColor: getPresenceColor(editingEntry.userId) }}
          />
          <span>{editingEntry.displayName} bearbeitet…</span>
        </div>
      )}
      {/* Main Content — Klick auf die Karte klappt auf/zu */}
      <div className="p-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        {/* Top Row: Circle + Name + Button */}
        <div className="flex items-center gap-3">
          {/* Progress Circle */}
          <div className="relative h-10 w-10 shrink-0">
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
          <div className="flex-1 min-w-0">
            <p
              className="font-semibold text-base leading-snug"
              style={{ hyphens: 'auto', wordBreak: 'break-word' }}
              lang="de"
            >
              {task.symbol && <span className="mr-1.5">{task.symbol}</span>}
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
                        "h-8 rounded-full flex items-center pl-3 pr-1 gap-1",
                        volunteer === currentUser
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {volunteer}
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemove(phaseId, task.id, volunteer); }}
                        className="ml-1 h-6 w-6 rounded-full hover:bg-background/20 flex items-center justify-center shrink-0"
                        aria-label={`${volunteer} austragen`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Sign Up Form / Edit Form / Default Row */}
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
            ) : isEditing ? (
              /* ── Edit Form ── */
              <div className="flex flex-col gap-2">
                {/* Symbol (Emoji) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground shrink-0">Symbol</span>
                  <input
                    className="flex-1 h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                    placeholder="Emoji oder Kürzel…"
                    value={editSymbol}
                    autoFocus={readonlyName}
                    onChange={e => setEditSymbol(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') closeEdit()
                    }}
                  />
                </div>
                {/* Name — nur wenn editierbar */}
                {!readonlyName && (
                  <input
                    className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                    placeholder="Aufgabe benennen…"
                    value={editName}
                    autoFocus={!readonlyName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void handleSaveEdit()
                      if (e.key === 'Escape') closeEdit()
                    }}
                  />
                )}
                {/* Helfer + Uhrzeit — gleichbreite Spalten */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="number"
                      min={1}
                      max={99}
                      className="flex-1 h-9 rounded-lg border border-border bg-muted/50 px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                      value={editSlots}
                      onChange={e => setEditSlots(Math.max(1, parseInt(e.target.value) || 1))}
                      onFocus={e => e.target.select()}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="time"
                      className="flex-1 h-9 rounded-lg border border-border bg-muted/50 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]"
                      value={editTime}
                      onChange={e => setEditTime(e.target.value)}
                    />
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  {onDelete ? (
                    <button
                      onClick={() => { onDelete(); closeEdit(); }}
                      className="flex-1 h-10 rounded-full text-sm font-medium border border-destructive/60 text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Löschen
                    </button>
                  ) : (
                    <button
                      onClick={closeEdit}
                      className="flex-1 h-10 rounded-full text-sm font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Abbrechen
                    </button>
                  )}
                  <button
                    disabled={editSaving || (!readonlyName && !editName.trim())}
                    onClick={() => void handleSaveEdit()}
                    className={cn(
                      'flex-1 h-10 rounded-full text-sm font-medium bg-[#6bbfd4] text-white hover:bg-[#5aaec3] transition-colors',
                      (editSaving || (!readonlyName && !editName.trim())) && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    Speichern
                  </button>
                </div>
              </div>
            ) : (
              /* ── Default Row ── */
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsSigningUp(true)}
                  variant="outline"
                  className="flex-1 h-12 rounded-full"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Weitere Person eintragen
                </Button>
                {(onEdit || onDelete) && (
                  <Button
                    variant="ghost"
                    onClick={openEdit}
                    className="h-12 w-12 rounded-full hover:bg-muted"
                    aria-label={`${task.name} bearbeiten`}
                  >
                    <Settings className="h-4 w-4" />
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
