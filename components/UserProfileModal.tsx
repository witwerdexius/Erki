'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { updateProfileName } from '@/lib/db';
import type { Profile } from '@/lib/types';

interface Props {
  user: User;
  profile: Profile | null;
  onClose: () => void;
  onSaved: (updatedName: string) => void;
}

export default function UserProfileModal({ user, profile, onClose, onSaved }: Props) {
  const [name, setName] = useState(profile?.name || profile?.displayName || '');
  const [email, setEmail] = useState(user.email || '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const nameChanged = name.trim() !== (profile?.name || profile?.displayName || '');
      const emailChanged = email.trim() !== (user.email || '');

      if (!name.trim()) {
        setToast({ type: 'error', message: 'Anzeigename darf nicht leer sein.' });
        return;
      }

      if (nameChanged) {
        await updateProfileName(user.id, name.trim());
      }

      if (emailChanged) {
        const { error } = await supabase.auth.updateUser({ email: email.trim() });
        if (error) throw error;
        setToast({ type: 'success', message: 'Name gespeichert. Bitte bestätige die neue E-Mail-Adresse über den Link, den wir dir geschickt haben.' });
        onSaved(name.trim());
        return;
      }

      setToast({ type: 'success', message: 'Gespeichert.' });
      onSaved(name.trim());
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : 'Fehler beim Speichern.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Profil bearbeiten</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors -mr-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Anzeigename</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 outline-none focus:ring-2 ring-[#6bbfd4]/40 transition-all"
              placeholder="Dein Name"
              maxLength={80}
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">E-Mail-Adresse</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 outline-none focus:ring-2 ring-[#6bbfd4]/40 transition-all"
              placeholder="deine@email.de"
            />
            {email.trim() !== (user.email || '') && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Du erhältst eine Bestätigungs-E-Mail an die neue Adresse.</p>
            )}
          </label>
        </div>

        {toast && (
          <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300'
          }`}>
            {toast.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            }
            {toast.message}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-[#6bbfd4] text-white hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-60 font-medium"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
