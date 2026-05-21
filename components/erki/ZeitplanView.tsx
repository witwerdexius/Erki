'use client';

import { Timeline } from '@/components/zeitplan/timeline';
import { FilterTabs } from '@/components/zeitplan/filter-tabs';
import { PhaseList } from '@/components/zeitplan/phase-list';
import { StatsCards } from '@/components/zeitplan/stats-cards';
import { EmptyState } from '@/components/zeitplan/empty-state';
import type { Phase } from '@/components/zeitplan/types';

type ZeitplanViewProps = {
    phases: Phase[];
    filter: 'all' | 'open' | 'mine';
    onFilterChange: (filter: 'all' | 'open' | 'mine') => void;
    onSignUp: (phaseId: string, taskId: string, name: string) => void;
    onRemove: (phaseId: string, taskId: string, volunteerName: string) => void;
    currentUser: string;
};

export default function ZeitplanView({
    phases,
    filter,
    onFilterChange,
    onSignUp,
    onRemove,
    currentUser,
}: ZeitplanViewProps) {
    const totalSlots = phases.reduce((acc, p) => acc + p.tasks.reduce((a, t) => a + t.slots, 0), 0);
    const filledSlots = phases.reduce((acc, p) => acc + p.tasks.reduce((a, t) => a + t.filled, 0), 0);
    const openTasks = phases.reduce((acc, p) => acc + p.tasks.filter(t => t.filled < t.slots).length, 0);
    const myTasks = phases.reduce((acc, p) => acc + p.tasks.filter(t => t.volunteers.includes(currentUser)).length, 0);

    const filteredPhases = phases
        .map(phase => ({
            ...phase,
            tasks: phase.tasks.filter(task => {
                if (filter === 'open') return task.filled < task.slots;
                if (filter === 'mine') return task.volunteers.includes(currentUser);
                return true;
            }),
        }))
        .filter(phase => phase.tasks.length > 0);

    return (
        <div className="flex-1 overflow-auto bg-background">
            <div className="px-4 py-6 pb-24 max-w-lg mx-auto">
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
                    onFilterChange={onFilterChange}
                    openCount={openTasks}
                    myCount={myTasks}
                />
                {filteredPhases.length > 0 ? (
                    <PhaseList
                        phases={filteredPhases}
                        onSignUp={onSignUp}
                        onRemove={onRemove}
                        currentUser={currentUser}
                    />
                ) : (
                    <EmptyState filter={filter} />
                )}
            </div>
        </div>
    );
}
