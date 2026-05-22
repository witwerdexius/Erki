'use client';

import { Timeline } from '@/components/zeitplan/timeline';
import { FilterTabs } from '@/components/zeitplan/filter-tabs';
import { PhaseList } from '@/components/zeitplan/phase-list';
import { EmptyState } from '@/components/zeitplan/empty-state';
import type { Phase } from '@/components/zeitplan/types';

type ZeitplanViewProps = {
    phases: Phase[];
    filter: 'all' | 'open' | 'mine';
    onFilterChange: (filter: 'all' | 'open' | 'mine') => void;
    onSignUp: (phaseId: string, taskId: string, name: string) => void;
    onRemove: (phaseId: string, taskId: string, volunteerName: string) => void;
    currentUser: string;
    /** Wenn true: kein eigener Scroll-Wrapper — zur Einbettung in andere Scroll-Container. */
    embedded?: boolean;
    /** Wenn true: Timeline + FilterTabs nicht rendern (nur Phasen-/Task-Liste). */
    hideFilterBar?: boolean;
};

export default function ZeitplanView({
    phases,
    filter,
    onFilterChange,
    onSignUp,
    onRemove,
    currentUser,
    embedded = false,
    hideFilterBar = false,
}: ZeitplanViewProps) {
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

    const content = (
        <>
            {!hideFilterBar && phases.length > 0 && (
                <Timeline phases={phases} />
            )}
            {!hideFilterBar && (
                <FilterTabs
                    filter={filter}
                    onFilterChange={onFilterChange}
                    openCount={openTasks}
                    myCount={myTasks}
                />
            )}
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
        </>
    );

    if (embedded) {
        return <div className="px-4 py-3 space-y-3">{content}</div>;
    }

    return (
        <div className="flex-1 overflow-auto bg-background">
            <div className="px-4 py-6 pb-24 max-w-lg mx-auto">
                {content}
            </div>
        </div>
    );
}
