'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'register' | 'forgot';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) setError(error.message);
    else setInfo('Reset-Link wurde an deine E-Mail-Adresse gesendet.');
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#fdfdfd] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-[#6bbfd4] flex items-center justify-center text-white font-bold text-lg shrink-0">
            EK
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Erlebnis Kirche Planner</h1>
            <p className="text-sm text-gray-700">
              {mode === 'login' ? 'Anmelden, um fortzufahren' : mode === 'register' ? 'Neues Konto erstellen' : 'Passwort zurücksetzen'}
            </p>
          </div>
        </div>

        {mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">
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
              {loading ? 'Wird gesendet…' : 'Reset-Link senden'}
            </button>

            <p className="text-center text-sm text-gray-700 pt-1">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-[#6bbfd4] font-medium hover:underline"
              >
                Zurück zur Anmeldung
              </button>
            </p>
          </form>
        ) : mode === 'login' ? (
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
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="mt-1.5 text-xs text-gray-500 hover:text-[#6bbfd4] hover:underline transition-colors"
              >
                Passwort vergessen?
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full py-2.5 bg-[#6bbfd4] text-white rounded-xl font-semibold hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Wird angemeldet…' : 'Anmelden'}
            </button>

            <p className="text-center text-sm text-gray-700 pt-1">
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
              disabled={loading || googleLoading}
              className="w-full py-2.5 bg-[#6bbfd4] text-white rounded-xl font-semibold hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Wird registriert…' : 'Konto erstellen'}
            </button>

            <p className="text-center text-sm text-gray-700 pt-1">
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

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-sm text-gray-500">oder</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading || googleLoading}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-xl font-medium text-gray-700 bg-white hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
              fill="#EA4335"
            />
          </svg>
          {googleLoading ? 'Weiterleitung…' : 'Mit Google anmelden'}
        </button>

        <p className="text-center text-xs text-gray-500 mt-8">
          © 2026 Erlebnis Kirche Planner · v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </div>
    </div>
  );
}
