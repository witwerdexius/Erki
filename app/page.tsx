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
  // True, sobald der User im Editor eine Änderung gemacht hat, die noch nicht
  // erfolgreich gespeichert wurde. Verhindert, dass handleBack unnötig
  // savePlanning aufruft (DELETE+INSERT-Pattern würde bei Fehler Stationen verlieren).
  const isDirtyRef = useRef(false);
  // Hält die aktuell laufende savePlanning-Promise, damit handleBack darauf
  // warten kann, bevor selbst gespeichert wird (verhindert DELETE+INSERT-Races).
  const inFlightSaveRef = useRef<Promise<void> | null>(null);

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
      // Frisch geladener Plan – noch keine ungespeicherten Änderungen.
      isDirtyRef.current = false;
      setActivePlan(plan);
      setView('editor');
    } catch (e) {
      console.error(e);
      alert('Fehler beim Laden der Planung.');
    }
    setLoadingPlan(false);
  };

  // Führt einen savePlanning-Call aus und markiert die ref als clean,
  // wenn in der Zwischenzeit keine neue Änderung reinkam.
  const runSave = useCallback(async (planToSave: Plan): Promise<void> => {
    try {
      await savePlanning(planToSave);
      if (latestPlanRef.current === planToSave) {
        isDirtyRef.current = false;
      }
      console.log('[Auto-Save] erfolgreich');
    } catch (e) {
      console.error('[Auto-Save] fehlgeschlagen:', e);
    }
  }, []);

  const handlePlanUpdate = useCallback((updatedPlan: Plan) => {
    console.log('[handlePlanUpdate] aufgerufen:', {
      id: updatedPlan.id,
      title: updatedPlan.title,
      stations: updatedPlan.stations.length,
      status: updatedPlan.status,
    });
    latestPlanRef.current = updatedPlan;
    isDirtyRef.current = true;
    console.log('[handlePlanUpdate] latestPlanRef gesetzt auf:', updatedPlan.title);
    setActivePlan(updatedPlan);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const planToSave = latestPlanRef.current;
      if (!planToSave || !isDirtyRef.current) return;
      console.log('[Auto-Save] speichere:', planToSave.title, '| Stationen:', planToSave.stations.length);
      const savePromise = runSave(planToSave);
      inFlightSaveRef.current = savePromise;
      savePromise.finally(() => {
        if (inFlightSaveRef.current === savePromise) {
          inFlightSaveRef.current = null;
        }
      });
    }, 1500);
  }, [runSave]);

  const handleBack = useCallback(async () => {
    console.log('[handleBack] aufgerufen');
    // Geplanten Auto-Save abbrechen – wir speichern hier einmal, final.
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    // onBlur auf fokussiertem Element erzwingen, damit contentEditable-Inhalte
    // noch in latestPlanRef fließen. Timer danach neu canceln, falls handlePlanUpdate
    // intern einen neuen gesetzt hat.
    (document.activeElement as HTMLElement)?.blur?.();
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    // Einen Microtask-Tick abwarten, damit React etwaige onBlur-Handler
    // vollständig verarbeiten kann, bevor wir latestPlanRef lesen.
    await Promise.resolve();
    // Noch laufenden Auto-Save abwarten, damit sich DELETE+INSERT zweier
    // parallel laufender savePlanning-Aufrufe nicht überlagern (sonst kann
    // eine DELETE-Operation die Stationen des anderen INSERT-Aufrufs wegräumen).
    if (inFlightSaveRef.current) {
      console.log('[handleBack] warte auf laufenden Auto-Save...');
      try { await inFlightSaveRef.current; } catch { /* bereits geloggt */ }
    }
    const plan = latestPlanRef.current;
    const dirty = isDirtyRef.current;
    console.log('[handleBack] latestPlanRef.current:', plan
      ? { id: plan.id, title: plan.title, stations: plan.stations.length, dirty }
      : null
    );
    // Nur speichern, wenn der User auch wirklich etwas geändert hat. Sonst
    // würde der DELETE-then-INSERT-Pfad in savePlanning unnötig ausgeführt –
    // und bei einem Fehler zwischen DELETE und INSERT wären Stationen weg.
    if (plan && dirty) {
      console.log('[handleBack] starte savePlanning...');
      setIsSaving(true);
      try {
        await savePlanning(plan);
        isDirtyRef.current = false;
        console.log('[handleBack] savePlanning erfolgreich');
      } catch (e) {
        console.error('[handleBack] savePlanning FEHLGESCHLAGEN:', e);
      } finally {
        setIsSaving(false);
      }
    } else if (!plan) {
      console.warn('[handleBack] kein Plan in latestPlanRef – nichts gespeichert!');
    } else {
      console.log('[handleBack] keine Änderungen – Speichern übersprungen');
    }
    latestPlanRef.current = null;
    isDirtyRef.current = false;
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
