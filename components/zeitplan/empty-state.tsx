"use client"

import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { CheckCircle2, ClipboardList, UserCheck } from "lucide-react"

type EmptyStateProps = {
  filter: "all" | "open" | "mine"
}

export function EmptyState({ filter }: EmptyStateProps) {
  if (filter === "open") {
    return (
      <Empty className="py-12">
        <EmptyMedia variant="icon">
          <CheckCircle2 className="h-6 w-6" />
        </EmptyMedia>
        <EmptyTitle>Alle Aufgaben besetzt</EmptyTitle>
        <EmptyDescription>
          Super! Alle Aufgaben haben genuegend Helfer.
        </EmptyDescription>
      </Empty>
    )
  }

  if (filter === "mine") {
    return (
      <Empty className="py-12">
        <EmptyMedia variant="icon">
          <UserCheck className="h-6 w-6" />
        </EmptyMedia>
        <EmptyTitle>Noch keine Aufgaben</EmptyTitle>
        <EmptyDescription>
          Du hast dich noch nicht fuer Aufgaben eingetragen. Schau dir die offenen Aufgaben an und hilf mit!
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <Empty className="py-12">
      <EmptyMedia variant="icon">
        <ClipboardList className="h-6 w-6" />
      </EmptyMedia>
      <EmptyTitle>Keine Aufgaben</EmptyTitle>
      <EmptyDescription>
        Es wurden noch keine Aufgaben angelegt.
      </EmptyDescription>
    </Empty>
  )
}
