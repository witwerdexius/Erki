'use server';

import { scrapeJugendarbeit } from './scraper';

export async function importPlanFromUrl(url: string) {
    try {
        const data = await scrapeJugendarbeit(url);
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
