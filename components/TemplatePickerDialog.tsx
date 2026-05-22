'use client';

import { useState } from 'react';
import { X, Search, Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { StationTemplate } from '@/lib/types';

interface Props {
  templates: StationTemplate[];
  onSelect: (template: StationTemplate) => void;
  onClose: () => void;
  onCreateTemplate: () => Promise<StationTemplate | null>;
  onSaveTemplate: (id: string, data: Partial<StationTemplate>) => Promise<void>;
  onDeleteTemplate: (id: string, name: string) => Promise<void>;
}

export default function TemplatePickerDialog({ templates, onSelect, onClose, onCreateTemplate, onSaveTemplate, onDeleteTemplate }: Props) {
  const [search, setSearch] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateData, setEditingTemplateData] = useState<Partial<StationTemplate>>({});

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    const t = await onCreateTemplate();
    if (t) {
      setEditingTemplateId(t.id);
      setEditingTemplateData(t);
    }
  };

  const handleSave = async () => {
    if (!editingTemplateId) return;
    await onSaveTemplate(editingTemplateId, editingTemplateData);
    setEditingTemplateId(null);
    setEditingTemplateData({});
  };

  const cancelEdit = () => {
    setEditingTemplateId(null);
    setEditingTemplateData({});
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {editingTemplateId ? (
          <>
            {/* Edit mode header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-700 transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-semibold text-gray-900 flex-1">Vorlage bearbeiten</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Edit form */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <input
                autoFocus
                value={editingTemplateData.name ?? ''}
                onChange={(e) => setEditingTemplateData(d => ({ ...d, name: e.target.value }))}
                className="w-full font-semibold border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                placeholder="Name…"
              />
              <textarea
                value={editingTemplateData.description ?? ''}
                onChange={(e) => setEditingTemplateData(d => ({ ...d, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                placeholder="Beschreibung…"
                rows={2}
              />
              <textarea
                value={editingTemplateData.material ?? ''}
                onChange={(e) => setEditingTemplateData(d => ({ ...d, material: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                placeholder="Material…"
                rows={2}
              />
              <textarea
                value={(editingTemplateData.impulses ?? []).join('\n')}
                onChange={(e) => setEditingTemplateData(d => ({ ...d, impulses: e.target.value.split('\n').filter(l => l.trim()) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                placeholder="Gesprächsimpulse (je Zeile ein Impuls)…"
                rows={3}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={editingTemplateData.setupBy ?? ''}
                  onChange={(e) => setEditingTemplateData(d => ({ ...d, setupBy: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                  placeholder="Aufbau…"
                />
                <input
                  value={editingTemplateData.conductedBy ?? ''}
                  onChange={(e) => setEditingTemplateData(d => ({ ...d, conductedBy: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                  placeholder="Durchführung…"
                />
              </div>
            </div>

            {/* Edit mode footer */}
            <div className="border-t px-5 py-3 flex gap-2 justify-end">
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-sm text-gray-500 border rounded-lg hover:bg-gray-50"
              >Abbrechen</button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-[#6bbfd4] text-white rounded-lg hover:bg-[#5aaec3]"
              >Speichern</button>
            </div>
          </>
        ) : (
          <>
            {/* List mode header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Vorlage auswählen</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6bbfd4] text-white rounded-lg text-xs font-medium hover:bg-[#5aaec3] active:scale-[0.97] transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Neue Vorlage
                </button>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                  <div key={t.id} className="flex items-start px-5 py-3 hover:bg-[#6bbfd4]/10 transition-colors border-b last:border-0">
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => { onSelect(t); onClose(); }}
                    >
                      <p className="font-medium text-gray-900 text-sm">{t.name || '(Kein Name)'}</p>
                      {t.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                      )}
                      {t.material && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">Material: {t.material}</p>
                      )}
                    </button>
                    <div className="flex items-center gap-1 shrink-0 ml-2 mt-0.5">
                      <button
                        onClick={() => { setEditingTemplateId(t.id); setEditingTemplateData(t); }}
                        className="p-1.5 text-gray-500 hover:text-[#6bbfd4] transition-colors"
                        title="Bearbeiten"
                      ><Pencil className="w-4 h-4" /></button>
                      <button
                        onClick={() => onDeleteTemplate(t.id, t.name)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                        title="Löschen"
                      ><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
