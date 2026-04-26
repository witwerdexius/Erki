'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface PlanningInfo {
  planningId: string;
  title: string;
  status: string;
  updatedAt: string;
  stationCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  active: 'Aktiv',
  archive: 'Archiv',
};

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [planning, setPlanning] = useState<PlanningInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const [planRes, { data: { session } }] = await Promise.all([
        fetch(`/api/share/${token}`),
        supabase.auth.getSession(),
      ]);

      setUser(session?.user ?? null);

      if (!planRes.ok) {
        setError('Dieser Link ist ungültig oder abgelaufen.');
        setLoading(false);
        return;
      }

      setPlanning(await planRes.json());
      setLoading(false);
    }
    init();
  }, [token]);

  const handleJoin = async () => {
    if (!user) return;
    setJoining(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/share/${token}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? 'Fehler beim Beitreten.');
        return;
      }

      const { planningId } = await res.json();
      sessionStorage.setItem('activePlanId', planningId);
      router.push('/');
    } catch (e) {
      console.error('[SharePage] join error:', e);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-[#fdfdfd]">
        <p className="text-gray-600">Wird geladen…</p>
      </main>
    );
  }

  if (error || !planning) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-[#fdfdfd]">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{error ?? 'Planung nicht gefunden.'}</p>
          <a href="/" className="text-[#6bbfd4] hover:underline">Zur Startseite</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#fdfdfd] text-[#1a1a1a] font-sans">
      <div className="bg-[#6bbfd4] text-white px-4 py-3 flex items-center justify-between gap-4">
        <span className="text-sm font-medium">
          {user
            ? 'Diese Planung wurde mit dir geteilt'
            : 'Melde dich an um diese Planung zu bearbeiten'}
        </span>
        {user ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="bg-white text-[#6bbfd4] px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-70 shrink-0"
          >
            {joining ? '…' : 'Zu meiner Planung hinzufügen'}
          </button>
        ) : (
          <a
            href="/"
            className="bg-white text-[#6bbfd4] px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-gray-50 transition-colors shrink-0"
          >
            Zum Login
          </a>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-2">{planning.title}</h1>
        <p className="text-gray-500 text-sm mb-8">
          {planning.stationCount} Station{planning.stationCount !== 1 ? 'en' : ''}{' '}
          · {STATUS_LABELS[planning.status] ?? planning.status}
        </p>
        <div className="bg-gray-50 border rounded-xl p-8 text-gray-400 text-center text-sm">
          Vorschau nach dem Beitreten in der App verfügbar
        </div>
      </div>
    </main>
  );
}
