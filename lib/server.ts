import { env } from 'cloudflare:workers';
import { getChatGPTUser, type ChatGPTUser } from '@/app/chatgpt-auth';
import type { AppState, AuditEvent, Contract, Feedback, Item, Membership, Organization, StoredFile } from './model';
import { cents, findings, submissionErrors } from './model';
import { digest, seedDemo } from './seed';
import { duplicateReceipt } from './autofill';

export class ApiError extends Error {
  constructor(public status:number,message:string,public details:string[]=[]){super(message);}
}
export function apiError(error:unknown):Response {
  if(error instanceof ApiError)return Response.json({error:error.message,details:error.details},{status:error.status,headers:{'Cache-Control':'no-store'}});
  console.error('Dotace API failure', error instanceof Error?error.message:error);
  return Response.json({error:'Operaci se nepodařilo uložit. Zkuste ji znovu; pokud problém trvá, obraťte se na správce.',details:[]},{status:500,headers:{'Cache-Control':'no-store'}});
}
export function sameOrigin(request:Request){
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)throw new ApiError(403,'Požadavek musí pocházet z této aplikace.');
}
export type ServerContext={db:D1Database;bucket:R2Bucket;user:ChatGPTUser;member:Membership};
type IdentityContext=Omit<ServerContext,'member'>&{member:Membership|null};
export const id = (prefix:string) => `${prefix}-${crypto.randomUUID()}`;
const json = (v:unknown)=>JSON.stringify(v);
const now=()=>new Date().toISOString();
function text(value:unknown,label:string,max=4000,required=false):string{
  if(typeof value!=='string' || value.length>max || (required&&!value.trim()))throw new ApiError(400,`${label}: zadejte ${required?'neprázdný ':''}text do ${max} znaků.`);
  return value.trim();
}
function money(value:unknown,label:string):number{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1_000_000_000||Math.abs(value*100-Math.round(value*100))>0.00001)throw new ApiError(400,`${label}: zadejte nezápornou částku nejvýše se dvěma desetinnými místy.`);
  return Math.round(value*100)/100;
}
function date(value:unknown,label:string,empty=false):string{
  if(empty&&value==='')return '';
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)throw new ApiError(400,`${label}: zadejte platné datum.`);
  return value;
}
function choice<T extends string>(value:unknown,values:readonly T[],label:string):T{
  if(!values.includes(value as T))throw new ApiError(400,`${label}: vyberte platnou možnost.`);return value as T;
}
function version(value:unknown):number{
  if(!Number.isSafeInteger(value)||Number(value)<1)throw new ApiError(409,'Záznam nemá platnou verzi. Obnovte stránku a zkuste znovu.');return value as number;
}
function record(payload:unknown):Record<string,unknown>{
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new ApiError(400,'Chybí údaje požadavku.');return payload as Record<string,unknown>;
}
async function all<T>(db:D1Database,table:string,where='',values:unknown[]=[]):Promise<T[]>{
  const result=await db.prepare(`SELECT data FROM ${table} ${where}`).bind(...values).all<{data:string}>();return result.results.map(r=>JSON.parse(r.data) as T);
}
async function one<T>(db:D1Database,table:string,key:string):Promise<T|null>{
  const row=await db.prepare(`SELECT data FROM ${table} WHERE id=?`).bind(key).first<{data:string}>();return row?JSON.parse(row.data) as T:null;
}
export async function identity():Promise<IdentityContext>{
  const user=await getChatGPTUser();if(!user)throw new ApiError(401,'Přihlaste se účtem ChatGPT.');
  if(!env.DB||!env.BUCKET)throw new ApiError(503,'Databáze nebo úložiště není připojené. Správce musí povolit vazby DB a BUCKET.');
  const db=env.DB,bucket=env.BUCKET;
  const member:Membership={id:id('member'),userId:user.userId,email:user.email.toLowerCase(),name:user.displayName,role:'federation',organizationId:''};
  // The Sites deployment is owner-private. A singleton lock elects exactly one
  // owner even when two first requests arrive together; later users need invites.
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO bootstrap (id,owner_id,seeded) VALUES ('owner',?,0)").bind(user.userId),
    db.prepare("INSERT OR IGNORE INTO memberships (id,user_id,organization_id,role,email,data) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bootstrap WHERE id='owner' AND owner_id=?)").bind(member.id,member.userId,'',member.role,member.email,json(member),user.userId),
  ]);
  const row=await db.prepare('SELECT data FROM memberships WHERE user_id=?').bind(user.userId).first<{data:string}>();
  const current=row?JSON.parse(row.data) as Membership:null;
  if(current?.role==='federation')await seedDemo(db,bucket);
  return {db,bucket,user,member:current};
}
export async function requireActor():Promise<ServerContext>{
  const ctx=await identity();if(!ctx.member)throw new ApiError(403,'K této aplikaci nemáte přístup. Požádejte SFJ o pozvánku a otevřete její odkaz po přihlášení.');return ctx as ServerContext;
}
function scope(ctx:ServerContext,organizationId:string){if(ctx.member.role!=='federation'&&ctx.member.organizationId!==organizationId)throw new ApiError(403,'K této organizaci nemáte přístup.');}
function federation(ctx:ServerContext){if(ctx.member.role!=='federation')throw new ApiError(403,'Tuto operaci může provést pouze SFJ.');}
function manager(ctx:ServerContext,organizationId:string){scope(ctx,organizationId);if(ctx.member.role==='member')throw new ApiError(403,'Tuto operaci může provést pouze hlavní administrátor nebo SFJ.');}
export async function getContract(ctx:ServerContext,key:string):Promise<Contract>{const c=await one<Contract>(ctx.db,'contracts',key);if(!c)throw new ApiError(404,'Smlouva nebyla nalezena.');scope(ctx,c.organizationId);return c;}
async function getItem(ctx:ServerContext,key:string){const i=await one<Item>(ctx.db,'items',key);if(!i)throw new ApiError(404,'Doklad nebyl nalezen.');const c=await getContract(ctx,i.contractId);return {item:i,contract:c};}
function auditStatement(ctx:ServerContext,action:string,detail:string,organizationId='',contractId='',itemId='',conditional=false):D1PreparedStatement{
  const event:AuditEvent={id:id('event'),at:now(),actor:ctx.user.displayName||ctx.user.email,organizationId,contractId,itemId,action,detail};
  return ctx.db.prepare(`INSERT INTO audit (id,organization_id,contract_id,item_id,data) SELECT ?,?,?,?,? ${conditional?'WHERE changes()>0':''}`).bind(event.id,organizationId,contractId,itemId,json(event));
}
async function mutate(ctx:ServerContext,statement:D1PreparedStatement,audit:D1PreparedStatement){
  const result=await ctx.db.batch([statement,audit]);if(!result[0].meta.changes)throw new ApiError(409,'Záznam mezitím změnil jiný uživatel nebo už není otevřený k úpravám. Obnovte stránku; zkontrolujte aktuální stav a změnu zopakujte.');
}
async function validateFiles(ctx:ServerContext,fileIds:unknown,contract:Contract):Promise<string[]>{
  if(!Array.isArray(fileIds)||fileIds.length>50||fileIds.some(v=>typeof v!=='string'))throw new ApiError(400,'Neplatný seznam příloh (nejvýše 50 souborů).');
  const unique=[...new Set(fileIds)] as string[];
  for(const key of unique){const f=await one<StoredFile>(ctx.db,'files',key);if(!f||f.contractId!==contract.id||f.organizationId!==contract.organizationId||f.kind!=='receipt')throw new ApiError(400,'Příloha dokladu musí být skutečně nahraná k této smlouvě jako doklad.');}
  return unique;
}
export async function readState(ctx:ServerContext):Promise<AppState>{
  const own=ctx.member.role!=='federation';const where=own?'WHERE organization_id=?':'';const params=own?[ctx.member.organizationId]:[];
  const [organizations,contracts,items,files,audit,members,feedback]=await Promise.all([
    own?all<Organization>(ctx.db,'organizations','WHERE id=?',params):all<Organization>(ctx.db,'organizations'),
    all<Contract>(ctx.db,'contracts',where,params),all<Item>(ctx.db,'items',where,params),all<StoredFile>(ctx.db,'files',where,params),all<AuditEvent>(ctx.db,'audit',where,params),all<Membership>(ctx.db,'memberships',where,params),all<Feedback>(ctx.db,'feedback',where,params),
  ]);
  audit.sort((a,b)=>b.at.localeCompare(a.at));feedback.sort((a,b)=>b.at.localeCompare(a.at));
  return {user:{userId:ctx.user.userId,email:ctx.user.email,displayName:ctx.user.displayName},membership:ctx.member,organizations,contracts,items,files,audit,members,feedback,capabilities:{extraction:env.OPENAI_API_KEY?'AI + PDF text + OCR v prohlížeči':'PDF text + OCR v prohlížeči',adviser:env.OPENAI_API_KEY?'AI rádce se zdroji':'Průvodce podklady · bez jazykového modelu'}};
}
// Compare every item version at submission/approval so a concurrent edit cannot
// slip between validation and the state transition. D1 batch is transactional.
function snapshotGuard(items:Item[]):{sql:string;values:unknown[]}{
  return {sql:' AND (SELECT COUNT(*) FROM items WHERE contract_id=?)=? AND NOT EXISTS (SELECT 1 FROM items i WHERE i.contract_id=? AND NOT EXISTS (SELECT 1 FROM json_each(?) e WHERE json_extract(e.value,\'$.id\')=i.id AND json_extract(e.value,\'$.version\')=i.version))',values:[items[0]?.contractId||'',items.length,items[0]?.contractId||'',json(items.map(i=>({id:i.id,version:i.version})))]};
}
async function saveContractState(ctx:ServerContext,c:Contract,previous:Contract,action:string,detail:string,items?:Item[]){
  const guard=items?snapshotGuard(items):{sql:'',values:[]};if(items&&!items.length)guard.values=[c.id,0,c.id,'[]'];
  await mutate(ctx,ctx.db.prepare(`UPDATE contracts SET data=?,status=?,version=?,amount_cents=? WHERE id=? AND version=? AND status=?${guard.sql}`).bind(json(c),c.status,c.version,cents(c.amount),c.id,previous.version,previous.status,...guard.values),auditStatement(ctx,action,detail,c.organizationId,c.id,'',true));
}

