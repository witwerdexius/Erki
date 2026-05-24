'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

type UndoToastProps = {
  /** Unique key — wenn sich der key ändert, startet der Timer neu. */
  toastKey: string;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number; // ms, default 15000
};

export function UndoToast({ toastKey, message, onUndo, onDismiss, duration = 15000 }: UndoToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    setProgress(100);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastKey, duration]);

  return (
    <div className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto z-50 animate-in slide-in-from-bottom-4 duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3">
          <p className="flex-1 text-sm text-foreground">{message}</p>
          <button
            onClick={onUndo}
            className="shrink-0 h-9 px-3 rounded-full border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Rückgängig
          </button>
          <button
            onClick={onDismiss}
            className="shrink-0 h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            aria-label="Schließen"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-[#6bbfd4]"
            style={{ width: `${progress}%`, transition: 'width 50ms linear' }}
          />
        </div>
      </div>
    </div>
  );
}
