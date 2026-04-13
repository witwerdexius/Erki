'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { StationTemplate } from '@/lib/types';

interface Props {
  templates: StationTemplate[];
  onSelect: (template: StationTemplate) => void;
  onClose: () => void;
}

export default function TemplatePickerDialog({ templates, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Vorlage auswählen</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b">
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-gray-500 shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Vorlagen durchsuchen…"
              className="bg-transparent border-none outline-none text-sm flex-1"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-10">
              {templates.length === 0 ? 'Noch keine Vorlagen vorhanden.' : 'Keine Treffer.'}
            </p>
          ) : (
            filtered.map(t => (
              <button
                key={t.id}
                onClick={() => { onSelect(t); onClose(); }}
                className="w-full text-left px-5 py-3 hover:bg-[#6bbfd4]/10 transition-colors border-b last:border-0"
              >
                <p className="font-medium text-gray-900 text-sm">{t.name || '(Kein Name)'}</p>
                {t.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                )}
                {t.material && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">Material: {t.material}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
