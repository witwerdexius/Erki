'use client';

import React, { useState, useEffect } from 'react';
import { Clipboard, Check, Upload, Download, FileText, Trash2 } from 'lucide-react';
import { Plan } from '@/lib/types';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface NachdenktextRow {
    station: string;
    ueberschrift: string;
    teil1: string;
    bibelzitat: string;
    teil2: string;
}

interface Props {
    activePlan: Plan | undefined;
    updateActivePlan: (updates: Partial<Plan>) => void;
}

const DEFAULT_INSTRUCTION_TEXT = `Erstelle Texte als csv (Spalten: Stationsnummer;Stationsname;Überschrift;Teil 1;Bibelzitat;Teil 2) wie diesen

„Mutig im Sturm

Manchmal kommt der Sturm ganz plötzlich.
Ein Moment – und alles gerät ins Wanken.
Pläne scheitern, Sicherheiten fallen, der Gegenwind wird stärker.

Und mittendrin: du.
Mitten im Sturm.
Mit einer Aufgabe, die eigentlich ganz einfach ist –
aber jetzt? Kaum zu bewältigen.

Was hilft dir, durchzuhalten?
Was gibt dir Halt, wenn alles unsicher ist?

In der Bibel wird erzählt, wie die Jünger mit dem Boot in einen Sturm geraten.
Sie kämpfen – gegen Wind und Wellen. Und dann – in ihrer Angst – kommt Jesus zu ihnen.

„Habt keine Angst. Ich bin es. Fürchtet euch nicht!"
(Matthäus 14,27)

Mut bedeutet nicht, keine Angst zu haben.
Mut bedeutet, der Angst nicht das letzte Wort zu lassen.
Mut bedeutet, Jesus im Sturm zu entdecken –
und ihm zuzutrauen, dass er mit dir geht. Auch wenn's stürmt."

zu folgenden Stationen:`;

