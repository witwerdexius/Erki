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

        // Look for station patterns like "#### Station 1: ..."
        // In actual HTML these are usually h4 or similar
        const stationElements = $("h1, h2, h3, h4, h5, h6").filter((_, el) => {
            const text = $(el).text();
            return /Station \d+:/i.test(text);
        });

        stationElements.each((i, el) => {
            const $el = $(el);
            const fullText = $el.text().trim();
            const numberMatch = fullText.match(/Station (\d+):/i);
            const number = numberMatch ? numberMatch[1] : (i + 1).toString();
            const name = fullText.replace(/Station \d+:/i, '').trim();

            let material = '';
            let instructions = '';
            const impulses: string[] = [];

            const isFotoCredit = (t: string) => /^Foto:/i.test(t.trim());

            // Remove link text, photo credits and image elements from a cheerio element
            const cleanText = (el: ReturnType<typeof $>) => {
                const clone = el.clone();
                clone.find('a').remove();
                clone.find('figure, figcaption, img').remove();
                const txt = clone.text().trim();
                return txt.split('\n').filter(l => !isFotoCredit(l)).join('\n').trim();
            };

            // Helper: extract text after a label, stopping at the next known label
            const extractSection = (src: string, label: RegExp) => {
                const match = src.match(label);
                if (!match || match.index === undefined) return '';
                const after = src.slice(match.index + match[0].length);
                return after.split(/(?:Bastelanleitung:|Stationsbeschreibung:|Material:|Gesprächsimpulse:|Impulse:)/i)[0].trim();
            };

            let next = $el.next();
            let inBastelanleitung = false;
            let inGespraechsimpulse = false;
            while (next.length && !next.is('h1, h2, h3, h4, h5, h6')) {
                const text = next.text().trim();
                const cleanedText = cleanText(next);

                // Skip standalone photo credit elements
                if (isFotoCredit(text)) {
                    next = next.next();
                    continue;
                }

                // Elements may contain multiple sections – check for each label anywhere in the text
                if (/Material:/i.test(text) && !inBastelanleitung) {
                    inGespraechsimpulse = false;
                    material = extractSection(cleanedText, /Material:/i);
                }
                if (/Stationsbeschreibung:/i.test(text) && !inBastelanleitung) {
                    inGespraechsimpulse = false;
                    instructions = extractSection(cleanedText, /Stationsbeschreibung:/i);
                }
                if (/Bastelanleitung:/i.test(text)) {
                    inBastelanleitung = true;
                    inGespraechsimpulse = false;
                    next = next.next();
                    continue;
                }
                if (/(Gesprächsimpulse:|Impulse:)/i.test(text)) {
                    inBastelanleitung = false;
                    inGespraechsimpulse = true;
                    const inline = extractSection(cleanedText, /(Gesprächsimpulse:|Impulse:)/i);
                    if (inline) impulses.push(inline);
                    next = next.next();
                    continue;
                }

                if (inBastelanleitung) {
                    next = next.next();
                    continue;
                }

                if (inGespraechsimpulse) {
                    if (next.is('ul') || next.is('ol')) {
                        next.find('li').each((_, li) => {
                            const liText = $(li).text().trim();
                            if (liText) impulses.push(liText);
                        });
                    } else if (cleanedText && !/^Foto:/i.test(cleanedText)) {
                        impulses.push(cleanedText);
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
            });
        });

        return { title, stations };
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    }
}
