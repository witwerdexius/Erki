'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setOauthLoading(null);
    }
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
            <p className="text-sm text-gray-500">Anmelden, um fortzufahren</p>
          </div>
        </div>

        {/* OAuth Buttons */}
        <div className="space-y-2 mb-6">
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={oauthLoading !== null || loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {oauthLoading === 'google' ? (
              <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Mit Google anmelden
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('apple')}
            disabled={oauthLoading !== null || loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 bg-black rounded-xl text-sm font-medium text-white hover:bg-gray-900 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {oauthLoading === 'apple' ? (
              <span className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            )}
            Mit Apple anmelden
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#fdfdfd] px-3 text-gray-400">oder per E-Mail</span>
          </div>
        </div>

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
            disabled={loading || oauthLoading !== null}
            className="w-full py-2.5 bg-[#6bbfd4] text-white rounded-xl font-semibold hover:bg-[#5aaeC3] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Wird angemeldet…' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-8">
          © 2026 Erlebnis Kirche Planner · v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </div>
    </div>
  );
}
