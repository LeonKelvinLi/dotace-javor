import { ApiError, apiError, authorizeFile, requireActor, sameOrigin, saveFile } from '@/lib/server';
import type { StoredFile } from '@/lib/model';
export async function GET(request:Request){try{
  const ctx=await requireActor();const key=new URL(request.url).searchParams.get('id');if(!key)throw new ApiError(400,'Chybí identifikátor souboru.');
  const result=await authorizeFile(ctx,key);const object=await ctx.bucket.get(result.key);if(!object)throw new ApiError(404,'Obsah souboru není dostupný. Kontaktujte správce úložiště.');
  return new Response(object.body,{headers:{'Content-Type':result.file.type,'Content-Length':String(result.file.size),'Content-Disposition':`inline; filename="${result.file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(result.file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'",'Referrer-Policy':'no-referrer'}});
}catch(error){return apiError(error);}}
export async function POST(request:Request){try{
  sameOrigin(request);if(Number(request.headers.get('content-length'))>11*1024*1024)throw new ApiError(413,'Soubor je příliš velký. Nejvýše 10 MB.');
  const ctx=await requireActor();const body=await request.formData();const file=body.get('file');const contractId=body.get('contractId');const kind=body.get('kind');
  if(!(file instanceof File)||typeof contractId!=='string'||!['receipt','contract','instructions','decision','amendment'].includes(String(kind)))throw new ApiError(400,'Vyberte soubor, smlouvu a typ dokumentu.');
  return Response.json({file:await saveFile(ctx,contractId,kind as StoredFile['kind'],file)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
