'use client';

import { useState, useEffect } from 'react';
import { Plus, FolderOpen, Trash2, Upload, Download, LogOut, Settings, History, Link } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { loadPlannings, createPlanning, updatePlanningStatus, importPlannings, savePlanning } from '@/lib/db';
import { Plan, PlanStatus, Profile, Community } from '@/lib/types';
import { importPlanFromUrl } from '@/lib/actions';
import AdminPanel from '@/components/AdminPanel';
import PlanningHistory from '@/components/PlanningHistory';
import { ThemeToggle } from '@/components/ThemeToggle';

const STATUS_LABELS: Record<PlanStatus, string> = {
  draft: 'Entwurf',
  active: 'Aktiv',
  archive: 'Archiv',
};

const STATUS_COLORS: Record<PlanStatus, string> = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  active: 'bg-[#7bc9a0]/25 text-[#2d7a52] dark:text-[#5ecf98]',
  archive: 'bg-[#6bbfd4]/25 text-[#2a7a8c] dark:text-[#6bbfd4]',
};

interface Props {
  user: User;
  profile: Profile | null;
  community: Community | null;
  onOpenPlan: (planId: string) => void;
}

export default function PlanningList({ user, profile, community, onOpenPlan }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [historyPlan, setHistoryPlan] = useState<{ id: string; title: string } | null>(null);
  const [urlImportDialog, setUrlImportDialog] = useState<{ planId: string } | null>(null);
  const [dialogUrl, setDialogUrl] = useState('');
  const [dialogImporting, setDialogImporting] = useState(false);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    loadPlannings()
      .then(setPlans)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const plan = await createPlanning('Neuer Plan', user.id);
      setPlans(prev => [plan, ...prev]);
      setDialogUrl('');
      setUrlImportDialog({ planId: plan.id });
    } catch (e) {
      console.error(e);
      alert('Fehler beim Erstellen der Planung.');
    }
    setCreating(false);
  };

  const handleUrlImport = async () => {
    if (!urlImportDialog || !dialogUrl.trim()) return;
    setDialogImporting(true);
    try {
      const result = await importPlanFromUrl(dialogUrl.trim());
      if (result.success && result.data) {
        const base = plans.find(p => p.id === urlImportDialog.planId);
        if (base) {
          const updated: Plan = {
            ...base,
            title: result.data.title || base.title,
            stations: result.data.stations,
            sourceUrl: dialogUrl.trim(),
          };
          await savePlanning(updated, base);
          setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
        }
      } else {
        alert('Import fehlgeschlagen: ' + result.error);
        setDialogImporting(false);
        return;
      }
    } catch (e) {
      console.error(e);
      alert('Fehler beim Importieren.');
      setDialogImporting(false);
      return;
    }
    const planId = urlImportDialog.planId;
    setUrlImportDialog(null);
    setDialogImporting(false);
    onOpenPlan(planId);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Planung „${title}" wirklich löschen?`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/plannings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Löschen fehlgeschlagen');
      }
      setPlans(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error(e);
      alert('Fehler beim Löschen: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleStatusChange = async (id: string, status: PlanStatus) => {
    try {
      await updatePlanningStatus(id, status);
      setPlans(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } catch (e) {
      console.error(e);
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(plans);
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erki-plaene-${new Date().toISOString().split('T')[0]}.rki`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id && parsed[0].stations) {
          await importPlannings(parsed, user.id);
          const refreshed = await loadPlannings();
          setPlans(refreshed);
          alert(`${parsed.length} Planung(en) erfolgreich importiert.`);
        } else {
          alert('Ungültiges Dateiformat. Bitte eine gültige .rki-Datei wählen.');
        }
      } catch {
        alert('Fehler beim Importieren der Datei.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-[100dvh] bg-[#fdfdfd] dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="flex h-14 items-center justify-between px-4 sm:px-8 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#6bbfd4] flex items-center justify-center text-white font-bold shrink-0">
            EK
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold tracking-tight leading-tight text-gray-900 dark:text-gray-50">Erlebnis Kirche Planner</h1>
            {community && (
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{community.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 dark:text-gray-400 max-w-[140px] sm:max-w-none truncate">{profile?.name || profile?.displayName || user.email}</span>
          <ThemeToggle />
          {isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              className="flex items-center gap-1.5 text-sm text-[#6bbfd4] hover:text-[#5aaec3] transition-colors p-1.5 -m-1.5 rounded-lg"
              title="Verwaltung"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Verwaltung</span>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1.5 -m-1.5 rounded-lg"
            title="Abmelden"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Abmelden</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Planungen</h2>
          <div className="flex gap-2">
            <label
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              title=".rki-Backup importieren"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
              <input type="file" className="hidden" accept=".rki" onChange={handleImport} />
            </label>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="Alle Planungen als .rki exportieren"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 bg-[#6bbfd4] text-white text-sm rounded-xl hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-50 font-medium"
            >
              <Plus className="w-4 h-4" />
              Neue Planung
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">Wird geladen…</div>
        ) : plans.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400 mb-6">Noch keine Planungen vorhanden.</p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-6 py-3 bg-[#6bbfd4] text-white rounded-xl font-medium hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              Erste Planung erstellen
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {plans.map(plan => (
              <div
                key={plan.id}
                className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-[#6bbfd4]/40 dark:hover:border-[#6bbfd4]/50 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-gray-50 break-words">{plan.title}</span>
                    <select
                      value={plan.status}
                      onChange={(e) => handleStatusChange(plan.id, e.target.value as PlanStatus)}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs px-2.5 py-0.5 rounded-full border-0 outline-none cursor-pointer font-medium appearance-none ${STATUS_COLORS[plan.status]}`}
                    >
                      {(Object.keys(STATUS_LABELS) as PlanStatus[]).map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {plan.stationCount ?? plan.stations.length} Station{(plan.stationCount ?? plan.stations.length) !== 1 ? 'en' : ''}
                    {plan.updatedAt ? ` · ${formatDate(plan.updatedAt)}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setHistoryPlan({ id: plan.id, title: plan.title })}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-[#6bbfd4] transition-colors"
                        title="Verlauf anzeigen"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(plan.id, plan.title)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Planung löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => onOpenPlan(plan.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#6bbfd4] text-white text-sm rounded-xl hover:bg-[#5aaec3] active:scale-[0.98] transition-all font-medium"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Öffnen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
        © 2026 Erlebnis Kirche Planner · v{process.env.NEXT_PUBLIC_APP_VERSION}
      </footer>

      {showAdmin && isAdmin && (
        <AdminPanel
          community={community}
          currentUserId={user.id}
          adminProfile={profile}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {historyPlan && isAdmin && (
        <PlanningHistory
          planningId={historyPlan.id}
          planningTitle={historyPlan.title}
          onClose={() => setHistoryPlan(null)}
          onRestored={async () => {
            const refreshed = await loadPlannings();
            setPlans(refreshed);
          }}
        />
      )}

      {urlImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-1">Stationen importieren?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Füge eine URL von jugendarbeit.online ein, um Stationen direkt zu importieren — oder öffne die Planung ohne Import.
            </p>
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-600 focus-within:ring-2 ring-[#6bbfd4]/30 mb-4">
              <Link className="w-4 h-4 text-gray-400 dark:text-gray-500 mr-2 shrink-0" />
              <input
                type="url"
                autoFocus
                placeholder="https://jugendarbeit.online/…"
                className="bg-transparent border-none outline-none text-sm flex-1 min-w-0 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                value={dialogUrl}
                onChange={(e) => setDialogUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleUrlImport(); }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { const id = urlImportDialog.planId; setUrlImportDialog(null); onOpenPlan(id); }}
                disabled={dialogImporting}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Ohne Import öffnen
              </button>
              <button
                onClick={() => void handleUrlImport()}
                disabled={dialogImporting || !dialogUrl.trim()}
                className="px-4 py-2 text-sm bg-[#6bbfd4] text-white rounded-xl hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-50 font-medium"
              >
                {dialogImporting ? 'Importiere…' : 'Importieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
