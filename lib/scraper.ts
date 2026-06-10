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

            // Remove link text, photo credits and image elements from a cheerio element
            const cleanText = (el: ReturnType<typeof $>) => {
                const clone = el.clone();
                clone.find('a').remove();
                clone.find('figure, figcaption, img').remove();
                const txt = clone.text().trim();
                return txt.split('\n').filter(l => !isFotoCredit(l)).join('\n').trim();
            };

            const afterLabel = (text: string, label: RegExp) => text.replace(label, '').trim();

            let next = $el.next();
            while (next.length && !next.is('h1, h2, h3, h4, h5, h6')) {
                const text = next.text().trim();
                const cleaned = cleanText(next);

                if (!text || isFotoCredit(text)) { next = next.next(); continue; }

                // Detect section labels (colon optional, must start the text)
                if (/^Material:?\s*/i.test(text) && !/^Materialart:/i.test(text)) {
                    activeSection = 'material';
                    const inline = afterLabel(cleaned, /^Material:?\s*/i);
                    if (inline) material = inline;
                    next = next.next(); continue;
                }
                if (/^(?:Stations)?[Bb]eschreibung:?\s*/i.test(text)) {
                    activeSection = 'instructions';
                    const inline = afterLabel(cleaned, /^(?:Stations)?[Bb]eschreibung:?\s*/i);
                    if (inline) instructions = inline;
                    next = next.next(); continue;
                }
                if (/^Bastelanleitung:?\s*/i.test(text)) {
                    activeSection = null;
                    next = next.next(); continue;
                }
                if (/^Gesprächsimpuls[e]?:?\s*/i.test(text) || /^Impuls[e]?:?\s*/i.test(text)) {
                    activeSection = 'impulses';
                    const inline = afterLabel(cleaned, /^Gesprächsimpuls[e]?:?\s*|^Impuls[e]?:?\s*/i);
                    if (inline) impulses.push(inline);
                    next = next.next(); continue;
                }
                // Skip preamble/meta sections that aren't station content
                if (/^Vorbemerkung/i.test(text) || /^Vorüberlegung/i.test(text) || /^Liedvorschläge/i.test(text)) {
                    activeSection = null;
                    next = next.next(); continue;
                }

                // Accumulate content into active section
                if (activeSection === 'material') {
                    if (next.is('ul, ol')) {
                        const items: string[] = [];
                        next.find('li').each((_, li) => { const t = $(li).text().trim(); if (t) items.push(t); });
                        if (items.length) material += (material ? '\n' : '') + items.map(t => '• ' + t).join('\n');
                    } else if (cleaned) {
                        material += (material ? '\n' : '') + cleaned;
                    }
                } else if (activeSection === 'instructions') {
                    if (next.is('ul, ol')) {
                        const items: string[] = [];
                        next.find('li').each((_, li) => { const t = $(li).text().trim(); if (t) items.push(t); });
                        if (items.length) instructions += (instructions ? '\n' : '') + items.join('\n');
                    } else if (cleaned) {
                        instructions += (instructions ? '\n' : '') + cleaned;
                    }
                } else if (activeSection === 'impulses') {
                    if (next.is('ul, ol')) {
                        next.find('li').each((_, li) => { const t = $(li).text().trim(); if (t) impulses.push(t); });
                    } else if (cleaned) {
                        impulses.push(cleaned);
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
