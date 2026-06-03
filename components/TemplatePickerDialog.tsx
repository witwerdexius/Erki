'use client';

import { useState } from 'react';
import { X, Search, Plus, Pencil, Trash2, ArrowLeft, Check } from 'lucide-react';
import { StationTemplate } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  templates: StationTemplate[];
  onSelect: (templates: StationTemplate[]) => void;
  onClose: () => void;
  onCreateTemplate: () => Promise<StationTemplate | null>;
  onSaveTemplate: (id: string, data: Partial<StationTemplate>) => Promise<void>;
  onDeleteTemplate: (id: string, name: string) => Promise<void>;
}

export default function TemplatePickerDialog({ templates, onSelect, onClose, onCreateTemplate, onSaveTemplate, onDeleteTemplate }: Props) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateData, setEditingTemplateData] = useState<Partial<StationTemplate>>({});

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    const selected = templates.filter(t => selectedIds.has(t.id));
    if (selected.length === 0) return;
    onSelect(selected);
    onClose();
  };

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

  const addLabel = selectedIds.size === 0
    ? 'Hinzufügen'
    : selectedIds.size === 1
      ? '1 Vorlage hinzufügen'
      : `${selectedIds.size} Vorlagen hinzufügen`;

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
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <button onClick={cancelEdit} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-semibold text-gray-900 dark:text-gray-50 flex-1">Vorlage bearbeiten</h2>
              <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Edit form */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <input
                autoFocus
                value={editingTemplateData.name ?? ''}
                onChange={(e) => setEditingTemplateData(d => ({ ...d, name: e.target.value }))}
                className="w-full font-semibold border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                placeholder="Name…"
              />
              <textarea
                value={editingTemplateData.description ?? ''}
                onChange={(e) => setEditingTemplateData(d => ({ ...d, description: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                placeholder="Beschreibung…"
                rows={2}
              />
              <textarea
                value={editingTemplateData.material ?? ''}
                onChange={(e) => setEditingTemplateData(d => ({ ...d, material: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                placeholder="Material…"
                rows={2}
              />
              <textarea
                value={(editingTemplateData.impulses ?? []).join('\n')}
                onChange={(e) => setEditingTemplateData(d => ({ ...d, impulses: e.target.value.split('\n').filter(l => l.trim()) }))}
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30 resize-none"
                placeholder="Gesprächsimpulse (je Zeile ein Impuls)…"
                rows={3}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={editingTemplateData.setupBy ?? ''}
                  onChange={(e) => setEditingTemplateData(d => ({ ...d, setupBy: e.target.value }))}
                  className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                  placeholder="Aufbau…"
                />
                <input
                  value={editingTemplateData.conductedBy ?? ''}
                  onChange={(e) => setEditingTemplateData(d => ({ ...d, conductedBy: e.target.value }))}
                  className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6bbfd4]/30"
                  placeholder="Durchführung…"
                />
              </div>
            </div>

            {/* Edit mode footer */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex gap-2 justify-end">
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >Abbrechen</button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-[#6bbfd4] text-white rounded-lg hover:bg-[#5aaec3] transition-colors"
              >Speichern</button>
            </div>
          </>
        ) : (
          <>
            {/* List mode header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-gray-50">Vorlage auswählen</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6bbfd4] text-white rounded-lg text-xs font-medium hover:bg-[#5aaec3] active:scale-[0.97] transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Neue Vorlage
                </button>
                <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Vorlagen durchsuchen…"
                  className="bg-transparent border-none outline-none text-sm flex-1 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-10">
                  {templates.length === 0 ? 'Noch keine Vorlagen vorhanden.' : 'Keine Treffer.'}
                </p>
              ) : (
                filtered.map(t => {
                  const isSelected = selectedIds.has(t.id);
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        'flex items-start px-4 py-3 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0',
                        isSelected
                          ? 'bg-[#6bbfd4]/15 dark:bg-[#6bbfd4]/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                      )}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelect(t.id)}
                        className={cn(
                          'shrink-0 mt-0.5 mr-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-[#6bbfd4] border-[#6bbfd4]'
                            : 'border-gray-300 dark:border-gray-500 hover:border-[#6bbfd4]',
                        )}
                        aria-checked={isSelected}
                        role="checkbox"
                        aria-label={t.name}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </button>

                      {/* Text */}
                      <button
                        className="flex-1 text-left min-w-0"
                        onClick={() => toggleSelect(t.id)}
                      >
                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t.name || '(Kein Name)'}</p>
                        {t.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.description}</p>
                        )}
                        {t.material && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">Material: {t.material}</p>
                        )}
                      </button>

                      {/* Edit / Delete */}
                      <div className="flex items-center gap-1 shrink-0 ml-2 mt-0.5">
                        <button
                          onClick={() => { setEditingTemplateId(t.id); setEditingTemplateData(t); }}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-[#6bbfd4] transition-colors"
                          title="Bearbeiten"
                        ><Pencil className="w-4 h-4" /></button>
                        <button
                          onClick={() => onDeleteTemplate(t.id, t.name)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors"
                          title="Löschen"
                        ><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: add button */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex justify-end">
              <button
                onClick={handleAdd}
                disabled={selectedIds.size === 0}
                className="px-4 py-2 text-sm font-medium bg-[#6bbfd4] text-white rounded-xl hover:bg-[#5aaec3] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