export async function command(ctx:ServerContext,action:string,raw:unknown):Promise<Record<string,unknown>>{
  const p=record(raw);
  if(action==='saveOrganization'){
    const source=record(p.organization??p);const key=typeof source.id==='string'?source.id:'';const old=key?await one<Organization>(ctx.db,'organizations',key):null;
    if(old)manager(ctx,old.id);else federation(ctx);
    const m={...(old||{}),...source};
    const representatives=Array.isArray(m.representatives)?m.representatives.map(v=>text(v,'Statutární zástupce',200,true)):[];
    if(representatives.length>5)throw new ApiError(400,'Zadejte nejvýše pět statutárních zástupců.');
    const o:Organization={id:old?.id||id('org'),name:text(m.name,'Název organizace',250,true),ico:text(m.ico,'IČO',8,true),address:text(m.address??'','Sídlo',500),email:text(m.email??'','E-mail',254),phone:text(m.phone??'','Telefon',80),bank:text(m.bank??'','Účet',100),representatives};
    if(!/^\d{8}$/.test(o.ico))throw new ApiError(400,'IČO musí mít osm číslic.');
    if(o.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email))throw new ApiError(400,'Zadejte platný e-mail organizace.');
    await ctx.db.batch([ctx.db.prepare('INSERT INTO organizations (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(o.id,json(o)),auditStatement(ctx,old?'organization.updated':'organization.created',o.name,o.id)]);return {id:o.id};
  }
  if(action==='saveContract'){
    federation(ctx);const source=record(p.contract??p);const old=typeof source.id==='string'?await one<Contract>(ctx.db,'contracts',source.id):null;
    if(old&& !['draft','changes'].includes(old.status))throw new ApiError(409,'Odeslanou nebo schválenou smlouvu nelze měnit. Nejprve vraťte vyúčtování k doplnění.');
    if(old&&version(source.version)!==old.version)throw new ApiError(409,'Smlouva byla změněna. Obnovte stránku.');
    const m={...(old||{}),...source};const organizationId=text(m.organizationId,'Organizace',100,true);if(!await one(ctx.db,'organizations',organizationId))throw new ApiError(404,'Vyberte existující organizaci.');
    if(old&&old.organizationId!==organizationId)throw new ApiError(400,'Organizaci existující smlouvy nelze změnit.');
    const year=Number(m.year);if(!Number.isInteger(year)||year<2000||year>2100)throw new ApiError(400,'Rok musí být mezi 2000 a 2100.');
    const c:Contract={id:old?.id||id('contract'),organizationId,number:text(m.number,'Číslo smlouvy',100,true),program:choice(m.program,['Organizace','Talent','Reprezentace','Pohár předsedy'],'Program'),year,amount:money(m.amount,'Částka dotace'),validFrom:date(m.validFrom,'Začátek období'),validTo:date(m.validTo,'Konec období'),deadline:date(m.deadline,'Termín vyúčtování'),conditions:text(m.conditions??'','Podmínky',20000),cashLimit:m.cashLimit==null?null:money(m.cashLimit,'Hranice hotovosti'),status:old?.status||'draft',conclusion:old?.conclusion||'',reduction:old?.reduction||0,declaredBy:old?.declaredBy||'',declaredAt:old?.declaredAt||'',version:(old?.version||0)+1};
    if(c.amount<=0||c.validFrom>c.validTo)throw new ApiError(400,'Částka musí být kladná a období musí mít správné pořadí.');
    if(old)await saveContractState(ctx,c,old,'contract.updated',c.number);
    else await ctx.db.batch([ctx.db.prepare('INSERT INTO contracts (id,organization_id,status,version,amount_cents,data) VALUES (?,?,?,?,?,?)').bind(c.id,c.organizationId,c.status,c.version,cents(c.amount),json(c)),auditStatement(ctx,'contract.created',c.number,c.organizationId,c.id)]);
    return {id:c.id};
  }
  if(action==='saveItem'){
    const source=record(p.item??p);const old=typeof source.id==='string'?await one<Item>(ctx.db,'items',source.id):null;const c=await getContract(ctx,text(old?.contractId??source.contractId,'Smlouva',100,true));
    if(!['draft','changes'].includes(c.status))throw new ApiError(409,'Vyúčtování je uzamčené. Pro doplnění použijte odpověď na žádost SFJ.');
    if(old&&version(source.version)!==old.version)throw new ApiError(409,'Doklad byl změněn. Obnovte stránku.');
    const m={...(old||{}),...source};
    const i:Item={id:old?.id||id('item'),contractId:c.id,number:text(m.number??'','Číslo dokladu',150),supplier:text(m.supplier??'','Dodavatel',250),supplierIco:text(m.supplierIco??'','IČO dodavatele',30),description:text(m.description??'','Popis nákladu',3000),category:choice(m.category,['materials','services','wages'],'Skupina nákladů'),amount:money(m.amount,'Částka dokladu'),claimed:money(m.claimed,'Uplatněná částka'),date:date(m.date??'','Datum úhrady',true),payment:choice(m.payment,['bank','cash'],'Úhrada'),recipientType:choice(m.recipientType,['organization','person','none','other'],'Odběratel'),recipientName:text(m.recipientName??'','Jméno odběratele',250),comment:text(m.comment??'','Komentář',10000),orgReview:choice(m.orgReview??'unchecked',['unchecked','checked','commented'],'Kontrola organizace'),sfjDecision:'pending',sfjReason:'',excluded:m.excluded===true,fileIds:await validateFiles(ctx,m.fileIds??[],c),version:(old?.version||0)+1};
    if(duplicateReceipt(await all<Item>(ctx.db,'items','WHERE contract_id=?',[c.id]),i))throw new ApiError(409,'Tento doklad od stejného dodavatele už je ve smlouvě uložený. Otevřete existující doklad.');
    if(i.orgReview==='commented'&&!i.comment&&!i.excluded)throw new ApiError(400,'Kontrola s komentářem vyžaduje vyplněný komentář.');
    if(i.orgReview!=='unchecked'&&!i.excluded){const f=findings(i,c);const hard=f.filter(f=>f.severity==='error');if(hard.length)throw new ApiError(400,'Doklad nelze potvrdit. Uložte jej jako nezkontrolovaný nebo opravte chyby.',hard.map(f=>f.message));if(f.some(f=>f.severity==='warning')&&(!i.comment||i.orgReview!=='commented'))throw new ApiError(400,'Položka s upozorněním vyžaduje komentář a stav „S komentářem“.');}
    // Keep duplicate protection in the write itself, including simultaneous imports.
    const noDuplicate = " AND NOT EXISTS (SELECT 1 FROM items dup WHERE dup.contract_id=? AND dup.id<>? AND json_extract(dup.data,'$.number')<>'' AND json_extract(dup.data,'$.supplier')<>'' AND lower(trim(json_extract(dup.data,'$.number')))=? AND (lower(trim(json_extract(dup.data,'$.supplier')))=? OR (?<>'' AND json_extract(dup.data,'$.supplierIco')=?)))";
    const duplicateArgs = [c.id,i.id,i.number.trim().toLowerCase(),i.supplier.trim().toLowerCase(),i.supplierIco,i.supplierIco];
    const statement=old?ctx.db.prepare("UPDATE items SET data=?,version=?,amount_cents=?,claimed_cents=? WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM contracts WHERE id=? AND status IN ('draft','changes'))"+noDuplicate).bind(json(i),i.version,cents(i.amount),cents(i.claimed),i.id,old.version,c.id,...duplicateArgs):ctx.db.prepare("INSERT INTO items (id,organization_id,contract_id,version,amount_cents,claimed_cents,data) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM contracts WHERE id=? AND status IN ('draft','changes'))"+noDuplicate).bind(i.id,c.organizationId,c.id,i.version,cents(i.amount),cents(i.claimed),json(i),c.id,...duplicateArgs);
    await mutate(ctx,statement,auditStatement(ctx,old?'item.updated':'item.created',`${i.number||'Rozpracovaný doklad'} · ${i.orgReview}${i.excluded?' · vyřazeno':''}`,c.organizationId,c.id,i.id,true));return {id:i.id};
  }
  if(action==='reviewItem'){
    federation(ctx);const {item:i,contract:c}=await getItem(ctx,text(p.id,'Doklad',100,true));if(c.status!=='submitted')throw new ApiError(409,'Posuzovat lze pouze odeslané vyúčtování.');if(i.excluded)throw new ApiError(400,'Vyřazená položka se neposuzuje.');if(version(p.version)!==i.version)throw new ApiError(409,'Doklad byl změněn. Obnovte stránku.');
    const decision=choice(p.decision,['accepted','rejected','supplement'],'Výsledek kontroly');const reason=text(p.reason??'','Důvod',10000,decision!=='accepted');const updated:Item={...i,sfjDecision:decision,sfjReason:reason,version:i.version+1};
    await mutate(ctx,ctx.db.prepare("UPDATE items SET data=?,version=? WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM contracts WHERE id=? AND status='submitted')").bind(json(updated),updated.version,i.id,i.version,c.id),auditStatement(ctx,`item.${decision}`,reason||'SFJ akceptovalo položku.',c.organizationId,c.id,i.id,true));return {};
  }
  if(action==='bulkAccept'){
    federation(ctx);const c=await getContract(ctx,text(p.contractId,'Smlouva',100,true));if(c.status!=='submitted')throw new ApiError(409,'Hromadná akceptace je dostupná pro odeslané vyúčtování.');if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>500)throw new ApiError(400,'Vyberte 1 až 500 dokladů.');
    const allItems=await all<Item>(ctx.db,'items','WHERE contract_id=?',[c.id]);const selected=allItems.filter(i=>(p.ids as unknown[]).includes(i.id));if(selected.length!==new Set(p.ids).size||selected.some(i=>i.excluded||i.sfjDecision==='supplement'))throw new ApiError(400,'Výběr obsahuje nedostupné nebo nevyřešené doklady.');
    const statements:D1PreparedStatement[]=[];for(const i of selected){const updated={...i,sfjDecision:'accepted',sfjReason:'',version:i.version+1};statements.push(ctx.db.prepare("UPDATE items SET data=?,version=? WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM contracts WHERE id=? AND status='submitted')").bind(json(updated),updated.version,i.id,i.version,c.id),auditStatement(ctx,'item.accepted','Hromadná akceptace SFJ.',c.organizationId,c.id,i.id,true));}
    const result=await ctx.db.batch(statements);if(result.some((r,n)=>n%2===0&&!r.meta.changes))throw new ApiError(409,'Některé doklady se mezitím změnily. Obnovte stránku a zkontrolujte výsledek hromadné akceptace.');return {};
  }
  if(['submit','return','approve'].includes(action)){
    const c=await getContract(ctx,text(p.contractId,'Smlouva',100,true));if(version(p.version)!==c.version)throw new ApiError(409,'Smlouva byla změněna. Obnovte stránku.');const items=await all<Item>(ctx.db,'items','WHERE contract_id=?',[c.id]);let updated:Contract={...c,version:c.version+1};let detail='';
    if(action==='submit'){
      manager(ctx,c.organizationId);if(!['draft','changes'].includes(c.status))throw new ApiError(409,'Vyúčtování už bylo odesláno.');if(p.declaration!==true)throw new ApiError(400,'Potvrďte prohlášení příjemce dotace.');
      const errors=submissionErrors(c,items);for(const i of items.filter(i=>!i.excluded))await validateFiles(ctx,i.fileIds,c);if(errors.length)throw new ApiError(400,'Vyúčtování nelze odeslat. Opravte následující položky.',errors);
      updated={...updated,status:'submitted',declaredBy:ctx.user.displayName||ctx.user.email,declaredAt:now(),conclusion:'',reduction:0};detail='Potvrzeno prohlášení příjemce a odesláno SFJ. Účetní údaje uzamčeny.';
    }else if(action==='return'){
      federation(ctx);if(c.status!=='submitted')throw new ApiError(409,'Vrátit lze pouze odeslané vyúčtování.');detail=text(p.reason,'Důvod vrácení',10000,true);updated={...updated,status:'changes',conclusion:detail};
    }else{
      federation(ctx);if(c.status!=='submitted')throw new ApiError(409,'Schválit lze pouze odeslané vyúčtování.');const active=items.filter(i=>!i.excluded);if(!active.length||active.some(i=>['pending','supplement'].includes(i.sfjDecision)))throw new ApiError(400,'Nejprve posuďte všechny položky a uzavřete žádosti o doplnění.');
      const conclusion=text(p.conclusion,'Závěr kontroly',10000,true);const reduction=money(p.reduction,'Krácení dotace');const rejected=active.filter(i=>i.sfjDecision==='rejected').reduce((s,i)=>s+cents(i.claimed),0);if(cents(reduction)<rejected||cents(reduction)>cents(c.amount))throw new ApiError(400,'Krácení musí pokrýt součet neuznaných položek a nesmí překročit dotaci.');updated={...updated,status:'approved',conclusion,reduction};detail=`${conclusion} · Krácení ${reduction.toFixed(2)} Kč`;
    }
    await saveContractState(ctx,updated,c,`settlement.${action}`,detail,items);return {};
  }
  if(action==='reply'){
    const {item:i,contract:c}=await getItem(ctx,text(p.itemId,'Doklad',100,true));if(ctx.member.role==='federation')throw new ApiError(403,'Odpověď na dožádání vkládá organizace.');if(c.status!=='submitted'||i.sfjDecision!=='supplement')throw new ApiError(409,'K tomuto dokladu není otevřená žádost o doplnění.');
    const answer=text(p.text,'Odpověď',10000,true);const fileIds=p.fileIds===undefined?i.fileIds:await validateFiles(ctx,p.fileIds,c);const updated={...i,fileIds:[...new Set([...i.fileIds,...fileIds])],sfjDecision:'pending',version:i.version+1};
    await mutate(ctx,ctx.db.prepare("UPDATE items SET data=?,version=? WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM contracts WHERE id=? AND status='submitted')").bind(json(updated),updated.version,i.id,i.version,c.id),auditStatement(ctx,'item.reply',answer,c.organizationId,c.id,i.id,true));return {};
  }
  if(action==='invite'){
    const role=choice(p.role,['federation','org_admin','member'],'Role');
    const organizationId=text(p.organizationId??'','Organizace',100,role!=='federation');
    if(role==='federation'){
      federation(ctx);
      if(organizationId)throw new ApiError(400,'Pracovník SFJ má přístup federace bez přiřazení k jedné organizaci.');
    }else{
      manager(ctx,organizationId);
      if(!await one(ctx.db,'organizations',organizationId))throw new ApiError(404,'Organizace neexistuje.');
    }
    const email=text(p.email,'E-mail',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,'Zadejte platný e-mail pozvaného.');const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');const expiresAt=new Date(Date.now()+7*86400000).toISOString();
    await ctx.db.batch([ctx.db.prepare('INSERT INTO invitations (id,organization_id,email,role,token_hash,expires_at,used_by,created_by) VALUES (?,?,?,?,?,?,NULL,?)').bind(id('invite'),organizationId,email,role,await digest(new TextEncoder().encode(token)),expiresAt,ctx.user.userId),auditStatement(ctx,'member.invited',`Připraven jednorázový odkaz pro ${email} · ${role}. E-mail neodeslán.`,organizationId)]);return {inviteUrl:`/?invite=${token}`,expiresAt};
  }
  if(action==='feedback'){
    const organizationId=text(p.organizationId??ctx.member.organizationId,'Organizace',100);scope(ctx,organizationId);if(organizationId&&!await one(ctx.db,'organizations',organizationId))throw new ApiError(404,'Organizace neexistuje.');const f:Feedback={id:id('feedback'),text:text(p.text,'Návrh',10000,true),at:now(),author:ctx.user.displayName||ctx.user.email,organizationId};await ctx.db.batch([ctx.db.prepare('INSERT INTO feedback (id,organization_id,data) VALUES (?,?,?)').bind(f.id,organizationId,json(f)),auditStatement(ctx,'feedback.created',f.text,organizationId)]);return {id:f.id};
  }
  throw new ApiError(400,'Neznámá operace. Obnovte aplikaci.');
}
export async function acceptInvite(ctx:IdentityContext,token:unknown){
  const hash=await digest(new TextEncoder().encode(text(token,'Pozvánka',128,true)));
  const invite=await ctx.db.prepare('SELECT * FROM invitations WHERE token_hash=?').bind(hash).first<{id:string;organization_id:string;email:string;role:'federation'|'org_admin'|'member';expires_at:string;used_by:string|null}>();
  if(!invite||invite.used_by||invite.expires_at<now())throw new ApiError(400,'Pozvánka už není platná. Požádejte o nový odkaz.');if(invite.email!==ctx.user.email.toLowerCase())throw new ApiError(403,`Pozvánka je určena pro ${invite.email}. Přihlaste se tímto účtem.`);if(ctx.member)throw new ApiError(409,'Tento účet už má členství. Změnu organizace musí vyřešit správce.');
  // Only the role stored by the authorized invitation creator is accepted;
  // request payloads cannot select or upgrade the role during redemption.
  if(!['federation','org_admin','member'].includes(invite.role))throw new ApiError(400,'Pozvánka obsahuje neplatnou roli. Požádejte správce o nový odkaz.');
  if(invite.role==='federation'){
    if(invite.organization_id)throw new ApiError(400,'Pozvánka pracovníka SFJ obsahuje neplatné přiřazení organizace.');
  }else if(!invite.organization_id||!await one(ctx.db,'organizations',invite.organization_id))throw new ApiError(400,'Organizace v pozvánce už není dostupná. Požádejte správce o nový odkaz.');
  const member:Membership={id:id('member'),userId:ctx.user.userId,email:ctx.user.email.toLowerCase(),name:ctx.user.displayName,role:invite.role,organizationId:invite.organization_id};
  const result=await ctx.db.batch([
    ctx.db.prepare('UPDATE invitations SET used_by=? WHERE id=? AND used_by IS NULL AND expires_at>=?').bind(ctx.user.userId,invite.id,now()),
    ctx.db.prepare('INSERT INTO memberships (id,user_id,organization_id,role,email,data) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(member.id,member.userId,member.organizationId,member.role,member.email,json(member)),
    auditStatement({...ctx,member} as ServerContext,'member.joined',`${member.email} · ${member.role}`,member.organizationId,'','',true),
  ]);if(!result[1].meta.changes)throw new ApiError(409,'Pozvánka už byla přijata. Obnovte stránku.');return {};
}
export async function authorizeFile(ctx:ServerContext,key:string){
  const row=await ctx.db.prepare('SELECT data,object_key FROM files WHERE id=?').bind(key).first<{data:string;object_key:string}>();if(!row)throw new ApiError(404,'Soubor nebyl nalezen.');const file=JSON.parse(row.data) as StoredFile;scope(ctx,file.organizationId);await getContract(ctx,file.contractId);return {file,key:row.object_key};
}
export async function saveFile(ctx:ServerContext,contractId:string,kind:StoredFile['kind'],upload:File){
  const contract=await getContract(ctx,contractId);
  if(kind!=='receipt')federation(ctx);
  if(contract.status==='approved')throw new ApiError(409,'Schválené vyúčtování je uzamčené.');
  if(contract.status==='submitted'&&ctx.member.role!=='federation'){
    const rows=await all<Item>(ctx.db,'items','WHERE contract_id=?',[contractId]);if(kind!=='receipt'||!rows.some(i=>i.sfjDecision==='supplement'))throw new ApiError(409,'Soubor lze k odeslanému vyúčtování přidat pouze na žádost SFJ.');
  }
  if(!upload.size||upload.size>10*1024*1024)throw new ApiError(400,'Soubor musí mít 1 B až 10 MB.');
  const bytes=new Uint8Array(await upload.arrayBuffer());
  let type='';if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d)type='application/pdf';else if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)type='image/jpeg';else if(bytes.slice(0,8).every((b,i)=>b===[137,80,78,71,13,10,26,10][i])&&bytes.length>=8)type='image/png';else if(bytes.length>=12&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')type='image/webp';
  if(!type)throw new ApiError(400,'Podporované jsou skutečné PDF, JPEG, PNG a WebP soubory. Přípona souboru nestačí.');
  const name=upload.name.replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,200)||'doklad';
  const file:StoredFile={id:id('file'),organizationId:contract.organizationId,contractId,name,type,size:bytes.length,sha256:await digest(bytes),kind,createdAt:now()};const key=`${file.organizationId}/${contractId}/${file.id}`;
  await ctx.bucket.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{sha256:file.sha256}});
  try{await ctx.db.batch([ctx.db.prepare('INSERT INTO files (id,organization_id,contract_id,object_key,data) VALUES (?,?,?,?,?)').bind(file.id,file.organizationId,contractId,key,json(file)),auditStatement(ctx,'file.uploaded',`${name} · ${bytes.length} B · SHA-256 ${file.sha256}`,file.organizationId,contractId)]);}catch(error){await ctx.bucket.delete(key);throw error;}
  return file;
}
