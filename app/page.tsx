'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import LoginScreen from '@/components/LoginScreen';
import PlanningList from '@/components/PlanningList';
import ErkiApp from '@/components/ErkiApp';
import { loadPlanning, savePlanning } from '@/lib/db';
import { Plan } from '@/lib/types';

type View = 'login' | 'list' | 'editor';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('login');
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setView(session?.user ? 'list' : 'login');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setActivePlan(null);
        setView('login');
      } else if (view === 'login') {
        setView('list');
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenPlan = async (planId: string) => {
    setLoadingPlan(true);
    try {
      const plan = await loadPlanning(planId);
      setActivePlan(plan);
      setView('editor');
    } catch (e) {
      console.error(e);
      alert('Fehler beim Laden der Planung.');
    }
    setLoadingPlan(false);
  };

  const handlePlanUpdate = useCallback((updatedPlan: Plan) => {
    setActivePlan(updatedPlan);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await savePlanning(updatedPlan);
      } catch (e) {
        console.error('Auto-save fehlgeschlagen:', e);
      }
    }, 1500);
  }, []);

  const handleBack = useCallback(async () => {
    if (activePlan) {
      clearTimeout(saveTimer.current);
      try {
        await savePlanning(activePlan);
      } catch (e) {
        console.error('Speichern fehlgeschlagen:', e);
      }
    }
    setActivePlan(null);
    setView('list');
  }, [activePlan]);

  if (loadingPlan) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#fdfdfd]">
        <p className="text-gray-400">Wird geladen…</p>
      </main>
    );
  }

  if (view === 'login') return <LoginScreen />;

  if (view === 'list' && user) {
    return <PlanningList user={user} onOpenPlan={handleOpenPlan} />;
  }

  if (view === 'editor' && activePlan && user) {
    return (
      <main className="min-h-screen">
        <ErkiApp
          plan={activePlan}
          user={user}
          onPlanUpdate={handlePlanUpdate}
          onBack={handleBack}
        />
      </main>
    );
  }

  return null;
}
