import { jsPDF } from 'jspdf';

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

export async function exportLageplanPDF(params: LageplanPDFParams): Promise<void> {
  const { backgroundImage, bgZoom, masks, stations, logoOverlay, labelOverlay, title, aspectRatio } = params;
  try {
    console.log('[PDF] Step 1: building canvas');

    const isLandscape = aspectRatio === 'landscape';
    const W = isLandscape ? 2480 : 1754;
    const H = isLandscape ? 1754 : 2480;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const mapScale = W / 800;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    if (backgroundImage) {
      const blob = await fetch(backgroundImage).then(r => r.blob());
      const objUrl = URL.createObjectURL(blob);
      const bgImg = await new Promise<HTMLImageElement>(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        img.src = objUrl;
      });
      URL.revokeObjectURL(objUrl);

      if (bgImg.naturalWidth > 0) {
        const imgAspect = bgImg.naturalWidth / bgImg.naturalHeight;
        const containerAspect = W / H;
        let dw: number, dh: number;
        if (imgAspect > containerAspect) { dw = W; dh = W / imgAspect; }
        else { dh = H; dw = H * imgAspect; }
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        const zoom = bgZoom ?? 1;

        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-W / 2, -H / 2);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(bgImg, dx, dy, dw, dh);
        ctx.restore();
      }
    }

    if (masks && masks.length > 0) {
      const zoom = bgZoom ?? 1;
      for (const mask of masks) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-W / 2, -H / 2);
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
    }

    const COLORS = ['#6bbfd4', '#9b8ec4', '#7bc9a0', '#e07aaa'];
    const bubbleR = 48 * mapScale;
    const borderW = 6 * mapScale;
    const targetR = 8 * mapScale;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createHyphenator = ((await import('hyphen')) as any).default ?? (await import('hyphen'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dePatterns = ((await import('hyphen/patterns/de-1996')) as any).default ?? (await import('hyphen/patterns/de-1996'));
    const hyphenate: (word: string) => string = createHyphenator(dePatterns);

    const simulateLines = (text: string, cpl: number): number => {
      const segs = text.split(/(?<=[-\s])/);
      let lines = 1, lc = 0;
      for (const seg of segs) {
        if (lc + seg.length > cpl && lc > 0) { lines++; lc = seg.length; }
        else { lc += seg.length; }
        while (lc > cpl) { lines++; lc -= cpl; }
      }
      return lines;
    };

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

    for (const [idx, s] of stations.entries()) {
      const colorHex = COLORS[(s.colorVariant ?? idx) % 4];
      const tx = (s.targetX / 100) * W;
      const ty = (s.targetY / 100) * H;
      const bx = (s.x / 100) * W;
      const by = (s.y / 100) * H;

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(tx, ty, targetR, 0, Math.PI * 2);
      ctx.fillStyle = colorHex;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 * mapScale;
      ctx.stroke();

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
      ctx.fillStyle = s.isFilled ? colorHex : '#ffffff';
      ctx.fill();

      const textColor = s.isFilled ? '#ffffff' : '#9ca3af';
      const name = s.name.toUpperCase();
      const availW = 64, availH = 58, charRatio = 0.56, lineH = 1.2;
      let computedFontSize = 7;
      for (let f = 14; f >= 7; f--) {
        const cpl = Math.floor(availW / (f * charRatio));
        if (cpl < 1) continue;
        if (simulateLines(name, cpl) * f * lineH <= availH) { computedFontSize = f; break; }
      }
      const fontPx = computedFontSize * mapScale;
      const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
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
      const lines: string[] = [];
      let cur = '';
      const breakWord = (w: string) => {
        const syllables = hyphenate(w).split('­');
        let chunk = '';
        for (let si = 0; si < syllables.length; si++) {
          const syl = syllables[si];
          const isLast = si === syllables.length - 1;
          const candidate = chunk + syl;
          const needsHyphen = !isLast && !candidate.endsWith('-');
          const measureStr = needsHyphen ? candidate + '-' : candidate;
          if (!chunk || ctx.measureText(measureStr).width <= maxTw) {
            chunk = candidate;
          } else {
            lines.push(chunk.endsWith('-') ? chunk : chunk + '-');
            const sylNeedsHyphen = !isLast && !syl.endsWith('-');
            if (ctx.measureText(sylNeedsHyphen ? syl + '-' : syl).width > maxTw) {
              let rest = syl;
              while (rest.length > 0) {
                let breakAt = 1;
                while (breakAt < rest.length && ctx.measureText(rest.slice(0, breakAt + 1)).width <= maxTw) breakAt++;
                const ch = rest.slice(0, breakAt);
                rest = rest.slice(breakAt);
                if (rest.length > 0) { lines.push(ch); } else { chunk = ch; }
              }
            } else {
              chunk = syl;
            }
          }
        }
        cur = chunk;
      };
      for (const word of name.split(/\s+/)) {
        if (!word) continue;
        const wordW = ctx.measureText(word).width;
        if (!cur) {
          if (wordW <= maxTw) { cur = word; } else { breakWord(word); }
        } else {
          const testW = ctx.measureText(`${cur} ${word}`).width;
          if (testW <= maxTw) {
            cur = `${cur} ${word}`;
          } else {
            lines.push(cur);
            if (wordW <= maxTw) { cur = word; } else { cur = ''; breakWord(word); }
          }
        }
      }
      if (cur) lines.push(cur);

      const totalH = lines.length * fontPx * renderLineH;
      const startY = by - totalH / 2 + fontPx * renderLineH / 2;
      lines.forEach((line, i) => ctx.fillText(line, bx, startY + i * fontPx * renderLineH));
      ctx.restore();
    }

    if (logoOverlay) {
      const lo = logoOverlay;
      try {
        const blob = await fetch('/logo.jpeg').then(r => r.blob());
        const objUrl = URL.createObjectURL(blob);
        const logoImg = await new Promise<HTMLImageElement>(resolve => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(img);
          img.src = objUrl;
        });
        URL.revokeObjectURL(objUrl);
        if (logoImg.naturalWidth > 0) {
          const lx = (lo.x / 100) * W;
          const ly = (lo.y / 100) * H;
          const lw = (lo.size / 100) * W;
          const lh = lw * (logoImg.naturalHeight / logoImg.naturalWidth);
          ctx.drawImage(logoImg, lx, ly, lw, lh);
        }
      } catch { /* ignore logo load failures */ }
    }

    if (labelOverlay) {
      const lb = labelOverlay;
      ctx.font = `bold ${lb.fontSize * mapScale}px sans-serif`;
      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.setLineDash([]);
      ctx.fillText(lb.text.toUpperCase(), (lb.x / 100) * W, (lb.y / 100) * H);
    }

    console.log('[PDF] Step 2: creating PDF');
    const dataUrl = canvas.toDataURL('image/png');
    const imgAspect = W / H;

    const pdf = new jsPDF({ orientation: aspectRatio, unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    let drawW = pdfWidth;
    let drawH = pdfWidth / imgAspect;
    if (drawH > pdfHeight) { drawH = pdfHeight; drawW = pdfHeight * imgAspect; }
    const offsetX = (pdfWidth - drawW) / 2;
    const offsetY = (pdfHeight - drawH) / 2;

    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'lageplan';

    console.log('[PDF] Step 3: saving');
    pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, drawW, drawH);
    pdf.save(`${sanitizedTitle}.pdf`);
    console.log('[PDF] Done');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[PDF] Export failed:', error);
    alert(`PDF Export fehlgeschlagen:\n${msg}`);
  }
}

