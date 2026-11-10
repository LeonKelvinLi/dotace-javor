import { ApiError, apiError, requireActor } from '@/lib/server';
export async function GET(request:Request){
  try{
    const ctx=await requireActor();if(ctx.member.role!=='federation')throw new ApiError(403,'Vyhledat organizaci může pouze SFJ.');
    const ico=new URL(request.url).searchParams.get('ico');if(!ico||!/^\d{8}$/.test(ico))throw new ApiError(400,'IČO musí mít 8 číslic.');
    let response:Response;
    try{response=await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});}catch{throw new ApiError(502,'ARES není dostupný. Organizaci můžete vyplnit ručně.');}
    if(response.status===404)throw new ApiError(404,'IČO nebylo v ARES nalezeno. Zkontrolujte jej nebo údaje vyplňte ručně.');
    if(!response.ok)throw new ApiError(502,'ARES nyní neodpovídá. Zkuste později nebo vyplňte ručně.');
    const data=await response.json() as {ico:string;obchodniJmeno:string;sidlo?:{textovaAdresa?:string}};
    if(!data.obchodniJmeno)throw new ApiError(502,'ARES nevrátil úplný záznam. Použijte ruční zadání.');
    return Response.json({fields:{name:data.obchodniJmeno,ico:data.ico,address:data.sidlo?.textovaAdresa??''},source:'ARES · Ministerstvo financí ČR',retrievedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, max-age=300'}});
  }catch(e){return apiError(e);}
}
