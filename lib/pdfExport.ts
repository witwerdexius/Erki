interface LageplanStation {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  colorVariant?: number;
  isFilled?: boolean;
  name: string;
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

export interface LageplanPDFParams {
  backgroundImage?: string | null;
  bgZoom?: number;
  masks?: MaskPolygon[];
  stations: LageplanStation[];
  logoOverlay?: LogoOverlay | null;
  labelOverlay?: LabelOverlay | null;
  title: string;
  aspectRatio: 'landscape' | 'portrait';
}

interface TableStation {
  number: string;
  name: string;
  description?: string;
  material?: string;
  impulses?: string[];
  setupBy?: string;
  conductedBy?: string;
  isFilled?: boolean;
}

export interface TablePDFParams {
  title: string;
  stations: TableStation[];
}

const COLORS = ['#6bbfd4', '#9b8ec4', '#7bc9a0', '#e07aaa'];
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export function sanitizeTitle(title: string, fallback: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(?:^-+)|(?:-+$)/g, '') || fallback
  );
}

export function simulateLines(text: string, cpl: number): number {
  const segs = text.split(/(?<=[-\s])/);
  let lines = 1;
  let lc = 0;
  for (const seg of segs) {
    if (lc + seg.length > cpl && lc > 0) {
      lines++;
      lc = seg.length;
    } else {
      lc += seg.length;
    }
    while (lc > cpl) {
      lines++;
      lc -= cpl;
    }
  }
  return lines;
}

export function pickFontSize(name: string, availW: number, availH: number): number {
  const charRatio = 0.56;
  const lineH = 1.2;
  for (let f = 14; f >= 7; f--) {
    const cpl = Math.floor(availW / (f * charRatio));
    if (cpl < 1) continue;
    if (simulateLines(name, cpl) * f * lineH <= availH) return f;
  }
  return 7;
}

interface CanvasSize {
  W: number;
  H: number;
  mapScale: number;
}

function createPageCanvas(aspectRatio: 'landscape' | 'portrait'): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  size: CanvasSize;
} {
  const isLandscape = aspectRatio === 'landscape';
  const W = isLandscape ? 2480 : 1754;
  const H = isLandscape ? 1754 : 2480;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  return { canvas, ctx, size: { W, H, mapScale: W / 800 } };
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const blob = await fetch(url).then(r => r.blob());
  const objUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = objUrl;
    });
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

function applyZoomTransform(ctx: CanvasRenderingContext2D, size: CanvasSize, zoom: number): void {
  ctx.translate(size.W / 2, size.H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-size.W / 2, -size.H / 2);
}

async function drawBackground(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  backgroundImage: string,
  bgZoom: number,
): Promise<void> {
  const bgImg = await loadImageFromUrl(backgroundImage);
  if (bgImg.naturalWidth <= 0) return;
  const { W, H } = size;
  const imgAspect = bgImg.naturalWidth / bgImg.naturalHeight;
  const containerAspect = W / H;
  let dw: number;
  let dh: number;
  if (imgAspect > containerAspect) {
    dw = W;
    dh = W / imgAspect;
  } else {
    dh = H;
    dw = H * imgAspect;
  }
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;

  ctx.save();
  applyZoomTransform(ctx, size, bgZoom);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(bgImg, dx, dy, dw, dh);
  ctx.restore();
}

function drawMask(ctx: CanvasRenderingContext2D, size: CanvasSize, mask: MaskPolygon, zoom: number): void {
  const { W, H } = size;
  ctx.save();
  applyZoomTransform(ctx, size, zoom);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  if (mask.points.length > 0) {
    ctx.moveTo((mask.points[0].x / 100) * W, (mask.points[0].y / 100) * H);
    for (let i = 1; i < mask.points.length; i++) {
      ctx.lineTo((mask.points[i].x / 100) * W, (mask.points[i].y / 100) * H);
    }
    ctx.closePath();
  }
  ctx.fillStyle = 'white';
  ctx.fill('evenodd');
  ctx.restore();
}

function drawMasks(ctx: CanvasRenderingContext2D, size: CanvasSize, masks: MaskPolygon[], zoom: number): void {
  for (const mask of masks) drawMask(ctx, size, mask, zoom);
}

