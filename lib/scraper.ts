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

            let next = $el.next();
            let inBastelanleitung = false;
            let inGespraechsimpulse = false;
            while (next.length && !next.is('h1, h2, h3, h4, h5, h6')) {
                const text = next.text().trim();

                // Detect section starts
                if (/^Bastelanleitung:/i.test(text)) {
                    inBastelanleitung = true;
                    inGespraechsimpulse = false;
                    next = next.next();
                    continue;
                }
                if (/^(Gesprächsimpulse:|Impulse:)/i.test(text)) {
                    inGespraechsimpulse = true;
                    inBastelanleitung = false;
                    // Inline text after the label on the same element
                    const inline = text.replace(/^(Gesprächsimpulse:|Impulse:)/i, '').trim();
                    if (inline) impulses.push(inline);
                    next = next.next();
                    continue;
                }
                if (/^(Material:|Stationsbeschreibung:)/i.test(text)) {
                    inBastelanleitung = false;
                    inGespraechsimpulse = false;
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
                    } else if (text) {
                        impulses.push(text);
                    }
                    next = next.next();
                    continue;
                }

                if (text.startsWith('Material:')) {
                    material = text.replace('Material:', '').trim();
                } else if (text.startsWith('Stationsbeschreibung:')) {
                    instructions = text.replace('Stationsbeschreibung:', '').trim();
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
                id: Math.random().toString(36).substr(2, 9),
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
