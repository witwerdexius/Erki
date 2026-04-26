'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ShareButtonProps {
  planningId: string;
}

export default function ShareButton({ planningId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/share/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planningId }),
      });

      if (!res.ok) throw new Error('Fehler beim Erstellen des Links');

      const { token } = await res.json();
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('[ShareButton] Fehler:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border hover:bg-gray-200 transition-all disabled:opacity-50 shrink-0"
      title="Planung teilen"
    >
      <Share2 className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{copied ? '✓ Link kopiert!' : loading ? '…' : 'Teilen'}</span>
    </button>
  );
}
