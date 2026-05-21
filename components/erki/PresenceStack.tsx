'use client';

import React from 'react';
import {
    dedupeOnlineUsers,
    getInitials,
    getPresenceColor,
    type PresenceUserLike,
} from '@/lib/realtime/presenceUtils';

interface PresenceStackProps<T extends PresenceUserLike> {
    onlineUsers: T[];
    currentUser: PresenceUserLike;
    /** Maximale Anzahl sichtbarer Avatare (Default 4). */
    maxVisible?: number;
}

/**
 * Zeigt einen horizontalen Stapel kleiner Avatar-Bubbles fuer alle anderen
 * online-User. Eigener User wird ausgefiltert (siehe `currentUser`).
 *
 * Bei mehr Online-Usern als `maxVisible` wird ein "+N"-Bubble angehaengt.
 * Wenn nach dem Filtern niemand uebrig ist, rendert die Komponente `null`.
 */
export default function PresenceStack<T extends PresenceUserLike>({
    onlineUsers,
    currentUser,
    maxVisible = 4,
}: PresenceStackProps<T>) {
    const others = dedupeOnlineUsers(onlineUsers).filter(
        u => u.userId !== currentUser.userId,
    );
    if (others.length === 0) return null;

    const visible = others.slice(0, maxVisible);
    const overflow = others.length - visible.length;

    return (
        <div className="flex items-center" aria-label="Andere Online-User">
            {visible.map((u, idx) => (
                <div
                    key={u.userId}
                    title={u.displayName}
                    className="flex items-center justify-center text-white text-xs font-semibold rounded-full border border-white shadow-sm"
                    style={{
                        width: 28,
                        height: 28,
                        backgroundColor: getPresenceColor(u.userId),
                        marginLeft: idx === 0 ? 0 : -8,
                    }}
                >
                    {getInitials(u.displayName)}
                </div>
            ))}
            {overflow > 0 && (
                <div
                    title={`+${overflow} weitere`}
                    className="flex items-center justify-center text-white text-xs font-semibold rounded-full border border-white shadow-sm bg-gray-500"
                    style={{ width: 28, height: 28, marginLeft: -8 }}
                >
                    +{overflow}
                </div>
            )}
        </div>
    );
}
