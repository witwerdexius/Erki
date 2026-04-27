'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Map as MapIcon, List, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { exportLageplanPDF, exportTablePDF } from '@/lib/pdfExport';
import type { User } from '@supabase/supabase-js';

interface SharedStation {
  id: string;
  number: string;
  name: string;
  description: string;
  material: string;
  instructions: string;
  impulses: string[];
  setupBy: string;
  conductedBy: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  isFilled?: boolean;
  colorVariant?: number;
}

interface MaskPolygon {
  points: { x: number; y: number }[];
}

interface LogoOverlay {
  x: number;
  y: number;
  size: number;
}

interface LabelOverlay {
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

interface PlanningInfo {
  planningId: string;
  title: string;
  status: string;
  updatedAt: string;
  stationCount: number;
  backgroundImage: string | null;
  masks: MaskPolygon[];
  logoOverlay: LogoOverlay | null;
  labelOverlay: LabelOverlay | null;
  bgZoom: number;
  stations: SharedStation[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  active: 'Aktiv',
  archive: 'Archiv',
};

const STATION_COLORS = [
  { style: { borderColor: '#6bbfd4', backgroundColor: 'white' }, bg: '#6bbfd4' },
  { style: { borderColor: '#9b8ec4', backgroundColor: 'white' }, bg: '#9b8ec4' },
  { style: { borderColor: '#7bc9a0', backgroundColor: 'white' }, bg: '#7bc9a0' },
  { style: { borderColor: '#e07aaa', backgroundColor: 'white' }, bg: '#e07aaa' },
];

function simulateLines(text: string, cpl: number) {
  const segs = text.split(/(?<=[-\s])/);
  let lines = 1, lc = 0;
  for (const seg of segs) {
    if (lc + seg.length > cpl && lc > 0) { lines++; lc = seg.length; }
    else { lc += seg.length; }
    while (lc > cpl) { lines++; lc -= cpl; }
  }
  return lines;
}

function ReadonlyLageplan({ planning }: { planning: PlanningInfo }) {
  const zoom = planning.bgZoom || 1;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const mapScale = containerWidth > 0 ? containerWidth / 800 : 1;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex-1 overflow-auto p-2 sm:p-8 flex items-center justify-center" style={{ overscrollBehavior: 'contain' }}>
      <div ref={containerRef} className="relative bg-white shadow-2xl overflow-hidden border border-gray-200 aspect-[297/210] h-auto w-full max-w-5xl">
        <div
          className="absolute inset-0 pointer-events-none origin-center"
          style={{ transform: `scale(${zoom})` }}
        >
          {planning.backgroundImage && (
            <div className="absolute inset-0 select-none overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={planning.backgroundImage}
                className="w-full h-full object-contain opacity-50"
                alt="Lageplan"
              />
            </div>
          )}

          {planning.masks.length > 0 && (
            <svg
              className="absolute z-10"
              style={{ inset: '-1px', width: 'calc(100% + 2px)', height: 'calc(100% + 2px)' }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {planning.masks.map((mask, mi) => (
                <path
                  key={mi}
                  fillRule="evenodd"
                  fill="white"
                  d={`M0,0 L100,0 L100,100 L0,100 Z M${mask.points.map(p => `${p.x},${p.y}`).join(' L')} Z`}
                />
              ))}
            </svg>
          )}
        </div>

        {!planning.backgroundImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-50/50 pointer-events-none">
            <MapIcon className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-lg font-medium">Kein Lageplan vorhanden</p>
          </div>
        )}

        <div className="absolute inset-0 select-none">
          <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-20">
            {planning.stations.map(s => (
              <line
                key={s.id}
                x1={`${s.targetX}%`}
                y1={`${s.targetY}%`}
                x2={`${s.x}%`}
                y2={`${s.y}%`}
                stroke="black"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                className="opacity-40"
              />
            ))}
          </svg>

          {planning.stations.map((s, idx) => {
            const colorIndex = s.colorVariant ?? (idx % STATION_COLORS.length);
            const color = STATION_COLORS[colorIndex % STATION_COLORS.length];
            const availW = 64, availH = 58, charRatio = 0.56, lineH = 1.2;
            let computedFontSize = 7;
            for (let f = 14; f >= 7; f--) {
              const cpl = Math.floor(availW / (f * charRatio));
              if (cpl < 1) continue;
              if (simulateLines((s.name || '').toUpperCase(), cpl) * f * lineH <= availH) {
                computedFontSize = f; break;
              }
            }

            return (
              <React.Fragment key={s.id}>
                <div
                  className="absolute flex items-center justify-center z-20 pointer-events-none"
                  style={{
                    left: `${s.targetX}%`,
                    top: `${s.targetY}%`,
                    width: 44 * mapScale,
                    height: 44 * mapScale,
                    marginLeft: -22 * mapScale,
                    marginTop: -22 * mapScale,
                  }}
                >
                  <div
                    className="rounded-full shadow-lg border-2 border-white"
                    style={{ backgroundColor: color.bg, width: 16 * mapScale, height: 16 * mapScale }}
                  />
                </div>

                <div
                  className="absolute rounded-full shadow-xl z-30 pointer-events-none"
                  style={{
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    width: 96 * mapScale,
                    height: 96 * mapScale,
                    marginLeft: -48 * mapScale,
                    marginTop: -48 * mapScale,
                  }}
                >
                  <div
                    className="w-full h-full rounded-full flex flex-col items-center justify-center text-center bg-white overflow-hidden"
                    style={
                      s.isFilled
                        ? {
                            backgroundColor: color.bg,
                            borderColor: color.bg,
                            borderWidth: 6 * mapScale,
                            borderStyle: 'solid',
                            padding: 8 * mapScale,
                          }
                        : { ...color.style, borderWidth: 6 * mapScale, borderStyle: 'solid', padding: 8 * mapScale }
                    }
                  >
                    <span
                      className={cn(
                        'font-mono font-bold uppercase leading-tight line-clamp-5 tracking-tight w-full',
                        s.isFilled ? 'text-white' : 'text-gray-400',
                      )}
                      style={{
                        hyphens: 'auto',
                        WebkitHyphens: 'auto',
                        overflowWrap: 'anywhere',
                        fontSize: `${computedFontSize * mapScale}px`,
                      }}
                    >
                      {s.name}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {planning.logoOverlay && (
          <div
            className="absolute z-40 pointer-events-none"
            style={{
              left: `${planning.logoOverlay.x}%`,
              top: `${planning.logoOverlay.y}%`,
              width: `${planning.logoOverlay.size}%`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Logo" className="w-full h-auto block" draggable={false} />
          </div>
        )}

        {planning.labelOverlay && (
          <div
            className="absolute z-40 pointer-events-none"
            style={{ left: `${planning.labelOverlay.x}%`, top: `${planning.labelOverlay.y}%` }}
          >
            <div
              className="font-bold uppercase tracking-widest whitespace-nowrap"
              style={{ fontSize: planning.labelOverlay.fontSize * mapScale, color: '#1a1a1a' }}
            >
              {planning.labelOverlay.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadonlyTabelle({ stations }: { stations: SharedStation[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-2 sm:p-4 lg:p-12" style={{ overscrollBehavior: 'contain' }}>
      <div className="bg-white rounded-3xl shadow-xl border border-gray-200">
        <div className="overflow-x-auto" style={{ overflowY: 'clip', overscrollBehaviorX: 'contain' }}>
          <table className="w-full table-fixed text-left border-collapse sm:min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-4 w-10 text-xs font-bold uppercase text-gray-600 tracking-wider">Nr.</th>
                <th className="p-4 w-48 text-xs font-bold uppercase text-gray-600 tracking-wider">Station</th>
                <th className="max-sm:hidden sm:table-cell p-4 w-64 text-xs font-bold uppercase text-gray-600 tracking-wider">Beschreibung</th>
                <th className="max-sm:hidden sm:table-cell p-4 w-64 text-xs font-bold uppercase text-gray-600 tracking-wider">Material</th>
                <th className="max-sm:hidden sm:table-cell p-4 w-40 text-xs font-bold uppercase text-gray-600 tracking-wider">Gesprächsimpulse</th>
                <th className="max-sm:hidden sm:table-cell p-4 w-28 text-xs font-bold uppercase text-gray-600 tracking-wider">Aufbau</th>
                <th className="max-sm:hidden sm:table-cell p-4 w-28 text-xs font-bold uppercase text-gray-600 tracking-wider">Durchführung</th>
                <th className="sm:hidden p-4 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {stations.map(s => (
                <React.Fragment key={s.id}>
                  <tr
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer sm:cursor-default"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  >
                    <td className="p-4 align-top font-medium text-[#6bbfd4]">{s.number}</td>
                    <td className="p-4 align-top font-bold whitespace-pre-wrap max-w-0 overflow-hidden">{s.name}</td>
                    <td className="max-sm:hidden sm:table-cell p-4 w-64 align-top text-sm whitespace-pre-wrap max-w-0 overflow-hidden">{s.description}</td>
                    <td className="max-sm:hidden sm:table-cell p-4 w-64 align-top text-xs whitespace-pre-wrap text-gray-500 max-w-0 overflow-hidden">{s.material}</td>
                    <td className="max-sm:hidden sm:table-cell p-4 align-top text-sm whitespace-pre-wrap text-gray-500">{(s.impulses || []).join('\n')}</td>
                    <td className="max-sm:hidden sm:table-cell p-4 align-top text-sm whitespace-pre-wrap">{s.setupBy}</td>
                    <td className="max-sm:hidden sm:table-cell p-4 align-top text-sm whitespace-pre-wrap">{s.conductedBy}</td>
                    <td className="sm:hidden p-4 align-middle">
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === s.id ? null : s.id); }}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {expandedId === s.id
                          ? <ChevronUp className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />
                        }
                      </button>
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr className="sm:hidden bg-gray-50/80">
                      <td colSpan={3} className="px-4 pb-4 pt-2 space-y-3">
                        {s.description ? (
                          <div>
                            <p className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-1">Beschreibung</p>
                            <p className="text-sm whitespace-pre-wrap text-gray-700">{s.description}</p>
                          </div>
                        ) : null}
                        {s.material ? (
                          <div>
                            <p className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-1">Material</p>
                            <p className="text-xs whitespace-pre-wrap text-gray-500">{s.material}</p>
                          </div>
                        ) : null}
                        {(s.impulses || []).length > 0 ? (
                          <div>
                            <p className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-1">Gesprächsimpulse</p>
                            <p className="text-sm whitespace-pre-wrap text-gray-500">{s.impulses.join('\n')}</p>
                          </div>
                        ) : null}
                        {s.setupBy ? (
                          <div>
                            <p className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-1">Aufbau</p>
                            <p className="text-sm whitespace-pre-wrap text-gray-700">{s.setupBy}</p>
                          </div>
                        ) : null}
                        {s.conductedBy ? (
                          <div>
                            <p className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-1">Durchführung</p>
                            <p className="text-sm whitespace-pre-wrap text-gray-700">{s.conductedBy}</p>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {stations.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400 text-sm">
                    Keine Stationen vorhanden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [planning, setPlanning] = useState<PlanningInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'table'>('table');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    async function init() {
      const [planRes, { data: { session } }] = await Promise.all([
        fetch(`/api/share/${token}`),
        supabase.auth.getSession(),
      ]);

      setUser(session?.user ?? null);

      if (!planRes.ok) {
        setError('Dieser Link ist ungültig oder abgelaufen.');
        setLoading(false);
        return;
      }

      setPlanning(await planRes.json());
      setLoading(false);
    }
    init();
  }, [token]);

  const handleJoin = async () => {
    if (!user) return;
    setJoining(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/share/${token}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? 'Fehler beim Beitreten.');
        return;
      }

      const { planningId } = await res.json();
      sessionStorage.setItem('activePlanId', planningId);
      router.push('/');
    } catch (e) {
      console.error('[SharePage] join error:', e);
    } finally {
      setJoining(false);
    }
  };

  const handleLageplanPDF = async () => {
    if (!planning) return;
    setIsExporting(true);
    try {
      await exportLageplanPDF({
        backgroundImage: planning.backgroundImage,
        bgZoom: planning.bgZoom,
        masks: planning.masks,
        stations: planning.stations,
        logoOverlay: planning.logoOverlay,
        labelOverlay: planning.labelOverlay,
        title: planning.title,
        aspectRatio: 'landscape',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleTablePDF = async () => {
    if (!planning) return;
    setIsExporting(true);
    try {
      await exportTablePDF({
        title: planning.title,
        stations: planning.stations,
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <main className="h-[100dvh] bg-[#fdfdfd] font-sans flex flex-col overflow-hidden">
        <div className="bg-[#6bbfd4] px-4 py-2 sm:py-3 flex items-center justify-between gap-4 shrink-0">
          <div className="h-4 bg-white/30 rounded-full w-52 animate-pulse" />
          <div className="h-7 bg-white/30 rounded-full w-28 animate-pulse" />
        </div>
        <header className="px-4 sm:px-6 py-2 sm:py-4 border-b bg-white shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-5 bg-gray-200 rounded-full w-64 animate-pulse" />
              <div className="h-3 bg-gray-100 rounded-full w-32 animate-pulse" />
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="bg-gray-100 rounded-full p-1 flex items-center gap-1 w-fit">
              <div className="h-8 w-24 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-8 w-24 bg-gray-200 rounded-full animate-pulse" />
            </div>
          </div>
        </header>
        <div className="flex-1 bg-gray-100 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto p-4 sm:p-12">
            <div className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex gap-4">
                <div className="h-4 bg-gray-200 rounded w-8 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-28 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-44 animate-pulse hidden sm:block" />
                <div className="h-4 bg-gray-200 rounded w-60 animate-pulse hidden sm:block" />
              </div>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="p-4 border-b last:border-0 flex gap-4">
                  <div className="h-4 bg-gray-100 rounded w-8 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded w-28 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded w-44 animate-pulse hidden sm:block" />
                  <div className="h-4 bg-gray-100 rounded w-60 animate-pulse hidden sm:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !planning) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-[#fdfdfd]">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{error ?? 'Planung nicht gefunden.'}</p>
          <Link href="/" className="text-[#6bbfd4] hover:underline">Zur Startseite</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[100dvh] bg-[#fdfdfd] text-[#1a1a1a] font-sans flex flex-col overflow-hidden">
      <div className="bg-[#6bbfd4] text-white px-4 py-2 sm:py-3 flex items-center justify-between gap-3 shrink-0">
        <span className="text-xs sm:text-sm font-medium leading-tight">
          {user
            ? 'Diese Planung wurde mit dir geteilt'
            : 'Melde dich an um diese Planung zu bearbeiten'}
        </span>
        {user ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="bg-white text-[#6bbfd4] px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-70 shrink-0"
          >
            {joining ? '…' : (
              <>
                <span className="sm:hidden">Hinzufügen</span>
                <span className="hidden sm:inline">Zu meiner Planung hinzufügen</span>
              </>
            )}
          </button>
        ) : (
          <Link
            href="/"
            className="bg-white text-[#6bbfd4] px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold hover:bg-gray-50 transition-colors shrink-0"
          >
            Zum Login
          </Link>
        )}
      </div>

      <header className="px-4 sm:px-6 py-2 sm:py-4 border-b bg-white shrink-0">
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-bold leading-tight">{planning.title}</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {planning.stationCount} Station{planning.stationCount !== 1 ? 'en' : ''}{' '}
            · {STATUS_LABELS[planning.status] ?? planning.status}
          </p>
        </div>
        <div className="mt-1.5 sm:mt-3 flex items-center">
          <div className="bg-gray-100 rounded-full p-1 flex items-center text-sm">
            <button
              onClick={() => setActiveTab('map')}
              className={cn(
                'px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 transition-colors',
                activeTab === 'map' ? 'bg-white shadow-sm text-[#6bbfd4]' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <MapIcon className="w-4 h-4" /> Lageplan
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={cn(
                'px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 transition-colors',
                activeTab === 'table' ? 'bg-white shadow-sm text-[#6bbfd4]' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <List className="w-4 h-4" /> Tabelle
            </button>
          </div>
          {activeTab === 'map' && planning.backgroundImage && (
            <button
              onClick={handleLageplanPDF}
              disabled={isExporting}
              className="ml-auto bg-[#6bbfd4] text-white px-2.5 py-1.5 rounded-full text-sm font-medium hover:bg-[#5aaec3] transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{isExporting ? 'Wird erstellt…' : 'PDF'}</span>
            </button>
          )}
          {activeTab === 'table' && planning.stations.length > 0 && (
            <button
              onClick={handleTablePDF}
              disabled={isExporting}
              className="ml-auto bg-[#6bbfd4] text-white px-2.5 py-1.5 rounded-full text-sm font-medium hover:bg-[#5aaec3] transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{isExporting ? 'Wird erstellt…' : 'PDF'}</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 bg-gray-100 overflow-hidden flex flex-col">
        {activeTab === 'map' ? (
          <ReadonlyLageplan planning={planning} />
        ) : (
          <ReadonlyTabelle stations={planning.stations} />
        )}
      </div>
    </main>
  );
}
