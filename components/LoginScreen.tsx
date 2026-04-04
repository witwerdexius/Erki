'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
    setPassword('');
    setPasswordConfirm('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (password !== passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else if (data.session) {
      // E-Mail-Bestätigung deaktiviert → direkt eingeloggt
    } else {
      setInfo('Bestätigungs-E-Mail gesendet. Bitte prüfe dein Postfach.');
    }
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
            <p className="text-sm text-gray-500">
              {mode === 'login' ? 'Anmelden, um fortzufahren' : 'Neues Konto erstellen'}
            </p>
          </div>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@beispiel.de"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
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
              {loading ? 'Wird angemeldet…' : 'Anmelden'}
            </button>

            <p className="text-center text-sm text-gray-500 pt-1">
              Noch kein Konto?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-[#6bbfd4] font-medium hover:underline"
              >
                Konto erstellen
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@beispiel.de"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Mindestens 6 Zeichen"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort wiederholen</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 focus:border-[#6bbfd4] transition-all"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>
            )}
            {info && (
              <p className="text-sm text-green-700 bg-green-50 px-4 py-2.5 rounded-xl">{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#6bbfd4] text-white rounded-xl font-semibold hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Wird registriert…' : 'Konto erstellen'}
            </button>

            <p className="text-center text-sm text-gray-500 pt-1">
              Bereits ein Konto?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-[#6bbfd4] font-medium hover:underline"
              >
                Anmelden
              </button>
            </p>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">
          © 2026 Erlebnis Kirche Planner · v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </div>
    </div>
  );
}
