'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Verhindert Hydration-Mismatch: erst nach Mount rendern
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return <div className="h-8 w-8" />;

    return (
        <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`h-8 w-8 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className ?? ''}`}
            title={theme === 'dark' ? 'Hell-Modus' : 'Dunkel-Modus'}
            aria-label="Farbschema umschalten"
        >
            {theme === 'dark'
                ? <Sun className="w-4 h-4" />
                : <Moon className="w-4 h-4" />
            }
        </button>
    );
}
