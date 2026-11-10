import type { Contract, Item, Organization, StoredFile } from './model';

const organizations: Organization[] = [
  { id:'org-haj', name:'FK Háj, z. s.', ico:'00000001', address:'Ukázková 12, Město Háj', email:'klub@sport-javor.example', phone:'+420 000 000 001', bank:'0000000001 / 0000', representatives:['Eliška Vzorová'] },
  { id:'org-lipa', name:'Sportovní centrum Lípa, z. s.', ico:'00000002', address:'Modelová 5, Město Lípa', email:'centrum@sport-javor.example', phone:'+420 000 000 002', bank:'0000000002 / 0000', representatives:['Martin Ukázkový','Eva Příkladná'] },
  { id:'org-sever', name:'Oblastní sportovní svaz Sever', ico:'00000003', address:'Cvičná 9, Město Sever', email:'sever@sport-javor.example', phone:'+420 000 000 003', bank:'0000000003 / 0000', representatives:['Hana Vzorná'] },
];
const contract = (id:string, organizationId:string, number:string, program:Contract['program'], amount:number, status:Contract['status']):Contract => ({ id, organizationId, number, program, year:2026, amount, validFrom:'2026-01-01', validTo:'2026-12-31', deadline:'2027-01-15', conditions:'FIKTIVNÍ PILOT: Podmínky musí SFJ potvrdit podle skutečné smlouvy a pokynů. Veřejné podklady 2025 slouží pouze jako reference. Datum období a termín jsou ukázkové, nikoli závazná metodika.', cashLimit:null, status, conclusion:'', reduction:0, declaredBy:status==='submitted'?'Fiktivní administrátor':'', declaredAt:status==='submitted'?'2026-10-01T12:00:00.000Z':'', version:1 });
const contracts = [contract('contract-haj','org-haj','026-001-2026-O','Organizace',120000,'draft'),contract('contract-talent','org-haj','026-002-2026-T','Talent',80000,'draft'),contract('contract-lipa','org-lipa','026-003-2026-T','Talent',95000,'submitted'),contract('contract-sever','org-sever','026-004-2026-R','Reprezentace',60000,'submitted')];
const receipt = (id:string,contractId:string,number:string,supplier:string,description:string,category:Item['category'],amount:number,more:Partial<Item>={}):Item => ({ id,contractId,number,supplier,supplierIco:'00000010',description,category,amount,claimed:amount,date:'2026-09-15',payment:'bank',recipientType:'organization',recipientName:'',comment:'',orgReview:'checked',sfjDecision:'pending',sfjReason:'',excluded:false,fileIds:[`file-${id}`],version:1,...more });
const items = [
  receipt('item-balls','contract-haj','FV-2026-101','Sport Vzor s.r.o.','Tréninkové míče a pomůcky','materials',18500,{orgReview:'unchecked'}),
  receipt('item-rent','contract-haj','FV-2026-108','Areál Ukázkov s.r.o.','Pronájem sportovní haly na září','services',32000,{claimed:24000,orgReview:'unchecked'}),
  receipt('item-wages','contract-talent','MZ-2026-09','Fiktivní trenér','Hrubá mzda trenéra a odvody za září','wages',24500,{orgReview:'unchecked'}),
  receipt('item-lipa','contract-lipa','FV-2026-121','Ubytování Model s.r.o.','Ubytování mládeže při soustředění','services',28000),
  receipt('item-lipa-cash','contract-lipa','PD-2026-042','Sportovní servis Vzor','Pomůcky zakoupené na turnaji','materials',6500,{payment:'cash',orgReview:'commented',comment:'Fiktivní výjimka: prodejce nepřijímal karty ani převod. Žádáme SFJ o individuální posouzení hotovosti.'}),
  receipt('item-sever','contract-sever','FV-2026-139','Autodoprava Příklad','Doprava oblastního výběru na turnaj','services',21000),
];

// A real, minimal PDF file with ASCII text and a complete xref table. It is
// deliberately fictional and is the original document for every seeded receipt.
export function demoPdf(lines:string[]): Uint8Array {
  const safe = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?').replace(/[\\()]/g,'\\$&');
  const stream = `BT /F1 12 Tf 50 790 Td 18 TL ${lines.map((s,i)=>`${i?'T* ':''}(${safe(s)}) Tj`).join('\n')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=pdf.length;pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
export async function digest(bytes:ArrayBuffer|Uint8Array):Promise<string> {
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes).buffer : bytes;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function seedDemo(db:D1Database,bucket:R2Bucket) {
  const seeded = await db.prepare("SELECT seeded FROM bootstrap WHERE id='owner'").first<{seeded:number}>();
  if (seeded?.seeded) return;
  const statements:D1PreparedStatement[]=[];
  for(const o of organizations)statements.push(db.prepare('INSERT OR IGNORE INTO organizations (id,data) VALUES (?,?)').bind(o.id,JSON.stringify(o)));
  for(const c of contracts)statements.push(db.prepare('INSERT OR IGNORE INTO contracts (id,organization_id,status,version,amount_cents,data) VALUES (?,?,?,?,?,?)').bind(c.id,c.organizationId,c.status,c.version,Math.round(c.amount*100),JSON.stringify(c)));
  for(const i of items){
    const c=contracts.find(c=>c.id===i.contractId)!;
    const bytes=demoPdf(['SPORTOVNI FEDERACE JAVOR - FIKTIVNI DOKLAD','Pouze skolici a demonstracni data. Nejedna se o danovy doklad.',`Doklad: ${i.number}`,`Dodavatel: ${i.supplier}`,`Popis: ${i.description}`,`Castka: ${i.amount.toFixed(2)} CZK`,`Datum uhrady: ${i.date}`,`Zpusob uhrady: ${i.payment==='bank'?'Banka':'Hotovost'}`]);
    const id=`file-${i.id}`;const key=`demo/${id}.pdf`;await bucket.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
    const file:StoredFile={id,organizationId:c.organizationId,contractId:c.id,name:`FIKTIVNI-${i.number}.pdf`,type:'application/pdf',size:bytes.length,sha256:await digest(bytes),kind:'receipt',createdAt:'2026-10-01T12:00:00.000Z'};
    statements.push(db.prepare('INSERT OR IGNORE INTO files (id,organization_id,contract_id,object_key,data) VALUES (?,?,?,?,?)').bind(id,c.organizationId,c.id,key,JSON.stringify(file)));
    statements.push(db.prepare('INSERT OR IGNORE INTO items (id,organization_id,contract_id,version,amount_cents,claimed_cents,data) VALUES (?,?,?,?,?,?,?)').bind(i.id,c.organizationId,c.id,i.version,Math.round(i.amount*100),Math.round(i.claimed*100),JSON.stringify(i)));
  }
  statements.push(db.prepare("UPDATE bootstrap SET seeded=1 WHERE id='owner'"));
  await db.batch(statements);
}
