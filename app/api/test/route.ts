import { importPlanFromUrl } from '@/lib/actions';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url') || 'https://www.jugendarbeit.online/dpf_einheit/freundschaft-2/';
    const result = await importPlanFromUrl(url);
    return NextResponse.json(result);
}
