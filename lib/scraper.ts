import * as cheerio from 'cheerio';
import { Station } from './types';

export async function scrapeJugendarbeit(url: string): Promise<{ title: string; stations: Station[] }> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        if (!response.ok) throw new Error('Failed to fetch URL: ' + response.statusText);
        const html = await response.text();
        const $ = cheerio.load(html);

        const title = $('h1').first().text().trim() || 'Unbenannter Plan';
        const stations: Station[] = [];

        // Find the section that contains "Aktiv-Zeit"
        let aktivZeitContainer = $('h2:contains("Aktiv-Zeit")').parent();

        // If not found, try a broader search
        if (aktivZeitContainer.length === 0) {
            aktivZeitContainer = $('body');
        }

        // Look for station patterns like "Station 1: …" or "Station 1 – …"
        const stationElements = $("h1, h2, h3, h4, h5, h6").filter((_, el) => {
            const text = $(el).text().trim();
            return /^Station\s+\d+/i.test(text) || /^Station\s*:/i.test(text);
        });

        stationElements.each((i, el) => {
            const $el = $(el);
            const fullText = $el.text().trim();
            const numberMatch = fullText.match(/Station\s+(\d+)/i);
            const number = numberMatch ? numberMatch[1] : (i + 1).toString();
            // Strip "Station N" plus any following separator character(s)
            const name = fullText.replace(/^Station\s+\d+[\s:–—.-]*/i, '').replace(/^Station\s*:\s*/i, '').trim();

            let material = '';
            let instructions = '';
            const impulses: string[] = [];
            let activeSection: 'material' | 'instructions' | 'impulses' | null = null;

            const isFotoCredit = (t: string) => /^Foto:/i.test(t.trim());

            // Convert <br> to newlines and strip noise — preserves label boundaries within one element
            const cleanText = (el: ReturnType<typeof $>) => {
                const clone = el.clone();
                clone.find('a').remove();
                clone.find('figure, figcaption, img').remove();
                clone.find('br').replaceWith('\n');
                const txt = clone.text().trim();
                return txt.split('\n').filter(l => !isFotoCredit(l.trim())).join('\n').trim();
            };

            // Process one line through the label state machine
            const processLine = (line: string) => {
                const t = line.trim();
                if (!t) return;
                if (/^Material:?\s*/i.test(t) && !/^Materialart:/i.test(t)) {
                    activeSection = 'material';
                    const rest = t.replace(/^Material:?\s*/i, '').trim();
                    if (rest) material += (material ? '\n' : '') + rest;
                } else if (/^(?:Stations)?[Bb]eschreibung:?\s*/i.test(t)) {
                    activeSection = 'instructions';
                    const rest = t.replace(/^(?:Stations)?[Bb]eschreibung:?\s*/i, '').trim();
                    if (rest) instructions += (instructions ? '\n' : '') + rest;
                } else if (/^Gesprächsimpuls[e]?:?\s*/i.test(t) || /^Impuls[e]?:?\s*/i.test(t)) {
                    activeSection = 'impulses';
                    const rest = t.replace(/^Gesprächsimpuls[e]?:?\s*|^Impuls[e]?:?\s*/i, '').trim();
                    if (rest) impulses.push(rest);
                } else if (/^(?:Vorbemerkung|Bastelanleitung|Liedvorschläge|Vorüberlegung)/i.test(t)) {
                    activeSection = null;
                } else if (activeSection === 'material') {
                    material += (material ? '\n' : '') + t;
                } else if (activeSection === 'instructions') {
                    instructions += (instructions ? '\n' : '') + t;
                } else if (activeSection === 'impulses') {
                    impulses.push(t);
                }
            };

            let next = $el.next();
            while (next.length) {
                // Higher-level headings always end the station
                if (next.is('h1, h2, h3, h4')) break;
                // h5/h6: stop at peer stations or major sections (WILLKOMMENS-ZEIT etc.),
                // but traverse sub-headings (Variante N, …) with a section reset
                if (next.is('h5, h6')) {
                    const t = next.text().trim();
                    if (/^Station[\s:]/i.test(t) || /ZEIT$/i.test(t)) break;
                    activeSection = null;
                    next = next.next();
                    continue;
                }

                if (next.is('ul, ol')) {
                    // List items: add each to active section
                    next.find('li').each((_, li) => {
                        const t = $(li).text().trim();
                        if (!t) return;
                        if (activeSection === 'material') material += (material ? '\n' : '') + t;
                        else if (activeSection === 'instructions') instructions += (instructions ? '\n' : '') + t;
                        else if (activeSection === 'impulses') impulses.push(t);
                    });
                } else {
                    // For all other elements: convert <br>→\n, then process line by line
                    // This correctly splits labels and content even within a single <p>
                    const cleaned = cleanText(next);
                    for (const line of cleaned.split('\n')) {
                        processLine(line);
                    }
                }

                next = next.next();
            }

            // Distribute bubbles along the perimeter
            const side = i % 4; // 0: Top, 1: Right, 2: Bottom, 3: Left
            const step = Math.floor(i / 4) * 15;
            let x = 5, y = 5;

            if (side === 0) { x = 10 + step; y = 5; }
            else if (side === 1) { x = 95; y = 10 + step; }
            else if (side === 2) { x = 90 - step; y = 95; }
            else if (side === 3) { x = 5; y = 90 - step; }

            // Spread markers in a central grid
            const targetX = 40 + (i % 3) * 10;
            const targetY = 40 + Math.floor(i / 3) * 10;

            stations.push({
                id: crypto.randomUUID(),
                number,
                name: name || `Station ${i + 1}`,
                description: instructions,
                material,
                instructions,
                impulses,
                setupBy: '',
                conductedBy: '',
                x,
                y,
                targetX,
                targetY,
                colorVariant: i % 4, // Round-Robin
            });
        });

        return { title, stations };
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    }
}
