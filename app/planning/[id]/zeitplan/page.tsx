'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadPlanningMeta } from '@/lib/db'
import { Timeline } from '@/components/zeitplan/timeline'
import { FilterTabs } from '@/components/zeitplan/filter-tabs'
import { PhaseList } from '@/components/zeitplan/phase-list'
import { StatsCards } from '@/components/zeitplan/stats-cards'
import { EmptyState } from '@/components/zeitplan/empty-state'
import type { Phase, Task } from '@/components/zeitplan/types'
import type { Station } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

function stationsToPhases(stations: Station[]): Phase[] {
  const tasks: Task[] = stations.map(s => {
    const volunteers = [s.conductedBy, s.setupBy].filter(v => v && v.trim() !== '')
    return {
      id: s.id,
      name: `${s.number ? s.number + ' – ' : ''}${s.name}`,
      slots: 2,
      filled: volunteers.length,
      volunteers,
    }
  })
  if (tasks.length === 0) return []
  return [
    {
      id: 'stationen',
      name: 'Stationen',
      description: 'Alle Stationen dieser Planung',
      time: '',
      tasks,
    },
  ]
}

export default function ZeitplanPage() {
  const params = useParams<{ id: string }>()
  const planId = params.id
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [phases, setPhases] = useState<Phase[]>([])
  const [planTitle, setPlanTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'mine'>('all')

  const currentUser = user?.user_metadata?.name ?? user?.email ?? 'Ich'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.push('/'); return }
      setUser(session.user)
    })
  }, [router])

  useEffect(() => {
    if (!planId) return
    loadPlanningMeta(planId)
      .then(plan => {
        setPlanTitle(plan.title)
        setPhases(stationsToPhases(plan.stations))
      })
      .catch(() => router.push('/'))
      .finally(() => setLoading(false))
  }, [planId, router])

  const handleSignUp = (phaseId: string, taskId: string, name: string) => {
    setPhases(prev => prev.map(phase => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: phase.tasks.map(task => {
          if (task.id !== taskId) return task
          return { ...task, filled: task.filled + 1, volunteers: [...task.volunteers, name] }
        }),
      }
    }))
  }

  const handleRemove = (phaseId: string, taskId: string, volunteerName: string) => {
    setPhases(prev => prev.map(phase => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: phase.tasks.map(task => {
          if (task.id !== taskId) return task
          const newVolunteers = task.volunteers.filter(v => v !== volunteerName)
          return { ...task, filled: newVolunteers.length, volunteers: newVolunteers }
        }),
      }
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Wird geladen…</p>
      </div>
    )
  }

  const totalSlots = phases.reduce((acc, p) => acc + p.tasks.reduce((a, t) => a + t.slots, 0), 0)
  const filledSlots = phases.reduce((acc, p) => acc + p.tasks.reduce((a, t) => a + t.filled, 0), 0)
  const openTasks = phases.reduce((acc, p) => acc + p.tasks.filter(t => t.filled < t.slots).length, 0)
  const myTasks = phases.reduce((acc, p) => acc + p.tasks.filter(t => t.volunteers.includes(currentUser)).length, 0)

  const filteredPhases = phases
    .map(phase => ({
      ...phase,
      tasks: phase.tasks.filter(task => {
        if (filter === 'open') return task.filled < task.slots
        if (filter === 'mine') return task.volunteers.includes(currentUser)
        return true
      }),
    }))
    .filter(phase => phase.tasks.length > 0)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex h-14 items-center px-4 gap-3">
          <button
            onClick={() => router.back()}
            className="h-8 w-8 rounded-lg bg-[#6bbfd4] flex items-center justify-center text-white shrink-0 hover:bg-[#5aaec3] transition-colors"
            title="Zurück"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold truncate flex-1">{planTitle} – Zeitplan</h1>
        </div>
      </header>

      <main className="px-4 py-6 pb-24 max-w-lg mx-auto">
        {phases.length > 0 && (
          <>
            <Timeline phases={phases} />
            <StatsCards
              totalSlots={totalSlots}
              filledSlots={filledSlots}
              openTasks={openTasks}
              myTasks={myTasks}
            />
          </>
        )}
        <FilterTabs
          filter={filter}
          onFilterChange={setFilter}
          openCount={openTasks}
          myCount={myTasks}
        />
        {filteredPhases.length > 0 ? (
          <PhaseList
            phases={filteredPhases}
            onSignUp={handleSignUp}
            onRemove={handleRemove}
            currentUser={currentUser}
          />
        ) : (
          <EmptyState filter={filter} />
        )}
      </main>
    </div>
  )
}
