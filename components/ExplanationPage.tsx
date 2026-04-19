'use client';

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Download, Loader2, Upload, Trash2, Plus } from 'lucide-react';
import { Plan, ExplanationData, TimeBlock } from '@/lib/types';
import { jsPDF } from 'jspdf';

interface Props {
  activePlan: Plan | undefined;
  updateActivePlan: (updates: Partial<Plan>) => void;
}

const DEFAULT_TIME_BLOCKS: [TimeBlock, TimeBlock, TimeBlock] = [
  {
    label: '',
    time: 'Ab 15:30 Uhr',
    description:
      'Mitmach-Stationen zum Thema \u201eSternstunden\u201c im Gemeindehaus und in den R\u00e4umen des Kindergartens nebenan',
  },
  {
    label: '',
    time: 'danach\n(ca. 16:45 Uhr)',
    description: 'gemeinsame Feierzeit mit Liedern & Gebet im gro\u00dfen Saal des Gemeindehauses',
  },
  {
    label: '',
    time: 'zum Schluss',
    description: 'gemeinsames Essen im gro\u00dfen Saal des Gemeindehauses',
  },
];

const DEFAULT_NEXT_DATES = ['08. M\u00e4rz 2026', '14. Juni 2026', '18. Oktober 2026'];

// SSR-safe layout effect
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Contenteditable div — stable across re-renders, no flash
function CE({
  value,
  onChange,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);

  useIsoLayoutEffect(() => {
    if (elRef.current && !isFocused.current) {
      elRef.current.innerText = value;
    }
  }, [value]);

  return (
    <div
      ref={elRef}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => {
        isFocused.current = true;
      }}
      onBlur={(e) => {
        isFocused.current = false;
        onChange(e.currentTarget.innerText);
      }}
      style={{
        outline: 'none',
        cursor: 'text',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: '1.2em',
        width: '100%',
        ...style,
      }}
    />
  );
}

// Bare single-line input inheriting parent font
function BareInput({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        border: 'none',
        outline: 'none',
        background: 'transparent',
        width: '100%',
        padding: 0,
        margin: 0,
        fontFamily: 'inherit',
        fontSize: 'inherit',
        color: 'inherit',
        ...style,
      }}
    />
  );
}

// Dashed upload placeholder button
function UploadBtn({ onClick, label, size = 80 }: { onClick: () => void; label: string; size?: number }) {
  return (
    <button
      data-export-hidden
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        width: size,
        height: size,
        border: '2px dashed #d1d5db',
        borderRadius: 8,
        cursor: 'pointer',
        background: 'none',
        color: '#9ca3af',
        fontSize: 10,
        flexShrink: 0,
        textAlign: 'center',
        lineHeight: 1.2,
      }}
    >
      <Upload size={14} />
      <span>{label}</span>
    </button>
  );
}

