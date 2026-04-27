'use client';

import { useState } from 'react';

const TEAMS = ['Feucht'];

interface Props {
  initialName?: string;
  onComplete: (name: string, team: string) => Promise<void>;
}

export default function OnboardingModal({ initialName = '', onComplete }: Props) {
  const [name, setName] = useState(initialName);
  const [team, setTeam] = useState(TEAMS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Bitte gib deinen Namen ein.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onComplete(name.trim(), team);
    } catch {
      setError('Fehler beim Speichern. Bitte versuche es erneut.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5">
          <h2 className="font-semibold text-gray-900 text-lg">Konto vervollständigen</h2>
          <p className="text-sm text-gray-600 mt-1">
            Bitte gib deinen Namen und dein Team an, um fortzufahren.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Vor- und Nachname"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Erlebnis-Kirche-Team
            </label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
            >
              {TEAMS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-[#6bbfd4] text-white rounded-xl font-semibold hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? 'Wird gespeichert…' : 'Weiter'}
          </button>
        </form>
      </div>
    </div>
  );
}