export async function exportTablePDF(params: TablePDFParams): Promise<void> {
  const { title, stations } = params;
  try {
    const autoTable = (await import('jspdf-autotable')).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createHyphenator = (await import('hyphen') as any).default ?? (await import('hyphen') as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dePatterns = ((await import('hyphen/patterns/de-1996')) as any).default ?? (await import('hyphen/patterns/de-1996'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hyphenate: (word: string) => string = createHyphenator(dePatterns);

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);

    const CELL_PADDING = 3;
    const preWrap = (rawText: string, colWidthMm: number): string => {
      const maxW = colWidthMm - CELL_PADDING * 2;
      if (!rawText) return '';
      const measure = (s: string) => pdf.getTextWidth(s);
      const hyphenW = measure('-');
      const lines: string[] = [];

      for (const paragraph of rawText.split('\n')) {
        let line = '';
        let lineW = 0;

        for (const word of paragraph.split(' ')) {
          if (!word) continue;
          const wordW = measure(word);
          const sep = line ? measure(' ') : 0;

          if (lineW + sep + wordW <= maxW) {
            line = line ? line + ' ' + word : word;
            lineW += sep + wordW;
          } else {
            if (line) { lines.push(line); line = ''; lineW = 0; }
            const parts = hyphenate(word).split('­');
            let chunk = '';
            let chunkW = 0;
            for (const part of parts) {
              const partW = measure(part);
              if (!chunk) {
                chunk = part; chunkW = partW;
              } else if (chunkW + partW + hyphenW <= maxW) {
                chunk += part; chunkW += partW;
              } else {
                lines.push(chunk + '-');
                chunk = part; chunkW = partW;
              }
            }
            line = chunk; lineW = chunkW;
          }
        }
        if (line) lines.push(line);
      }

      return lines.join('\n');
    };

    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tabelle';

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

    const W = { nr: 12, station: 30, desc: 65, mat: 72, imp: 40, setup: 20, cond: 20, stamp: 10 };

    autoTable(pdf, {
      startY: 27,
      head: [['Nr.', 'Station', 'Beschreibung', 'Material', 'Gesprächsimpulse', 'Aufbau', 'Durchführung', 'Stempelfeld']],
      body: stations.map(s => [
        s.number,
        preWrap(s.name, W.station),
        preWrap(s.description || '', W.desc),
        preWrap(s.material || '', W.mat),
        (s.impulses || []).map(imp => preWrap(imp, W.imp)).join('\n'),
        preWrap(s.setupBy || '', W.setup),
        preWrap(s.conductedBy || '', W.cond),
        s.isFilled ? '✓' : '',
      ]),
      styles: { fontSize: 8, cellPadding: CELL_PADDING, overflow: 'linebreak' },
      headStyles: { fillColor: [107, 191, 212], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: W.nr },
        1: { cellWidth: W.station },
        2: { cellWidth: W.desc },
        3: { cellWidth: W.mat },
        4: { cellWidth: W.imp },
        5: { cellWidth: W.setup },
        6: { cellWidth: W.cond },
        7: { cellWidth: W.stamp, halign: 'center' },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    pdf.save(`${sanitizedTitle}-tabelle.pdf`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[PDF Table] Export failed:', error);
    alert(`Tabellen-PDF Export fehlgeschlagen:\n${msg}`);
  }
}