// Logo slot: shows image + remove button, or upload placeholder
function LogoSlot({
  url,
  onUpload,
  onRemove,
  label,
  height = 72,
  maxWidth = 130,
}: {
  url?: string;
  onUpload: () => void;
  onRemove: () => void;
  label: string;
  height?: number;
  maxWidth?: number;
}) {
  if (url) {
    return (
      <div style={{ position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} style={{ height, maxWidth, objectFit: 'contain' }} />
        <button
          data-export-hidden
          onClick={onRemove}
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
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>
    );
  }
  return <UploadBtn onClick={onUpload} label={label} size={height} />;
}

export default function ExplanationPage({ activePlan, updateActivePlan }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const logo1Ref = useRef<HTMLInputElement>(null);
  const logo2Ref = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Load Patrick Hand from Google Fonts for the sticky note
  useEffect(() => {
    const id = 'patrick-hand-font';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  if (!activePlan) return null;

  const storedData = activePlan.explanationData;
  const data: ExplanationData = {
    title: storedData?.title ?? activePlan.title,
    churchLogoUrl: storedData?.churchLogoUrl,
    churchLogo1Url: storedData?.churchLogo1Url,
    churchLogo2Url: storedData?.churchLogo2Url,
    qrCodeUrl: storedData?.qrCodeUrl,
    timeBlocks: storedData?.timeBlocks ?? DEFAULT_TIME_BLOCKS,
    nextDates: storedData?.nextDates ?? DEFAULT_NEXT_DATES,
  };

  const update = (updates: Partial<ExplanationData>) =>
    updateActivePlan({ explanationData: { ...data, ...updates } });

  const updateTimeBlock = (index: 0 | 1 | 2, field: 'time' | 'description', val: string) => {
    const blocks: [TimeBlock, TimeBlock, TimeBlock] = [
      { ...data.timeBlocks[0] },
      { ...data.timeBlocks[1] },
      { ...data.timeBlocks[2] },
    ];
    blocks[index] = { ...blocks[index], [field]: val };
    update({ timeBlocks: blocks });
  };

  const imgUpload =
    (key: 'churchLogo1Url' | 'churchLogo2Url' | 'qrCodeUrl') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => update({ [key]: reader.result as string });
      reader.readAsDataURL(file);
      e.target.value = '';
    };

  const exportToPDF = async () => {
    if (!pageRef.current) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 200));
    try {
      const { toPng } = await import('html-to-image');
      const hiddenEls = pageRef.current.querySelectorAll<HTMLElement>('[data-export-hidden]');
      hiddenEls.forEach((el) => (el.style.visibility = 'hidden'));
      const dataUrl = await toPng(pageRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      hiddenEls.forEach((el) => (el.style.visibility = ''));
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
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
      {/* Hidden file inputs — outside the captured page div */}
      <input ref={logo1Ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={imgUpload('churchLogo1Url')} />
      <input ref={logo2Ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={imgUpload('churchLogo2Url')} />
      <input ref={qrRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={imgUpload('qrCodeUrl')} />

      {/* Export button */}
      <div style={{ maxWidth: 794 }} className="mx-auto mb-4 flex justify-end">
        <button
          onClick={exportToPDF}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-[#6bbfd4] text-white rounded-full shadow text-sm font-medium hover:bg-[#5aaec3] transition-all active:scale-95 disabled:opacity-50"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Als PDF exportieren
        </button>
      </div>

      {/* ── A4 Portrait page — 794 × 1123 px ── */}
      <div
        ref={pageRef}
        style={{
          width: 794,
          height: 1123,
          backgroundColor: '#ffffff',
          margin: '0 auto',
          padding: '44px 52px',
          boxShadow: '0 4px 32px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* ── HEADER: ErKi logo left, two church logos right ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 32,
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpeg" alt="ErlebnisKirche" style={{ height: 72, width: 'auto', objectFit: 'contain' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <LogoSlot
              url={data.churchLogo1Url}
              onUpload={() => logo1Ref.current?.click()}
              onRemove={() => update({ churchLogo1Url: undefined })}
              label="Gemeinschaft lebt"
              height={72}
              maxWidth={120}
            />
            <LogoSlot
              url={data.churchLogo2Url}
              onUpload={() => logo2Ref.current?.click()}
              onRemove={() => update({ churchLogo2Url: undefined })}
              label="Pfarrverband Feucht"
              height={72}
              maxWidth={120}
            />
          </div>
        </div>

        {/* ── THREE TIME BLOCKS — two-column, no borders ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {([0, 1, 2] as const).map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'stretch',
                borderBottom: i < 2 ? '1px solid #e5e7eb' : 'none',
                padding: '20px 0',
              }}
            >
              {/* Left ~30%: time label, centered vertically */}
              <div
                style={{
                  width: '30%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingRight: 20,
                }}
              >
                <CE
                  value={data.timeBlocks[i].time}
                  onChange={(v) => updateTimeBlock(i, 'time', v)}
                  style={{
                    fontSize: 22,
                    fontWeight: 400,
                    color: '#1f2937',
                    textAlign: 'center',
                    lineHeight: 1.35,
                  }}
                />
              </div>

              {/* Vertical divider */}
              <div style={{ width: 1, background: '#d1d5db', flexShrink: 0 }} />

              {/* Right ~70%: description, text centered horizontally */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 28,
                }}
              >
                <CE
                  value={data.timeBlocks[i].description}
                  onChange={(v) => updateTimeBlock(i, 'description', v)}
                  style={{
                    fontSize: 23,
                    fontWeight: 400,
                    color: '#1f2937',
                    textAlign: 'center',
                    lineHeight: 1.45,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── BOTTOM: sticky note left + feedback/QR right ── */}
        <div
          style={{
            display: 'flex',
            gap: 28,
            marginTop: 28,
            alignItems: 'flex-start',
            flexShrink: 0,
          }}
        >
          {/* Left ~42%: yellow sticky note */}
          <div
            style={{
              width: '42%',
              background: '#fef9c3',
              borderRadius: 10,
              padding: '22px 26px',
              boxShadow: '4px 5px 18px rgba(0,0,0,0.18)',
              transform: 'rotate(-2deg)',
              fontFamily: "'Patrick Hand', cursive",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 19,
                fontWeight: 700,
                textDecoration: 'underline',
                marginBottom: 14,
                color: '#1c1917',
              }}
            >
              N\u00e4chste Termine:
            </div>
            {data.nextDates.map((date, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ color: '#1c1917', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>•</span>
                <BareInput
                  value={date}
                  onChange={(v) => {
                    const arr = [...data.nextDates];
                    arr[idx] = v;
                    update({ nextDates: arr });
                  }}
                  placeholder="Datum \u2026"
                  style={{ fontSize: 17, color: '#1c1917' }}
                />
                <button
                  data-export-hidden
                  onClick={() => update({ nextDates: data.nextDates.filter((_, j) => j !== idx) })}
                  style={{ color: '#78350f', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 2 }}
                  title="Termin entfernen"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              data-export-hidden
              onClick={() => update({ nextDates: [...data.nextDates, ''] })}
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 14,
                color: '#92400e',
                cursor: 'pointer',
                opacity: 0.75,
                background: 'none',
                border: 'none',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              <Plus size={13} /> Termin hinzuf\u00fcgen
            </button>
          </div>

          {/* Right ~55%: feedback text + QR code */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              paddingTop: 8,
            }}
          >
            <div style={{ fontSize: 20, textAlign: 'center', color: '#1f2937', lineHeight: 1.6 }}>
              Feedback? Gerne!
              <br />
              Einfach ansprechen oder
              <br />
              QR-Code scannen!
            </div>

            {data.qrCodeUrl ? (
              <div style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qrCodeUrl} alt="QR-Code" style={{ width: 130, height: 130, objectFit: 'contain' }} />
                <button
                  data-export-hidden
                  onClick={() => update({ qrCodeUrl: undefined })}
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
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <UploadBtn onClick={() => qrRef.current?.click()} label="QR-Code hochladen" size={110} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
