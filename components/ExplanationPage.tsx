'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Download, Plus, Trash2, Loader2, Upload } from 'lucide-react';
import { Plan, ExplanationData, TimeBlock } from '@/lib/types';
import { jsPDF } from 'jspdf';
import { cn } from '@/lib/utils';

interface Props {
  activePlan: Plan | undefined;
  updateActivePlan: (updates: Partial<Plan>) => void;
}

const DEFAULT_TIME_BLOCKS: [TimeBlock, TimeBlock, TimeBlock] = [
  { label: 'Beginn', time: '14:00 Uhr', description: '' },
  { label: 'Hauptteil', time: 'ca. 15:30 Uhr', description: '' },
  { label: 'Ende', time: 'gegen 16:30 Uhr', description: '' },
];

// --- Inline-editable helpers ---

function EditableText({
  value,
  onChange,
  className,
  style,
  placeholder = 'Klicken zum Bearbeiten …',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  if (editing) {
    return (
      <input
        value={local}
        autoFocus
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          onChange(local);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onChange(local); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className={cn('bg-blue-50 border-b-2 border-[#6bbfd4] outline-none rounded-sm w-full', className)}
        style={style}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Klicken zum Bearbeiten"
      className={cn('cursor-text hover:bg-[#6bbfd4]/10 rounded transition-colors inline-block min-w-[4rem]', className)}
      style={style}
    >
      {value || <em className="text-gray-300 not-italic">{placeholder}</em>}
    </span>
  );
}

function EditableTextarea({
  value,
  onChange,
  className,
  style,
  placeholder = 'Klicken zum Bearbeiten …',
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  if (editing) {
    return (
      <textarea
        value={local}
        autoFocus
        rows={rows}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          onChange(local);
          setEditing(false);
        }}
        className={cn('w-full bg-blue-50 border-2 border-[#6bbfd4] outline-none rounded p-1 resize-none', className)}
        style={style}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Klicken zum Bearbeiten"
      className={cn('cursor-text hover:bg-[#6bbfd4]/10 rounded transition-colors min-h-[2rem] whitespace-pre-wrap', className)}
      style={style}
    >
      {value || <em className="text-gray-300 not-italic">{placeholder}</em>}
    </div>
  );
}

// --- Main component ---

export default function ExplanationPage({ activePlan, updateActivePlan }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const churchLogoInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [paperScale, setPaperScale] = useState(1);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setPaperScale(Math.min(1, el.offsetWidth / 559));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!activePlan) return null;

  const storedData = activePlan.explanationData;
  const data: ExplanationData = {
    title: storedData?.title ?? activePlan.title,
    churchLogoUrl: storedData?.churchLogoUrl,
    timeBlocks: storedData?.timeBlocks ?? DEFAULT_TIME_BLOCKS,
    nextDates: storedData?.nextDates ?? ['', ''],
  };

  const update = (updates: Partial<ExplanationData>) => {
    updateActivePlan({ explanationData: { ...data, ...updates } });
  };

  const updateTimeBlock = (index: 0 | 1 | 2, updates: Partial<TimeBlock>) => {
    const blocks: [TimeBlock, TimeBlock, TimeBlock] = [
      { ...data.timeBlocks[0] },
      { ...data.timeBlocks[1] },
      { ...data.timeBlocks[2] },
    ];
    blocks[index] = { ...blocks[index], ...updates };
    update({ timeBlocks: blocks });
  };

  const handleChurchLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update({ churchLogoUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const exportToPDF = async () => {
    if (!pageRef.current) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 150));
    try {
      const { toPng } = await import('html-to-image');

      const hiddenEls = pageRef.current.querySelectorAll<HTMLElement>('[data-export-hidden]');
      hiddenEls.forEach((el) => (el.style.visibility = 'hidden'));

      const el = pageRef.current;
      const png = await toPng(el, {
        width: el.offsetWidth,
        height: el.offsetHeight,
        style: { transform: 'scale(1)', transformOrigin: 'top left' },
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      hiddenEls.forEach((el) => (el.style.visibility = ''));

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
      pdf.addImage(png, 'PNG', 0, 0, 148, 210);
      const safeName =
        data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
      pdf.save(`${safeName}-erklaerungsseite.pdf`);
    } catch (err) {
      console.error('PDF-Export fehlgeschlagen:', err);
      alert('PDF-Export fehlgeschlagen.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-100 p-4 sm:p-8">
      {/* Export button — outside the paper */}
      <div style={{ maxWidth: 559 }} className="mx-auto mb-4 flex justify-end">
        <button
          onClick={exportToPDF}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-[#6bbfd4] text-white rounded-full shadow text-sm font-medium hover:bg-[#5aaec3] transition-all active:scale-95 disabled:opacity-50"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Als PDF exportieren
        </button>
      </div>

      {/* Scale wrapper: shrinks A5 paper on narrow viewports */}
      <div
        ref={wrapperRef}
        style={{ maxWidth: 559, width: '100%', margin: '0 auto', height: Math.round(794 * paperScale), overflow: 'hidden' }}
      >
      {/* A5 Portrait Paper — 559 × 794px ≈ 148:210 */}
      <div
        ref={pageRef}
        style={{
          width: 559,
          height: 794,
          backgroundColor: '#ffffff',
          padding: '28px 32px 24px',
          boxShadow: '0 4px 32px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          boxSizing: 'border-box',
          overflow: 'visible',
          transformOrigin: 'top left',
          transform: paperScale < 1 ? `scale(${paperScale})` : undefined,
        }}
      >
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          {/* ErKi Logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpeg" alt="ErKi Logo" style={{ height: 56, width: 'auto', flexShrink: 0 }} />

          {/* Title */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <EditableText
              value={data.title}
              onChange={(v) => update({ title: v })}
              placeholder="Planungsname"
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#1f2937',
                lineHeight: 1.2,
                display: 'inline-block',
                textAlign: 'center',
                width: '100%',
              }}
            />
          </div>

          {/* Church Logo / Upload */}
          <div
            style={{ height: 56, width: 72, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
          >
            {data.churchLogoUrl ? (
              <div style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.churchLogoUrl}
                  alt="Kirchenlogo"
                  style={{ height: 56, maxWidth: 72, objectFit: 'contain' }}
                />
                <button
                  data-export-hidden
                  onClick={() => update({ churchLogoUrl: undefined })}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: 18,
                    height: 18,
                    cursor: 'pointer',
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Logo entfernen"
                >
                  ×
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={churchLogoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleChurchLogoUpload}
                  style={{ display: 'none' }}
                />
                <button
                  data-export-hidden
                  onClick={() => churchLogoInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    width: 80,
                    height: 64,
                    border: '2px dashed #d1d5db',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: 'none',
                    color: '#9ca3af',
                    fontSize: 10,
                  }}
                >
                  <Upload size={16} />
                  <span>Kirchenlogo</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{ height: 3, background: '#6bbfd4', borderRadius: 2, marginBottom: 28 }} />

        {/* ── TIME BLOCKS + STICKY NOTE ── */}
        <div style={{ display: 'flex', gap: 20, flex: 1, alignItems: 'flex-start' }}>
          {/* Three time blocks */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {([0, 1, 2] as const).map((i) => (
              <div key={i} style={{ paddingTop: i > 0 ? 24 : 0, paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Label */}
                  <EditableText
                    value={data.timeBlocks[i].label}
                    onChange={(v) => updateTimeBlock(i, { label: v })}
                    placeholder="LABEL"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#6bbfd4',
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      display: 'block',
                    }}
                  />
                  {/* Time */}
                  <EditableText
                    value={data.timeBlocks[i].time}
                    onChange={(v) => updateTimeBlock(i, { time: v })}
                    placeholder="00:00 Uhr"
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      color: '#111827',
                      lineHeight: 1.1,
                      display: 'block',
                    }}
                  />
                  {/* Description */}
                  <EditableTextarea
                    value={data.timeBlocks[i].description}
                    onChange={(v) => updateTimeBlock(i, { description: v })}
                    placeholder="Beschreibung …"
                    style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.6 }}
                  />
              </div>
            ))}
          </div>

          {/* Yellow sticky note */}
          <div
            style={{
              background: '#fef08a',
              padding: '14px 16px',
              width: 160,
              flexShrink: 0,
              boxShadow: '3px 4px 12px rgba(0,0,0,0.15)',
              transform: 'rotate(-1.5deg)',
              borderRadius: 2,
              marginTop: 8,
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: '#92400e' }}>
              📅 Nächste Termine
            </p>
            {data.nextDates.map((date, idx) => (
              <div
                key={idx}
                style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}
              >
                <span style={{ color: '#92400e', fontSize: 11, flexShrink: 0 }}>•</span>
                <EditableText
                  value={date}
                  onChange={(v) => {
                    const arr = [...data.nextDates];
                    arr[idx] = v;
                    update({ nextDates: arr });
                  }}
                  placeholder="Datum …"
                  style={{ fontSize: 12, color: '#1c1917', flex: 1, minWidth: 0 }}
                />
                <button
                  data-export-hidden
                  onClick={() => update({ nextDates: data.nextDates.filter((_, j) => j !== idx) })}
                  style={{ color: '#b45309', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 2 }}
                  title="Termin entfernen"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {data.nextDates.length < 4 && (
              <button
                data-export-hidden
                onClick={() => update({ nextDates: [...data.nextDates, ''] })}
                style={{
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: '#92400e',
                  cursor: 'pointer',
                  opacity: 0.75,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
              >
                <Plus size={11} /> Termin hinzufügen
              </button>
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ marginTop: 16, paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, color: '#d1d5db', letterSpacing: '0.05em' }}>
            ErlebnisKirche · erki.app
          </span>
        </div>
      </div>
      </div>{/* /scale wrapper */}
    </div>
  );
}