function drawConnectionLines(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  stations: LageplanStation[],
): void {
  const { W, H, mapScale } = size;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5 * mapScale;
  ctx.setLineDash([4 * mapScale, 4 * mapScale]);
  for (const s of stations) {
    ctx.beginPath();
    ctx.moveTo((s.targetX / 100) * W, (s.targetY / 100) * H);
    ctx.lineTo((s.x / 100) * W, (s.y / 100) * H);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStationBubble(
  ctx: CanvasRenderingContext2D,
  mapScale: number,
  bx: number,
  by: number,
  bubbleR: number,
  borderW: number,
  colorHex: string,
  isFilled: boolean,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 18 * mapScale;
  ctx.shadowOffsetY = 5 * mapScale;
  ctx.beginPath();
  ctx.arc(bx, by, bubbleR, 0, Math.PI * 2);
  ctx.fillStyle = colorHex;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(bx, by, bubbleR, 0, Math.PI * 2);
  ctx.fillStyle = colorHex;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(bx, by, bubbleR - borderW, 0, Math.PI * 2);
  ctx.fillStyle = isFilled ? colorHex : '#ffffff';
  ctx.fill();
}

function drawTargetMarker(
  ctx: CanvasRenderingContext2D,
  mapScale: number,
  tx: number,
  ty: number,
  targetR: number,
  colorHex: string,
): void {
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(tx, ty, targetR, 0, Math.PI * 2);
  ctx.fillStyle = colorHex;
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2 * mapScale;
  ctx.stroke();
}

function splitWordIntoChunks(
  rest: string,
  maxTw: number,
  measure: (s: string) => number,
  pushLine: (line: string) => void,
): string {
  let chunk = '';
  let working = rest;
  while (working.length > 0) {
    let breakAt = 1;
    while (breakAt < working.length && measure(working.slice(0, breakAt + 1)) <= maxTw) breakAt++;
    const ch = working.slice(0, breakAt);
    working = working.slice(breakAt);
    if (working.length > 0) pushLine(ch);
    else chunk = ch;
  }
  return chunk;
}

function breakWordWithHyphenation(
  word: string,
  hyphenate: (w: string) => string,
  maxTw: number,
  measure: (s: string) => number,
  pushLine: (line: string) => void,
): string {
  const syllables = hyphenate(word).split('­');
  let chunk = '';
  for (let si = 0; si < syllables.length; si++) {
    const syl = syllables[si];
    const isLast = si === syllables.length - 1;
    const candidate = chunk + syl;
    const needsHyphen = !isLast && !candidate.endsWith('-');
    const measureStr = needsHyphen ? candidate + '-' : candidate;
    if (!chunk || measure(measureStr) <= maxTw) {
      chunk = candidate;
      continue;
    }
    pushLine(chunk.endsWith('-') ? chunk : chunk + '-');
    const sylNeedsHyphen = !isLast && !syl.endsWith('-');
    if (measure(sylNeedsHyphen ? syl + '-' : syl) > maxTw) {
      chunk = splitWordIntoChunks(syl, maxTw, measure, pushLine);
    } else {
      chunk = syl;
    }
  }
  return chunk;
}

function wrapStationName(
  name: string,
  hyphenate: (w: string) => string,
  maxTw: number,
  measure: (s: string) => number,
): string[] {
  const lines: string[] = [];
  let cur = '';
  const pushLine = (line: string) => lines.push(line);
  for (const word of name.split(/\s+/)) {
    if (!word) continue;
    const wordW = measure(word);
    if (!cur) {
      cur = wordW <= maxTw ? word : breakWordWithHyphenation(word, hyphenate, maxTw, measure, pushLine);
      continue;
    }
    const testW = measure(`${cur} ${word}`);
    if (testW <= maxTw) {
      cur = `${cur} ${word}`;
    } else {
      lines.push(cur);
      cur = wordW <= maxTw ? word : breakWordWithHyphenation(word, hyphenate, maxTw, measure, pushLine);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawStationLabel(
  ctx: CanvasRenderingContext2D,
  mapScale: number,
  bx: number,
  by: number,
  bubbleR: number,
  borderW: number,
  station: LageplanStation,
  hyphenate: (w: string) => string,
): void {
  const textColor = station.isFilled ? '#ffffff' : '#9ca3af';
  const name = station.name.toUpperCase();
  const availW = 64;
  const availH = 58;
  const computedFontSize = pickFontSize(name, availW, availH);
  const fontPx = computedFontSize * mapScale;
  ctx.font = `bold ${fontPx}px ${FONT_MONO}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(-0.025 * fontPx).toFixed(2)}px`;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, bubbleR - borderW - mapScale, 0, Math.PI * 2);
  ctx.clip();

  const maxTw = availW * mapScale;
  const renderLineH = 1.25;
  const lines = wrapStationName(name, hyphenate, maxTw, (s) => ctx.measureText(s).width);
  const totalH = lines.length * fontPx * renderLineH;
  const startY = by - totalH / 2 + (fontPx * renderLineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, bx, startY + i * fontPx * renderLineH));
  ctx.restore();
}

function drawStations(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  stations: LageplanStation[],
  hyphenate: (w: string) => string,
): void {
  const { W, H, mapScale } = size;
  const bubbleR = 48 * mapScale;
  const borderW = 6 * mapScale;
  const targetR = 8 * mapScale;
  for (const [idx, s] of stations.entries()) {
    const colorHex = COLORS[(s.colorVariant ?? idx) % 4];
    const tx = (s.targetX / 100) * W;
    const ty = (s.targetY / 100) * H;
    const bx = (s.x / 100) * W;
    const by = (s.y / 100) * H;
    drawTargetMarker(ctx, mapScale, tx, ty, targetR, colorHex);
    drawStationBubble(ctx, mapScale, bx, by, bubbleR, borderW, colorHex, !!s.isFilled);
    drawStationLabel(ctx, mapScale, bx, by, bubbleR, borderW, s, hyphenate);
  }
}

async function drawLogoOverlay(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  lo: LogoOverlay,
): Promise<void> {
  try {
    const logoImg = await loadImageFromUrl('/logo.jpeg');
    if (logoImg.naturalWidth <= 0) return;
    const { W, H } = size;
    const lx = (lo.x / 100) * W;
    const ly = (lo.y / 100) * H;
    const lw = (lo.size / 100) * W;
    const lh = lw * (logoImg.naturalHeight / logoImg.naturalWidth);
    ctx.drawImage(logoImg, lx, ly, lw, lh);
  } catch {
    /* ignore logo load failures */
  }
}

function drawLabelOverlay(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  lb: LabelOverlay,
): void {
  ctx.font = `bold ${lb.fontSize * size.mapScale}px sans-serif`;
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.setLineDash([]);
  ctx.fillText(lb.text.toUpperCase(), (lb.x / 100) * size.W, (lb.y / 100) * size.H);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadHyphenator(): Promise<(word: string) => string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createHyphenator = ((await import('hyphen')) as any).default ?? (await import('hyphen'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dePatterns = ((await import('hyphen/patterns/de-1996')) as any).default ?? (await import('hyphen/patterns/de-1996'));
  return createHyphenator(dePatterns);
}

interface PdfPlacement {
  drawW: number;
  drawH: number;
  offsetX: number;
  offsetY: number;
}

export function computePdfImagePlacement(
  pdfWidth: number,
  pdfHeight: number,
  imgAspect: number,
): PdfPlacement {
  let drawW = pdfWidth;
  let drawH = pdfWidth / imgAspect;
  if (drawH > pdfHeight) {
    drawH = pdfHeight;
    drawW = pdfHeight * imgAspect;
  }
  const offsetX = (pdfWidth - drawW) / 2;
  const offsetY = (pdfHeight - drawH) / 2;
  return { drawW, drawH, offsetX, offsetY };
}

async function savePngAsPdf(
  canvas: HTMLCanvasElement,
  size: CanvasSize,
  aspectRatio: 'landscape' | 'portrait',
  fileName: string,
): Promise<void> {
  const dataUrl = canvas.toDataURL('image/png');
  const imgAspect = size.W / size.H;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: aspectRatio, unit: 'mm', format: 'a4' });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const { drawW, drawH, offsetX, offsetY } = computePdfImagePlacement(pdfWidth, pdfHeight, imgAspect);
  pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, drawW, drawH);
  pdf.save(fileName);
}

export async function exportLageplanPDF(params: LageplanPDFParams): Promise<void> {
  const { backgroundImage, bgZoom, masks, stations, logoOverlay, labelOverlay, title, aspectRatio } = params;
  try {
    console.log('[PDF] Step 1: building canvas');
    const { canvas, ctx, size } = createPageCanvas(aspectRatio);
    const zoom = bgZoom ?? 1;

    if (backgroundImage) await drawBackground(ctx, size, backgroundImage, zoom);
    if (masks && masks.length > 0) drawMasks(ctx, size, masks, zoom);

    const hyphenate = await loadHyphenator();

    drawConnectionLines(ctx, size, stations);
    drawStations(ctx, size, stations, hyphenate);

    if (logoOverlay) await drawLogoOverlay(ctx, size, logoOverlay);
    if (labelOverlay) drawLabelOverlay(ctx, size, labelOverlay);

    console.log('[PDF] Step 2: creating PDF');
    const sanitizedTitle = sanitizeTitle(title, 'lageplan');
    console.log('[PDF] Step 3: saving');
    await savePngAsPdf(canvas, size, aspectRatio, `${sanitizedTitle}.pdf`);
    console.log('[PDF] Done');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[PDF] Export failed:', error);
    alert(`PDF Export fehlgeschlagen:\n${msg}`);
  }
}

const TABLE_CELL_PADDING = 3;

interface TableTextMeasurer {
  measure: (s: string) => number;
  hyphenW: number;
  maxW: number;
}

function appendHyphenatedWord(
  word: string,
  hyphenate: (w: string) => string,
  m: TableTextMeasurer,
  pushLine: (line: string) => void,
): { line: string; lineW: number } {
  const parts = hyphenate(word).split('­');
  let chunk = '';
  let chunkW = 0;
  for (const part of parts) {
    const partW = m.measure(part);
    if (!chunk) {
      chunk = part;
      chunkW = partW;
    } else if (chunkW + partW + m.hyphenW <= m.maxW) {
      chunk += part;
      chunkW += partW;
    } else {
      pushLine(chunk + '-');
      chunk = part;
      chunkW = partW;
    }
  }
  return { line: chunk, lineW: chunkW };
}

function wrapTableParagraph(
  paragraph: string,
  hyphenate: (w: string) => string,
  m: TableTextMeasurer,
): string[] {
  const lines: string[] = [];
  let line = '';
  let lineW = 0;
  for (const word of paragraph.split(' ')) {
    if (!word) continue;
    const wordW = m.measure(word);
    const sep = line ? m.measure(' ') : 0;
    if (lineW + sep + wordW <= m.maxW) {
      line = line ? line + ' ' + word : word;
      lineW += sep + wordW;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
      lineW = 0;
    }
    const next = appendHyphenatedWord(word, hyphenate, m, (l) => lines.push(l));
    line = next.line;
    lineW = next.lineW;
  }
  if (line) lines.push(line);
  return lines;
}

function makePreWrap(
  hyphenate: (w: string) => string,
  measure: (s: string) => number,
): (rawText: string, colWidthMm: number) => string {
  return (rawText: string, colWidthMm: number) => {
    if (!rawText) return '';
    const m: TableTextMeasurer = {
      measure,
      hyphenW: measure('-'),
      maxW: colWidthMm - TABLE_CELL_PADDING * 2,
    };
    const lines: string[] = [];
    for (const paragraph of rawText.split('\n')) {
      lines.push(...wrapTableParagraph(paragraph, hyphenate, m));
    }
    return lines.join('\n');
  };
}

interface TableLayout {
  nr: number;
  station: number;
  desc: number;
  mat: number;
  imp: number;
  setup: number;
  cond: number;
  stamp: number;
}

const TABLE_LAYOUT: TableLayout = { nr: 12, station: 30, desc: 65, mat: 72, imp: 40, setup: 20, cond: 20, stamp: 10 };

function buildTableBody(
  stations: TableStation[],
  preWrap: (rawText: string, colWidthMm: number) => string,
): (string)[][] {
  return stations.map(s => [
    s.number,
    preWrap(s.name, TABLE_LAYOUT.station),
    preWrap(s.description || '', TABLE_LAYOUT.desc),
    preWrap(s.material || '', TABLE_LAYOUT.mat),
    (s.impulses || []).map(imp => preWrap(imp, TABLE_LAYOUT.imp)).join('\n'),
    preWrap(s.setupBy || '', TABLE_LAYOUT.setup),
    preWrap(s.conductedBy || '', TABLE_LAYOUT.cond),
    s.isFilled ? '✓' : '',
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTableHeader(pdf: any, title: string): void {
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, 14, 16);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(150);
  pdf.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, 14, 22);
  pdf.setTextColor(0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
}

export async function exportTablePDF(params: TablePDFParams): Promise<void> {
  const { title, stations } = params;
  try {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const hyphenate = await loadHyphenator();

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);

    const preWrap = makePreWrap(hyphenate, (s) => pdf.getTextWidth(s));

    drawTableHeader(pdf, title);

    autoTable(pdf, {
      startY: 27,
      head: [['Nr.', 'Station', 'Beschreibung', 'Material', 'Gesprächsimpulse', 'Aufbau', 'Durchführung', 'Stempelfeld']],
      body: buildTableBody(stations, preWrap),
      styles: { fontSize: 8, cellPadding: TABLE_CELL_PADDING, overflow: 'linebreak' },
      headStyles: { fillColor: [107, 191, 212], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: TABLE_LAYOUT.nr },
        1: { cellWidth: TABLE_LAYOUT.station },
        2: { cellWidth: TABLE_LAYOUT.desc },
        3: { cellWidth: TABLE_LAYOUT.mat },
        4: { cellWidth: TABLE_LAYOUT.imp },
        5: { cellWidth: TABLE_LAYOUT.setup },
        6: { cellWidth: TABLE_LAYOUT.cond },
        7: { cellWidth: TABLE_LAYOUT.stamp, halign: 'center' },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    const sanitizedTitle = sanitizeTitle(title, 'tabelle');
    pdf.save(`${sanitizedTitle}-tabelle.pdf`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[PDF Table] Export failed:', error);
    alert(`Tabellen-PDF Export fehlgeschlagen:\n${msg}`);
  }
}
