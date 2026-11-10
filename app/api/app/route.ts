import { ApiError, acceptInvite, apiError, command, identity, readState, requireActor, sameOrigin } from '@/lib/server';
export async function GET(){try{return Response.json(await readState(await requireActor()),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}}
export async function POST(request:Request){try{
  sameOrigin(request);
  if(Number(request.headers.get('content-length'))>200000) return Response.json({error:'Požadavek je příliš velký.'},{status:413});
  const raw=await request.text();
  if(raw.length>200000)throw new ApiError(413,'Požadavek je příliš velký.');
  let body:{action:string;payload:Record<string,unknown>};
  try {const parsed=JSON.parse(raw);if(!parsed||typeof parsed.action!=='string'||!parsed.payload||typeof parsed.payload!=='object'||Array.isArray(parsed.payload))throw new Error();body=parsed;}catch{throw new ApiError(400,'Neplatný požadavek. Obnovte aplikaci a zkuste znovu.');}
  const result=body.action==='acceptInvite'?await acceptInvite(await identity(),body.payload?.token):await command(await requireActor(),body.action,body.payload);
  return Response.json({ok:true,...result},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
