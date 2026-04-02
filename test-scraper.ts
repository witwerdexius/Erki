import { scrapeJugendarbeit } from './lib/scraper';

async function test() {
    try {
        const url = 'https://www.jugendarbeit.online/dpf_einheit/freundschaft-2/';
        console.log('Testing scraper with URL:', url);
        const result = await scrapeJugendarbeit(url);
        console.dir(result, { depth: null });
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
