'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PlanningSnapshot } from '@/lib/types';

interface Props {
  planningId: string;
  planningTitle: string;
  onClose: () => void;
  onRestored: () => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  before_station_delete: 'Vor Stations-Löschung',
  before_restore:        'Vor Wiederherstellung',
  manual:                'Manuell',
};

function triggerLabel(action: string): string {
  return TRIGGER_LABELS[action] ?? action;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function PlanningHistory({ planningId, planningTitle, onClose, onRestored }: Props) {
  const [snapshots, setSnapshots] = useState<PlanningSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/snapshots?planningId=${planningId}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Fehler beim Laden');
      }
      const body = await res.json();
      const mapped: PlanningSnapshot[] = (body.snapshots ?? []).map(
        (s: Record<string, unknown>) => ({
          id:            s.id as string,
          planningId:    s.planning_id as string,
          stationsJson:  s.stations_json as Record<string, unknown>[],
          createdAt:     s.created_at as string,
          createdBy:     (s.created_by as string | null) ?? null,
          triggerAction: s.trigger_action as string,
        }),
      );
      setSnapshots(mapped);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [planningId]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const handleRestore = async (snapshotId: string) => {
    setRestoring(true);
    setErrorMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/snapshots/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ snapshotId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Wiederherstellung fehlgeschlagen');
      }
      setConfirmId(null);
      onRestored();
      onClose();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Verlauf</h2>
            <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[340px]">{planningTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-sm text-gray-600 py-10">Wird geladen…</p>
          ) : errorMsg ? (
            <p className="text-center text-sm text-red-500 py-10">{errorMsg}</p>
          ) : snapshots.length === 0 ? (
            <p className="text-center text-sm text-gray-600 py-10">Keine Snapshots vorhanden.</p>
          ) : (
            <div>
              <p className="px-5 pt-4 pb-2 text-xs font-medium text-gray-700 uppercase tracking-wider">
                Snapshots ({snapshots.length})
              </p>
              {snapshots.map(snap => (
                <div key={snap.id} className="flex items-center gap-3 px-5 py-3 border-b last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#6bbfd4]/15 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-[#6bbfd4]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{formatDate(snap.createdAt)}</p>
                    <p className="text-xs text-gray-600">
                      {triggerLabel(snap.triggerAction)} · {snap.stationsJson.length} Station{snap.stationsJson.length !== 1 ? 'en' : ''}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {confirmId === snap.id ? (
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-1 text-xs text-amber-600 mr-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Aktuellen Stand überschreiben?</span>
                        </div>
                        <button
                          onClick={() => handleRestore(snap.id)}
                          disabled={restoring}
                          className="text-xs px-2 py-1 bg-[#6bbfd4] text-white rounded-lg hover:bg-[#5aaec3] transition-colors disabled:opacity-40"
                        >
                          {restoring ? '…' : 'Ja, wiederherstellen'}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          disabled={restoring}
                          className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-50 transition-colors text-gray-700 disabled:opacity-40"
                        >
                          Abbrechen
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(snap.id)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Wiederherstellen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
