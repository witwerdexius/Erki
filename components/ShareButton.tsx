'use client';

import { useState } from 'react';
import { Share2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ShareButtonProps {
  planningId: string;
}

export default function ShareButton({ planningId }: ShareButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleShare = async () => {
    if (state === 'loading') return;
    setState('loading');
    setErrorMsg('');

    const fallbackUrl = `${window.location.origin}/share/${planningId}`;

    // Fetches the best available share URL — used as async Promise content for ClipboardItem
    const getShareUrl = async (): Promise<string> => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.warn('[ShareButton] Keine Session — nutze Fallback-URL');
          return fallbackUrl;
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
        if (res.ok && body.url) return body.url;
        console.error('[ShareButton] API Fehler:', res.status, body.error ?? body);
        return fallbackUrl;
      } catch (e) {
        console.error('[ShareButton] API Request fehlgeschlagen, nutze Fallback:', e);
        return fallbackUrl;
      }
    };

    try {
      // iOS Safari requires clipboard call to happen synchronously within the gesture handler.
      // ClipboardItem accepts a Promise as content: write() is called sync, content resolves async.
      // Supported: iOS 13.4+, Chrome 76+, Safari 13.1+
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': getShareUrl().then(url => new Blob([url], { type: 'text/plain' })),
          }),
        ]);
      } else if (navigator.clipboard?.writeText) {
        // No ClipboardItem: writeText must be called before any await — use fallback URL
        // (calling it here is synchronous within the gesture context, no prior awaits)
        await navigator.clipboard.writeText(fallbackUrl);
      } else {
        // Legacy execCommand fallback (synchronous, always within gesture context)
        const el = document.createElement('textarea');
        el.value = fallbackUrl;
        el.setAttribute('readonly', '');
        el.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        if (!ok) throw new Error('execCommand fehlgeschlagen');
      }

      setState('copied');
      setTimeout(() => setState('idle'), 2500);
    } catch (e) {
      console.error('[ShareButton] Kopieren fehlgeschlagen:', e);
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
