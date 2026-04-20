'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Download, Plus, Trash2, Loader2 } from 'lucide-react';

import { LOGO1_DATA, LOGO2_DATA, QR_DATA } from '@/lib/logoData';
import { Plan, ExplanationData, TimeBlock } from '@/lib/types';
import { jsPDF } from 'jspdf';
import { cn } from '@/lib/utils';

interface Props {
  activePlan: Plan | undefined;
  updateActivePlan: (updates: Partial<Plan>) => void;
}

const DEFAULT_TIME_BLOCKS: [TimeBlock, TimeBlock, TimeBlock] = [
  { label: 'Ab 15:30 Uhr', description: 'Mitmach-Stationen zum Thema „Sternstunden" im Gemeindehaus und in den Räumen des Kindergartens nebenan' },
  { label: 'danach\n(ca. 16:45 Uhr)', description: 'gemeinsame Feierzeit mit Liedern & Gebet im großen Saal des Gemeindehauses' },
  { label: 'zum Schluss', description: 'gemeinsames Essen im großen Saal des Gemeindehauses' },
];

const DEFAULT_NEXT_DATES = ['08. März 2026', '14. Juni 2026', '18. Oktober 2026'];
const DEFAULT_FEEDBACK_TEXT = 'Feedback? Gerne!\nEinfach ansprechen oder\nQR-Code scannen!';

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
        onBlur={() => { onChange(local); setEditing(false); }}
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
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing, local]);

  if (editing) {
    return (
      <textarea
        ref={taRef}
        value={local}
        autoFocus
        onChange={(e) => {
          setLocal(e.target.value);
          const el = e.target;
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }}
        onBlur={() => { onChange(local); setEditing(false); }}
        className={cn('w-full bg-blue-50 border-2 border-[#6bbfd4] outline-none rounded p-1 resize-none', className)}
        style={{ ...style, overflow: 'hidden' }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Klicken zum Bearbeiten"
      className={cn('cursor-text hover:bg-[#6bbfd4]/10 rounded transition-colors whitespace-pre-wrap', className)}
      style={style}
    >
      {value || <em className="text-gray-300 not-italic">{placeholder}</em>}
    </div>
  );
}

async function imageToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// --- Main component ---

export default function ExplanationPage({ activePlan, updateActivePlan }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);
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
    timeBlocks: storedData?.timeBlocks ?? DEFAULT_TIME_BLOCKS,
    nextDates: storedData?.nextDates ?? DEFAULT_NEXT_DATES,
    churchLogo1Url: storedData?.churchLogo1Url,
    churchLogo2Url: storedData?.churchLogo2Url,
    qrCodeUrl: storedData?.qrCodeUrl,
    feedbackText: storedData?.feedbackText ?? DEFAULT_FEEDBACK_TEXT,
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

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update({ qrCodeUrl: reader.result as string });
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

      const images = el.querySelectorAll<HTMLImageElement>('img');
      const origSrcs: string[] = [];
      for (const img of Array.from(images)) {
        const src = img.getAttribute('src') || img.src;
        origSrcs.push(img.src);
        if (src.startsWith('/')) {
          img.src = await imageToBase64(src);
        }
      }

      const png = await toPng(el, {
        width: 559,
        height: 794,
        style: { transform: 'scale(1)', transformOrigin: 'top left' },
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      Array.from(images).forEach((img, i) => { img.src = origSrcs[i]; });
      hiddenEls.forEach((el) => (el.style.visibility = ''));

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
      pdf.addImage(png, 'PNG', 0, 0, 148, 210);
      pdf.save('erklaerungsseite.pdf');
    } catch (err) {
      console.error('PDF-Export fehlgeschlagen:', err);
      alert('PDF-Export fehlgeschlagen.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-100 p-4 sm:p-8">
      {/* Export button */}
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

      {/* Scale wrapper */}
      <div
        ref={wrapperRef}
        style={{ maxWidth: 559, width: '100%', margin: '0 auto', height: Math.round(794 * paperScale), overflow: 'hidden' }}
      >
        {/* A5 Portrait Paper — 559 × 794px */}
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
            overflow: 'hidden',
            transformOrigin: 'top left',
            transform: paperScale < 1 ? `scale(${paperScale})` : undefined,
          }}
        >
          {/* ── SECTION 1: HEADER ── */}
          <div style={{ display: 'flex', alignItems: 'center', height: 96, flexShrink: 0 }}>
            {/* Left: ErKi logo */}
            <div style={{ flex: '0 0 50%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="ErKi Logo" style={{ height: 80, width: 'auto' }} />
            </div>

            {/* Right: Two church logos, right-aligned */}
            <div style={{ flex: '0 0 50%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
              {/* Logo 1 */}
              <div style={{ position: 'relative', height: 64, display: 'flex', alignItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.churchLogo1Url ?? LOGO1_DATA} alt="Logo 1" style={{ height: 64, maxWidth: 100, objectFit: 'contain' }} />
                <input
                  data-export-hidden
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="logo1-override"
                  onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => update({ churchLogo1Url: r.result as string }); r.readAsDataURL(f); }}
                />
                <label data-export-hidden htmlFor="logo1-override" style={{ position: 'absolute', bottom: -2, right: -2, background: '#6b7280', color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: 9, cursor: 'pointer' }}>▲</label>
              </div>
              {/* Logo 2 */}
              <div style={{ position: 'relative', height: 64, display: 'flex', alignItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.churchLogo2Url ?? LOGO2_DATA} alt="Logo 2" style={{ height: 64, maxWidth: 100, objectFit: 'contain' }} />
                <input
                  data-export-hidden
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="logo2-override"
                  onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => update({ churchLogo2Url: r.result as string }); r.readAsDataURL(f); }}
                />
                <label data-export-hidden htmlFor="logo2-override" style={{ position: 'absolute', bottom: -2, right: -2, background: '#6b7280', color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: 9, cursor: 'pointer' }}>▲</label>
              </div>
            </div>
          </div>

          {/* ── SECTION 2: TIME BLOCKS ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {([0, 1, 2] as const).map((i) => (
              <div
                key={i}
                style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center' }}
              >
                {/* Left: time label */}
                <div style={{ width: 170, flexShrink: 0, display: 'flex', alignItems: 'center', paddingRight: 16 }}>
                  <EditableTextarea
                    value={data.timeBlocks[i].label}
                    onChange={(v) => updateTimeBlock(i, { label: v })}
                    placeholder="Zeit …"
                    style={{ fontSize: 20, fontWeight: 400, color: '#111827', lineHeight: 1.3, width: '100%' }}
                  />
                </div>

                {/* Right: description, centered */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <EditableTextarea
                    value={data.timeBlocks[i].description}
                    onChange={(v) => updateTimeBlock(i, { description: v })}
                    placeholder="Beschreibung …"
                    style={{ fontSize: 22, fontWeight: 400, color: '#111827', textAlign: 'center', lineHeight: 1.4, width: '100%' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── SECTION 3: BOTTOM ── */}
          <div style={{ height: 220, flexShrink: 0, display: 'flex', flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            {/* Left: Sticky note + delete buttons wrapper */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 4, flexShrink: 0, alignSelf: 'center' }}>
              {/* Yellow sticky note — no delete buttons inside */}
              <div
                style={{
                  width: 'fit-content',
                  background: '#fde047',
                  padding: '14px 16px',
                  boxShadow: '3px 4px 12px rgba(0,0,0,0.15)',
                  transform: 'rotate(-3deg)',
                  borderRadius: 4,
                  fontFamily: "'Patrick Hand', cursive",
                }}
              >
                <p style={{ fontWeight: 700, fontSize: 14, color: '#1c1917', textDecoration: 'underline', margin: '0 0 8px 0' }}>
                  Nächste Termine:
                </p>
                {data.nextDates.map((date, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <span style={{ color: '#1c1917', fontSize: 14, flexShrink: 0 }}>•</span>
                    <EditableText
                      value={date}
                      onChange={(v) => {
                        const arr = [...data.nextDates];
                        arr[idx] = v;
                        update({ nextDates: arr });
                      }}
                      placeholder="Datum …"
                      style={{ fontSize: 14, color: '#1c1917', fontFamily: "'Patrick Hand', cursive" }}
                    />
                  </div>
                ))}
                <button
                  data-export-hidden
                  onClick={() => update({ nextDates: [...data.nextDates, ''] })}
                  style={{
                    marginTop: 6, display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 12, color: '#78350f', cursor: 'pointer',
                    background: 'none', border: 'none', padding: 0,
                    fontFamily: "'Patrick Hand', cursive",
                  }}
                >
                  <Plus size={11} /> Termin hinzufügen
                </button>
              </div>

              {/* Delete buttons column — right next to note, hidden on export */}
              <div
                data-export-hidden
                style={{ display: 'flex', flexDirection: 'column', paddingTop: 36 }}
              >
                {data.nextDates.map((_, idx) => (
                  <div key={idx} style={{ marginBottom: 4, display: 'flex', alignItems: 'center' }}>
                    <button
                      onClick={() => update({ nextDates: data.nextDates.filter((_, j) => j !== idx) })}
                      style={{ color: '#78350f', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      title="Termin entfernen"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Feedback text + QR code */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <EditableTextarea
                value={data.feedbackText ?? DEFAULT_FEEDBACK_TEXT}
                onChange={(v) => update({ feedbackText: v })}
                style={{ fontSize: 14, color: '#111827', textAlign: 'center', lineHeight: 1.5, width: '100%' }}
              />
              <div style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qrCodeUrl ?? QR_DATA} alt="QR Code" style={{ height: 80, width: 'auto', objectFit: 'contain' }} />
                <input
                  data-export-hidden
                  ref={qrInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleQrUpload}
                />
                <label
                  data-export-hidden
                  onClick={() => qrInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: -2, right: -2, background: '#6b7280', color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: 9, cursor: 'pointer' }}
                >▲</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
