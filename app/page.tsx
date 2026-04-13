'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import LoginScreen from '@/components/LoginScreen';
import PlanningList from '@/components/PlanningList';
import ErkiApp from '@/components/ErkiApp';
import { loadPlanning, savePlanning, loadProfile, loadCommunity } from '@/lib/db';
import { Plan, Profile, Community } from '@/lib/types';

type View = 'login' | 'list' | 'editor';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [view, setView] = useState<View>('login');
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Ref hält immer den neuesten Plan-Stand synchron (unabhängig von React-State-Batching)
  const latestPlanRef = useRef<Plan | null>(null);

  const loadUserProfile = useCallback(async (userId: string) => {
    try {
      const p = await loadProfile(userId);
      setProfile(p);
      if (p?.communityId) {
        const c = await loadCommunity(p.communityId);
        setCommunity(c);
      }
    } catch (e) {
      console.error('[loadUserProfile] Fehler:', e);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setView('list');
        loadUserProfile(session.user.id);
      } else {
        setView('login');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setActivePlan(null);
        setProfile(null);
        setCommunity(null);
        setView('login');
      } else if (view === 'login') {
        setView('list');
        loadUserProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenPlan = async (planId: string) => {
    setLoadingPlan(true);
    try {
      const plan = await loadPlanning(planId);
      latestPlanRef.current = plan;
      setActivePlan(plan);
      setView('editor');
    } catch (e) {
      console.error(e);
      alert('Fehler beim Laden der Planung.');
    }
    setLoadingPlan(false);
  };

  const handlePlanUpdate = useCallback((updatedPlan: Plan) => {
    console.log('[handlePlanUpdate] aufgerufen:', {
      id: updatedPlan.id,
      title: updatedPlan.title,
      stations: updatedPlan.stations.length,
      status: updatedPlan.status,
    });
    latestPlanRef.current = updatedPlan;
    console.log('[handlePlanUpdate] latestPlanRef gesetzt auf:', updatedPlan.title);
    setActivePlan(updatedPlan);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      console.log('[Auto-Save] speichere:', updatedPlan.title, '| Stationen:', updatedPlan.stations.length);
      try {
        await savePlanning(updatedPlan);
        console.log('[Auto-Save] erfolgreich');
      } catch (e) {
        console.error('[Auto-Save] fehlgeschlagen:', e);
      }
    }, 1500);
  }, []);

  const handleBack = useCallback(async () => {
    console.log('[handleBack] aufgerufen');
    clearTimeout(saveTimer.current);
    const plan = latestPlanRef.current;
    console.log('[handleBack] latestPlanRef.current:', plan
      ? { id: plan.id, title: plan.title, stations: plan.stations.length }
      : null
    );
    if (plan) {
      console.log('[handleBack] starte savePlanning...');
      setIsSaving(true);
      try {
        await savePlanning(plan);
        console.log('[handleBack] savePlanning erfolgreich');
      } catch (e) {
        console.error('[handleBack] savePlanning FEHLGESCHLAGEN:', e);
      } finally {
        setIsSaving(false);
      }
    } else {
      console.warn('[handleBack] kein Plan in latestPlanRef – nichts gespeichert!');
    }
    latestPlanRef.current = null;
    setActivePlan(null);
    console.log('[handleBack] navigiere zurück zur Liste');
    setView('list');
  }, []);

  if (loadingPlan) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#fdfdfd]">
        <p className="text-gray-600">Wird geladen…</p>
      </main>
    );
  }

  if (view === 'login') return <LoginScreen />;

  if (view === 'list' && user) {
    return (
      <PlanningList
        user={user}
        profile={profile}
        community={community}
        onOpenPlan={handleOpenPlan}
      />
    );
  }

  if (view === 'editor' && activePlan && user) {
    return (
      <main className="min-h-screen">
        <ErkiApp
          plan={activePlan}
          user={user}
          onPlanUpdate={handlePlanUpdate}
          onBack={handleBack}
          isSaving={isSaving}
        />
      </main>
    );
  }

  return null;
}
