'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import LoginScreen from '@/components/LoginScreen';
import PlanningList from '@/components/PlanningList';
import ErkiApp from '@/components/ErkiApp';
import { loadPlanningMeta, savePlanning, loadProfile, loadCommunity, updateProfileNameAndTeam } from '@/lib/db';
import { Plan, Profile, Community } from '@/lib/types';
import OnboardingModal from '@/components/OnboardingModal';

type View = 'login' | 'list' | 'editor';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [view, setView] = useState<View>('login');
  const viewRef = useRef<View>('login');
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
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

  // viewRef keeps the auth state change handler from using a stale closure value
  useEffect(() => { viewRef.current = view; }, [view]);

  const loadUserProfile = useCallback(async (userId: string) => {
    try {
      const p = await loadProfile(userId);
      setProfile(p);
      if (p?.communityId) {
        const c = await loadCommunity(p.communityId);
        setCommunity(c);
      }
      if (p && !p.team) {
        setNeedsOnboarding(true);
      }
    } catch (e) {
      console.error('[loadUserProfile] Fehler:', e);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
        const storedPlanId = sessionStorage.getItem('activePlanId');
        if (storedPlanId) {
          handleOpenPlan(storedPlanId);
        } else {
          setView('list');
        }
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
      } else if (viewRef.current === 'login') {
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
      const plan = await loadPlanningMeta(planId);
      latestPlanRef.current = plan;
      isDirtyRef.current = false;
      sessionStorage.setItem('activePlanId', planId);
      setActivePlan(plan);
      setView('editor');
    } catch (e) {
      console.error(e);
      sessionStorage.removeItem('activePlanId');
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

  // Wird von ErkiApp aufgerufen, wenn eine strukturelle Änderung (z.B.
  // addStation) sofort persistiert werden soll, ohne auf den 1.5s
  // Auto-Save-Timer zu warten. Sequenzialisiert über inFlightSaveRef, damit
  // sich parallele DELETE+INSERT-Aufrufe nicht überlagern.
  const handleImmediateSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const prev = inFlightSaveRef.current ?? Promise.resolve();
    const savePromise: Promise<void> = prev
      .catch(() => {})
      .then(() => {
        const planToSave = latestPlanRef.current;
        if (!planToSave) return;
        console.log('[Immediate-Save] speichere:', planToSave.title, '| Stationen:', planToSave.stations.length);
        return runSave(planToSave);
      });
    inFlightSaveRef.current = savePromise;
    savePromise.finally(() => {
      if (inFlightSaveRef.current === savePromise) {
        inFlightSaveRef.current = null;
      }
    });
  }, [runSave]);

  const handlePlanUpdate = useCallback((updatedPlan: Plan) => {
    console.log('[handlePlanUpdate] aufgerufen:', {
      id: updatedPlan.id,
      title: updatedPlan.title,
      stations: updatedPlan.stations.length,
      status: updatedPlan.status,
    });
    latestPlanRef.current = updatedPlan;
    isDirtyRef.current = true;
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

  // Externes Realtime-Update von einem anderen Client – kein Auto-Save, kein dirty-Flag.
  const handleExternalPlanUpdate = useCallback((updatedPlan: Plan) => {
    latestPlanRef.current = updatedPlan;
    setActivePlan(updatedPlan);
  }, []);

  // Direkt-Speichern mit EXPLIZIT übergebenem Plan – keine Ref-Reads, keine Timing-Risiken.
  // Wird z.B. von addStation aufgerufen, damit der neue Zustand sofort persistiert ist,
  // selbst wenn der User unmittelbar danach "Zurück" klickt.
  const handleSaveNow = useCallback(async (planToSave: Plan): Promise<void> => {
    console.log('[handleSaveNow] direkt:', planToSave.title, '| Stationen:', planToSave.stations.length);
    // Geplanten Auto-Save stornieren – wir speichern jetzt sofort.
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    // Vorherigen Save abwarten, damit DELETE+INSERT sich nicht überlagern.
    if (inFlightSaveRef.current) {
      try { await inFlightSaveRef.current; } catch { /* bereits geloggt */ }
    }
    // Ref synchron aktualisieren, damit nachfolgende handleBack-Calls denselben Stand sehen.
    latestPlanRef.current = planToSave;
    isDirtyRef.current = true;
    setIsSaving(true);
    const savePromise = (async () => {
      try {
        await savePlanning(planToSave);
        if (latestPlanRef.current === planToSave) {
          isDirtyRef.current = false;
        }
        console.log('[handleSaveNow] erfolgreich');
      } catch (e) {
        console.error('[handleSaveNow] FEHLGESCHLAGEN:', e);
      } finally {
        setIsSaving(false);
      }
    })();
    inFlightSaveRef.current = savePromise;
    savePromise.finally(() => {
      if (inFlightSaveRef.current === savePromise) {
        inFlightSaveRef.current = null;
      }
    });
    await savePromise;
  }, []);

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
    // Noch laufenden Save abwarten, damit sich DELETE+INSERT zweier parallel
    // laufender savePlanning-Aufrufe nicht überlagern.
    if (inFlightSaveRef.current) {
      console.log('[handleBack] warte auf laufenden Save...');
      try { await inFlightSaveRef.current; } catch { /* bereits geloggt */ }
    }
    const plan = latestPlanRef.current;
    console.log('[handleBack] latestPlanRef.current:', plan
      ? { id: plan.id, title: plan.title, stations: plan.stations.length }
      : null
    );
    // UNBEDINGT speichern, wenn ein Plan in der Ref liegt – kein isDirtyRef-Check mehr.
    // Warum: ein verpasster Save ist schlimmer als ein redundanter Save. Der bisherige
    // dirty-Gate hatte zu Datenverlust geführt, wenn isDirtyRef fälschlich false war.
    if (plan) {
      console.log('[handleBack] starte savePlanning (unbedingt)...');
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
    } else {
      console.warn('[handleBack] kein Plan in latestPlanRef – nichts gespeichert!');
    }
    latestPlanRef.current = null;
    isDirtyRef.current = false;
    sessionStorage.removeItem('activePlanId');
    setActivePlan(null);
    setView('list');
  }, []);

  if (loadingPlan) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-[#fdfdfd]">
        <p className="text-gray-600">Wird geladen…</p>
      </main>
    );
  }

  if (view === 'login') return <LoginScreen />;

  if (view === 'list' && user) {
    return (
      <>
        <PlanningList
          user={user}
          profile={profile}
          community={community}
          onOpenPlan={handleOpenPlan}
        />
        {needsOnboarding && (
          <OnboardingModal
            initialName={profile?.name || profile?.displayName || user.user_metadata?.name || ''}
            onComplete={async (name, team) => {
              await updateProfileNameAndTeam(user.id, name, team);
              setProfile(p => p ? { ...p, name, team } : p);
              setNeedsOnboarding(false);
            }}
          />
        )}
      </>
    );
  }

  if (view === 'editor' && activePlan && user) {
    return (
      <main className="min-h-[100dvh]">
        <ErkiApp
          plan={activePlan}
          user={user}
          onPlanUpdate={handlePlanUpdate}
          onExternalPlanUpdate={handleExternalPlanUpdate}
          onSaveNow={handleSaveNow}
          onBack={handleBack}
          onImmediateSave={handleImmediateSave}
          isSaving={isSaving}
          latestPlanRef={latestPlanRef}
          isDirtyRef={isDirtyRef}
        />
      </main>
    );
  }

  return null;
}
