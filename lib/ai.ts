import { env } from 'cloudflare:workers';
import { ApiError, type ServerContext } from './server';
export const aiConfigured = () => Boolean(env.OPENAI_API_KEY);
type Content = { type: string; [key: string]: unknown };
export function documentInput(bytes: ArrayBuffer, type: string, name: string): Content {
  const data = Buffer.from(bytes).toString('base64');
  if (type === 'application/pdf') return { type: 'input_file', filename: name, file_data: `data:application/pdf;base64,${data}` };
  return { type: 'input_image', image_url: `data:${type};base64,${data}`, detail: 'high' };
}
export async function callAI(ctx: ServerContext, instructions: string, content: Content[], schema?: Record<string, unknown>): Promise<string> {
  if (!env.OPENAI_API_KEY) throw new ApiError(503, 'AI není připojené. Použijte čtení OCR nebo kontaktujte správce.');
  // Durable limit: simultaneous requests cannot bypass the check in one D1 statement.
  const event = { id: `event-${crypto.randomUUID()}`, at: new Date().toISOString(), actor: ctx.user.email, organizationId: ctx.member.organizationId, contractId: '', itemId: '', action: 'assistant.request', detail: 'Požadavek na AI; dokumenty ani odpověď se do historie neukládají.' };
  const count = await ctx.db.prepare("INSERT INTO audit (id,organization_id,contract_id,item_id,data) SELECT ?,?,'','',? WHERE (SELECT COUNT(*) FROM audit WHERE json_extract(data,'$.action')='assistant.request' AND json_extract(data,'$.actor')=? AND json_extract(data,'$.at')>?)<30").bind(event.id,event.organizationId,JSON.stringify(event),ctx.user.email,new Date(Date.now()-3600000).toISOString()).run();
  if (!count.meta.changes) throw new ApiError(429, 'Bylo dosaženo 30 AI požadavků za hodinu. Zkuste to později; ruční práce a OCR zůstávají dostupné.');
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-5.4-mini', instructions, input: [{ role: 'user', content }], store: false, max_output_tokens: schema ? 3000 : 2200, reasoning: { effort: 'low' }, ...(schema ? { text: { format: { type: 'json_schema', name: 'document_fields', strict: true, schema } } } : {}) }),
      signal: AbortSignal.timeout(60000),
    });
  } catch { throw new ApiError(504, 'AI neodpovědělo včas. Zkuste znovu nebo použijte OCR a ruční zadání.'); }
  if (!response.ok) {
    const status = response.status;
    // Provider error bodies can contain submitted material. Never log or forward them.
    throw new ApiError(status === 429 ? 429 : 502, status === 429 ? 'AI má vyčerpanou kvótu nebo je přetížené. Zkontrolujte kredit projektu a zkuste později.' : 'AI služba požadavek nepřijala. Správce musí zkontrolovat API klíč a nastavený model.');
  }
  const body = await response.json() as { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
  const text = body.output?.flatMap(o => o.content ?? []).filter(c => c.type === 'output_text').map(c => c.text ?? '').join('\n').trim();
  if (!text || body.status === 'incomplete') throw new ApiError(502, 'AI nedokončilo odpověď. Zkuste kratší dokument nebo přesnější dotaz.');
  return text;
}