export default function NachdenktexteTab({ activePlan, updateActivePlan }: Props) {
    const [instructionText, setInstructionText] = useState(DEFAULT_INSTRUCTION_TEXT);
    const [pasteText, setPasteText] = useState('');
    const [rows, setRows] = useState<NachdenktextRow[]>([]);
    const [copied, setCopied] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [templateName, setTemplateName] = useState<string | null>(null);
    const [vorlageDataUrl, setVorlageDataUrl] = useState<string | null>(null);

    // Fetch the default template once on mount, unconditionally
    useEffect(() => {
        fetch('/Vorlage.pdf')
            .then(res => (res.ok ? res.blob() : null))
            .then(blob => {
                if (!blob) return;
                const reader = new FileReader();
                reader.onload = ev => setVorlageDataUrl(ev.target?.result as string);
                reader.readAsDataURL(blob);
            })
            .catch(() => {});
    }, []);

    // Apply default template as soon as both plan and fetched data are available
    useEffect(() => {
        if (!activePlan || activePlan.nachdenk_template || !vorlageDataUrl) return;
        updateActivePlan({ nachdenk_template: vorlageDataUrl });
        setTemplateName('Vorlage.pdf');
    }, [activePlan?.id, vorlageDataUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    const generatePrompt = () => {
        const stationsText = (activePlan?.stations ?? [])
            .map((s, i) => `${i + 1}. ${s.name}: ${s.description}`)
            .join('\n');
        return `${instructionText}\n\nStationen:\n${stationsText}`;
    };

    const copyPrompt = async () => {
        await navigator.clipboard.writeText(generatePrompt());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const parseCSV = (text: string): NachdenktextRow[] =>
        text
            .trim()
            .split('\n')
            .filter(l => l.trim())
            .map(l => {
                const parts = l.split(';');
                // Support both 5-column (Station;Überschrift;Teil1;Bibel;Teil2)
                // and 6-column (Nummer;Station;Überschrift;Teil1;Bibel;Teil2) formats
                const o = parts.length >= 6 ? 1 : 0;
                return {
                    station: parts[o]?.trim() ?? '',
                    ueberschrift: parts[o + 1]?.trim() ?? '',
                    teil1: parts[o + 2]?.trim() ?? '',
                    bibelzitat: parts[o + 3]?.trim() ?? '',
                    teil2: parts[o + 4]?.trim() ?? '',
                };
            });

    const handlePasteImport = () => setRows(parseCSV(pasteText));

    const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => setRows(parseCSV(ev.target?.result as string));
        reader.readAsText(file, 'UTF-8');
        e.target.value = '';
    };

    const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setTemplateName(file.name);
        const reader = new FileReader();
        reader.onload = ev => updateActivePlan({ nachdenk_template: ev.target?.result as string });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const exportPDF = async () => {
        if (rows.length === 0) return;
        setIsExporting(true);
        try {
            const { PDFDocument, StandardFonts, rgb, PageSizes } = await import('pdf-lib');
            const doc = await PDFDocument.create();
            const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
            const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
            const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

            const [pageWidth, pageHeight] = PageSizes.A4;
            const mmToPt = (mm: number) => mm * 2.8346;
            const marginLR = mmToPt(30);
            const topOffset = mmToPt(55);
            const textWidth = pageWidth - 2 * marginLR;

            // Pre-embed template once
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let embeddedTemplate: any = null;
            if (activePlan?.nachdenk_template) {
                const base64 = activePlan.nachdenk_template.split(',')[1];
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const embedded = await doc.embedPdf(bytes);
                embeddedTemplate = embedded[0];
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const drawWrapped = (page: any, text: string, font: any, size: number, startY: number): number => {
                if (!text.trim()) return startY;
                // Normalize literal \n (two chars) and \r\n to real newlines
                const normalized = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
                const paragraphs = normalized.split('\n');
                let y = startY;
                for (const para of paragraphs) {
                    if (!para.trim()) {
                        y -= size * 0.8; // blank line gap
                        continue;
                    }
                    const words = para.split(/[ \t]+/);
                    let line = '';
                    for (const word of words) {
                        const test = line ? `${line} ${word}` : word;
                        if (font.widthOfTextAtSize(test, size) > textWidth && line) {
                            page.drawText(line, { x: marginLR, y, font, size, color: rgb(0, 0, 0) });
                            y -= size * 1.5;
                            line = word;
                        } else {
                            line = test;
                        }
                    }
                    if (line) {
                        page.drawText(line, { x: marginLR, y, font, size, color: rgb(0, 0, 0) });
                        y -= size * 1.5;
                    }
                }
                return y;
            };

            for (const row of rows) {
                // Page 1: Station title, centered
                const p1 = doc.addPage(PageSizes.A4);
                const titleSize = 48;
                const tw = fontBold.widthOfTextAtSize(row.station, titleSize);
                p1.drawText(row.station, {
                    x: Math.max(marginLR, (pageWidth - tw) / 2),
                    y: pageHeight / 2 - titleSize / 2,
                    font: fontBold,
                    size: titleSize,
                    color: rgb(0, 0, 0),
                });

                // Page 2: Template background + text overlay
                const p2 = doc.addPage(PageSizes.A4);
                if (embeddedTemplate) {
                    p2.drawPage(embeddedTemplate, { x: 0, y: 0, width: pageWidth, height: pageHeight });
                }
                let y = pageHeight - topOffset;
                y = drawWrapped(p2, row.ueberschrift, fontBold, 30, y);
                y -= 8;
                y = drawWrapped(p2, row.teil1, fontRegular, 20, y);
                y -= 8;
                y = drawWrapped(p2, row.bibelzitat, fontItalic, 20, y);
                y -= 8;
                drawWrapped(p2, row.teil2, fontRegular, 20, y);
            }

            const pdfBytes = await doc.save();
            const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${activePlan?.title ?? 'erki'}-nachdenk-texte.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 overflow-auto p-4 sm:p-8"
        >
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Step 1: Instruction text */}
                <section className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                    <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#9b8ec4]/20 text-[#6b5fa0] text-xs font-bold flex items-center justify-center shrink-0">1</span>
                        Instruktionstext
                    </h2>
                    <textarea
                        value={instructionText}
                        onChange={e => setInstructionText(e.target.value)}
                        placeholder="Schreibe hier den Instruktionstext für das KI-Prompt..."
                        className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-y min-h-[100px] focus:ring-2 focus:ring-[#9b8ec4]/30 focus:outline-none"
                    />
                </section>

                {/* Step 2: Prompt generator */}
                <section className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                    <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#9b8ec4]/20 text-[#6b5fa0] text-xs font-bold flex items-center justify-center shrink-0">2</span>
                        Prompt generieren
                    </h2>
                    <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600 font-mono whitespace-pre-wrap max-h-48 overflow-auto border border-gray-200 mb-3">
                        {generatePrompt().trim() ? (
                            generatePrompt()
                        ) : (
                            <span className="text-gray-500 italic">Instruktionstext eingeben und Stationen importieren...</span>
                        )}
                    </div>
                    <button
                        onClick={copyPrompt}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95',
                            copied ? 'bg-[#7bc9a0] text-white' : 'bg-[#9b8ec4] text-white hover:bg-[#8a7db8]'
                        )}
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                        {copied ? 'Kopiert!' : 'In Zwischenablage kopieren'}
                    </button>
                </section>

                {/* Step 3: Import result */}
                <section className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                    <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
                        <span className="w-6 h-6 rounded-full bg-[#9b8ec4]/20 text-[#6b5fa0] text-xs font-bold flex items-center justify-center shrink-0">3</span>
                        Ergebnis importieren
                        <span className="text-xs font-normal text-gray-500">Station;Überschrift;Teil 1;Bibelzitat;Teil 2</span>
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Einfügen (Paste)</label>
                            <textarea
                                value={pasteText}
                                onChange={e => setPasteText(e.target.value)}
                                placeholder={'Station 1;Überschrift;Teil eins Text;Bibelzitat;Teil zwei Text'}
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm font-mono resize-y min-h-[80px] focus:ring-2 focus:ring-[#9b8ec4]/30 focus:outline-none"
                            />
                            <button
                                onClick={handlePasteImport}
                                className="mt-2 px-4 py-2 bg-[#9b8ec4] text-white rounded-full text-sm font-medium hover:bg-[#8a7db8] transition-all active:scale-95"
                            >
                                Importieren
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-xs text-gray-500">oder</span>
                            <div className="flex-1 h-px bg-gray-200" />
                        </div>
                        <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full cursor-pointer hover:bg-gray-50 transition-all w-fit text-sm font-medium text-gray-700">
                            <Upload className="w-4 h-4 text-[#6bbfd4]" />
                            CSV-Datei hochladen (.csv)
                            <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVFile} />
                        </label>
                    </div>
                </section>

                {/* Step 4: Preview */}
                {rows.length > 0 && (
                    <section className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                        <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#9b8ec4]/20 text-[#6b5fa0] text-xs font-bold flex items-center justify-center shrink-0">4</span>
                            Vorschau
                            <span className="text-xs font-normal text-gray-500">({rows.length} {rows.length === 1 ? 'Eintrag' : 'Einträge'})</span>
                            <button
                                onClick={() => setRows([])}
                                className="ml-auto text-gray-500 hover:text-red-500 transition-colors"
                                title="Alle löschen"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </h2>
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                            <table className="w-full text-sm border-collapse min-w-[700px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b">
                                        {['Station', 'Überschrift', 'Teil 1', 'Bibelzitat', 'Teil 2'].map(h => (
                                            <th key={h} className="p-3 text-left text-xs font-bold uppercase text-gray-600 tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {rows.map((r, i) => (
                                        <tr key={i} className="hover:bg-gray-50/50">
                                            <td className="p-3 font-medium text-[#6bbfd4] whitespace-nowrap">{r.station}</td>
                                            <td className="p-3 font-semibold max-w-[160px] truncate">{r.ueberschrift}</td>
                                            <td className="p-3 text-gray-600 max-w-[160px] truncate">{r.teil1}</td>
                                            <td className="p-3 text-gray-500 italic max-w-[160px] truncate">{r.bibelzitat}</td>
                                            <td className="p-3 text-gray-600 max-w-[160px] truncate">{r.teil2}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* Step 5: Template upload + PDF export */}
                <section className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                    <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#9b8ec4]/20 text-[#6b5fa0] text-xs font-bold flex items-center justify-center shrink-0">5</span>
                        Vorlage &amp; PDF-Export
                    </h2>
                    <div className="flex flex-wrap items-center gap-3">
                        <label
                            className={cn(
                                'flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer transition-all text-sm font-medium border',
                                activePlan?.nachdenk_template
                                    ? 'bg-[#7bc9a0]/15 border-[#7bc9a0]/40 text-[#2d7a52] hover:bg-[#7bc9a0]/25'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            )}
                        >
                            <FileText className="w-4 h-4 shrink-0" />
                            {activePlan?.nachdenk_template
                                ? `${templateName ?? 'Vorlage hochgeladen'} ✓`
                                : 'vorlage.pdf hochladen'}
                            <input type="file" accept=".pdf" className="hidden" onChange={handleTemplateUpload} />
                        </label>
                        {activePlan?.nachdenk_template && (
                            <button
                                onClick={() => updateActivePlan({ nachdenk_template: undefined })}
                                className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                            >
                                Vorlage entfernen
                            </button>
                        )}
                        <button
                            onClick={exportPDF}
                            disabled={rows.length === 0 || isExporting}
                            className="flex items-center gap-2 px-4 py-2 bg-[#6bbfd4] text-white rounded-full text-sm font-medium hover:bg-[#5aaec3] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download className="w-4 h-4" />
                            {isExporting
                                ? 'Exportiere...'
                                : `PDF exportieren${rows.length > 0 ? ` (${rows.length} × 2 Seiten)` : ''}`}
                        </button>
                    </div>
                </section>
            </div>
        </motion.div>
    );
}
