'use client';

import { useState } from 'react';
import { Share2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ShareButtonProps {
  planningId: string;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // HTTP / older browser fallback
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('execCommand copy fehlgeschlagen');
}

export default function ShareButton({ planningId }: ShareButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleShare = async () => {
    if (state === 'loading') return;
    setState('loading');
    setErrorMsg('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErrorMsg('Nicht angemeldet');
        setState('error');
        setTimeout(() => setState('idle'), 3000);
        return;
      }

      const res = await fetch('/api/share/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planning_id: planningId }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = body.error ?? 'Fehler beim Erstellen des Links';
        setErrorMsg(msg);
        setState('error');
        setTimeout(() => setState('idle'), 3000);
        return;
      }

      if (!body.url) {
        setErrorMsg('Kein Link erhalten');
        setState('error');
        setTimeout(() => setState('idle'), 3000);
        return;
      }

      await copyToClipboard(body.url);
      setState('copied');
      setTimeout(() => setState('idle'), 2500);
    } catch (e) {
      console.error('[ShareButton]', e);
      setErrorMsg('Kopieren fehlgeschlagen');
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  const label =
    state === 'copied' ? 'Kopiert!' :
    state === 'error'  ? (errorMsg || 'Fehler') :
    'Teilen';

  return (
    <button
      onClick={handleShare}
      disabled={state === 'loading'}
      className="flex items-center gap-2 px-3 py-2 bg-white text-[#6bbfd4] rounded-full shadow-lg border border-[#6bbfd4]/20 cursor-pointer hover:bg-[#6bbfd4]/10 transition-all active:scale-95 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      title="Link in Zwischenablage kopieren"
    >
      {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
      {state === 'copied'  && <Check className="w-4 h-4 text-green-500" />}
      {state === 'error'   && <AlertCircle className="w-4 h-4 text-red-500" />}
      {state === 'idle'    && <Share2 className="w-4 h-4" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
