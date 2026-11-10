import { apiError, requireActor } from '@/lib/server';
import { aiConfigured } from '@/lib/ai';
export async function GET() { try { await requireActor(); return Response.json({ enabled: aiConfigured() }, { headers: { 'Cache-Control': 'no-store' } }); } catch(e) { return apiError(e); } }
