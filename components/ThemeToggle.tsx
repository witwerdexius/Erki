'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';

// Zyklus: system → light → dark → system
const NEXT_THEME: Record<string, string> = { system: 'light', light: 'dark', dark: 'system' };

const THEME_LABELS: Record<string, string> = {
    system: 'Automatisch (System)',
    light: 'Hell-Modus',
    dark: 'Dunkel-Modus',
};

export function ThemeToggle({ className }: { className?: string }) {
    // resolvedTheme = tatsächliches 'light'|'dark' (auch wenn theme='system')
    const { theme, resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Verhindert Hydration-Mismatch: erst nach Mount rendern
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return <div className="h-8 w-8" />;

    const current = theme ?? 'system';
    const nextTheme = NEXT_THEME[current] ?? 'system';
    const nextLabel = THEME_LABELS[nextTheme] ?? 'Farbschema umschalten';

    return (
        <button
            onClick={() => setTheme(nextTheme)}
            className={`h-8 w-8 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className ?? ''}`}
            title={nextLabel}
            aria-label={nextLabel}
        >
            {current === 'system'
                ? <Monitor className="w-4 h-4" />
                : resolvedTheme === 'dark'
                    ? <Moon className="w-4 h-4" />
                    : <Sun className="w-4 h-4" />
            }
        </button>
    );
}
