'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setSuccess(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#fdfdfd] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-[#6bbfd4] flex items-center justify-center text-white font-bold text-lg shrink-0">
            EK
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Erlebnis Kirche Planner</h1>
            <p className="text-sm text-gray-700">Neues Passwort festlegen</p>
          </div>
        </div>

        {success ? (
          <p className="text-sm text-green-700 bg-green-50 px-4 py-3 rounded-xl">
            Passwort erfolgreich geändert. Du kannst dich jetzt anmelden.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Mindestens 6 Zeichen"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#6bbfd4] text-white rounded-xl font-semibold hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Wird gespeichert…' : 'Passwort speichern'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
