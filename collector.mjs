// National public information only. No Firebase, patient/employee data or AI
// interpretation. Fixed formula schema; unknown legal structure stops issuance.
import {createHash} from 'node:crypto';
const hosts=new Set(['www.law.go.kr','m.nps.or.kr','moel.go.kr']);
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function text(html) {
  return html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
export async function officialFetch(url,fetcher=fetch) {
  const u=new URL(url);
  if(u.protocol!=='https:' || !hosts.has(u.hostname) || u.username || u.password || (u.port && u.port!=='443')) throw Error('SOURCE_HOST');
  const r=await fetcher(u,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok || Number(r.headers.get('content-length')||0)>4000000) throw Error('SOURCE_RESPONSE');
  const chunks=[];let length=0;
  for await(const chunk of r.body){length+=chunk.length;if(length>4000000)throw Error('SOURCE_SIZE');chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}
export function civil(y,m=1,d=1) {
  const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  if(new Date(iso+'T00:00:00Z').toISOString().slice(0,10)!==iso)throw Error('SOURCE_DATE');
  return iso;
}
function one(s,re,code){const all=[...s.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))];if(all.length!==1)throw Error(code);return all[0];}
function number(s){if(!/^[\d,]+$/.test(s))throw Error('SOURCE_NUMBER');return Number(s.replaceAll(',',''));}
function ppm(s){if(!/^\d+(?:\.\d{1,4})?$/.test(s))throw Error('SOURCE_RATE');const [a,b='']=s.split('.');return Number(a)*10000+Number(b.padEnd(4,'0'));}
function effective(s){const m=one(s,/\[시행\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*\]/,'SOURCE_EFFECTIVE');return civil(+m[1],+m[2],+m[3]);}
export function parsePension(html,year) {
  const s=text(html), block=s.split('[ 연도별 보험료율 인상 내역 ]')[1]?.split('내용변경')[0];
  if(!block)throw Error('PENSION_TABLE');
  const m=one(block,new RegExp(`\\b${year}\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%`),'PENSION_YEAR');
  if(ppm(m[2])!==ppm(m[3]) || ppm(m[1])!==2*ppm(m[2]))throw Error('PENSION_SPLIT');
  return ppm(m[2]);
}
export function parsePensionLimits(html,month) {
  const m=one(text(html),/(\d{4})년\s*(\d{1,2})월부터\s*(\d{4})년\s*(\d{1,2})월까지의 기준소득월액 하한액은\s*([\d,]+)원,\s*상한액은\s*([\d,]+)원/,'PENSION_LIMITS');
  const from=civil(+m[1],+m[2]),until=new Date(Date.UTC(+m[3],+m[4],1)).toISOString().slice(0,10);
  if(month<from || month>=until)throw Error('PENSION_LIMITS_PERIOD');
  return {pensionLower:number(m[5]),pensionUpper:number(m[6])};
}
export function parseLaw(html,kind,month) {
  const s=text(html),from=effective(s);
  // A later amendment to an unrelated article may be mid-month. Never use a
  // law that is not yet effective at the beginning of the target month.
  if(from>month)throw Error('LAW_NOT_YET_EFFECTIVE');
  if(kind==='health') {
    const section=s.split('제44조(보험료율')[1]?.split('②')[0]||'';
    return {healthTotalPpm:number(one(section,/각각\s*1만분의\s*([\d,]+)로 한다/,'HEALTH_RATE')[1])*100};
  }
  if(kind==='care') {
    // Other articles may have a non-month-start amendment; only a changed
    // insurance article requires an effective-date adapter review.
    const section=s.split('제4조(장기요양보험료율)')[1]?.split('[본조신설')[0]||'';
    return {carePpm:number(one(section,/장기요양보험료율은\s*100만분의\s*([\d,]+)로 한다/,'CARE_RATE')[1])};
  }
  const upper=s.split('제2조(월별 보험료액의 상한)')[1]?.split('제3조')[0]||'';
  const lower=s.split('제3조(월별 보험료액의 하한)')[1]?.split('제4조')[0]||'';
  // Annual cap notice is not carried into another year without its new notice.
  if(from.slice(0,4)!==month.slice(0,4))throw Error('HEALTH_LIMITS_YEAR');
  return {healthUpper:number(one(upper,/직장가입자의 보수월액보험료\s*:\s*([\d,]+)원/,'HEALTH_UPPER')[1]),
    healthLower:number(one(lower,/직장가입자의 보수월액보험료\s*:\s*([\d,]+)원/,'HEALTH_LOWER')[1])};
}
export function parseEmployment(html,month) {
  const tables=(html.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi)||[]).filter(t=>t.includes('보험료 부담비율'));
  if(tables.length!==1)throw Error('EMPLOYMENT_TABLE');
  const table=tables[0],header=table.match(/<thead>[\s\S]*?<\/thead>/i)?.[0]||'';
  const dates=[...text(header).matchAll(/[’'](\d{2})\.(\d+)\.(\d+)\.\s*이후/g)].map(m=>civil(2000+Number(m[1]),+m[2],+m[3]));
  if(!dates.length || dates.some((d,i)=>i>0&&d<=dates[i-1]))throw Error('EMPLOYMENT_DATES');
  const index=dates.findLastIndex(d=>d<=month);if(index<0)throw Error('EMPLOYMENT_PERIOD');
  const rows=table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[];
  const cells=r=>[...r.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>text(m[1]));
  const row=rows.find(r=>/실\s*업\s*급\s*여/.test(text(r)));
  const rates=cells(row||'').slice(1).map(c=>ppm(c.match(/^(\d+(?:\.\d+)?)%/)?.[1]||''));
  if(rates.length!==2*dates.length || rates[2*index]!==rates[2*index+1])throw Error('EMPLOYMENT_RATES');
  const extras=rows.filter(r=>/150인 미만 기업|150인 이상|1000인 이상 기업/.test(text(r))).map(r=>{
    const values=cells(r).filter(c=>/^\d+(?:\.\d+)?%/.test(c)).map(c=>ppm(c.slice(0,-1)));
    if(values.length!==dates.length)throw Error('EMPLOYMENT_EXTRAS');return values[index];
  });
  if(extras.length!==4)throw Error('EMPLOYMENT_CATEGORIES');
  return {unemploymentEachPpm:rates[2*index],employerExtraPpm:extras};
}
export function validateRates(r) {
  const ranges={pensionEachPpm:[1000,100000],pensionLower:[100000,2000000],pensionUpper:[2000000,20000000],healthTotalPpm:[1000,150000],healthLower:[1000,100000],healthUpper:[1000000,30000000],carePpm:[100,30000],unemploymentEachPpm:[100,50000]};
  for(const [k,[min,max]]of Object.entries(ranges))if(!Number.isSafeInteger(r[k])||r[k]<min||r[k]>max)throw Error('RATE_BOUNDS');
  if(r.pensionLower>=r.pensionUpper || r.healthLower>=r.healthUpper || !Array.isArray(r.employerExtraPpm)||r.employerExtraPpm.length!==4 || new Set(r.employerExtraPpm).size!==4 || r.employerExtraPpm.some(v=>!Number.isInteger(v)||v<=0||v>30000))throw Error('RATE_RELATION');
}
export async function collect(month,fetcher=fetch) {
  const sources=[];
  async function read(url){const h=await officialFetch(url,fetcher);sources.push({url,sha256:digest(text(h))});return h;}
  async function law(name,article,kind){
    const path=article?`법령/${name}/${article}`:`행정규칙/${name}`;
    const outer=await read('https://www.law.go.kr/'+path);
    const src=one(outer,/<iframe\b[^>]*\bsrc="([^"]+)"/i,'LAW_FRAME')[1].replaceAll('&amp;','&');
    let url=new URL(src,'https://www.law.go.kr');
    if(url.hostname!=='www.law.go.kr' || url.protocol!=='https:')throw Error('LAW_FRAME_HOST');
    if(!article) {const seq=url.searchParams.get('admRulSeq');if(!/^\d+$/.test(seq||''))throw Error('LAW_ID');url=new URL('https://www.law.go.kr/LSW/admRulLsInfoR.do?admRulSeq='+seq+'&chrClsCd=010201');}
    return parseLaw(await read(url.href),kind,month);
  }
  const pension=await read('https://m.nps.or.kr/pnsinfo/ntpsklg/getOHAF0016M0.do?menuId=MN24001108');
  const caps=await read('https://m.nps.or.kr/pnsinfo/ntpsklg/getOHAF0056M0.do');
  const rates={pensionEachPpm:parsePension(pension,+month.slice(0,4)),...parsePensionLimits(caps,month),
    ...await law('국민건강보험법시행령','제44조','health'),
    ...await law('노인장기요양보험법시행령','제4조','care'),
    ...await law('월별건강보험료액의상한과하한에관한고시',null,'limits'),
    ...parseEmployment(await read('https://moel.go.kr/info/astmgmt/employ/employList.do'),month)};
  validateRates(rates);
  const from=month,until=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),1)).toISOString().slice(0,10);
  return {id:'kr-insurance-'+month+'-'+digest(JSON.stringify(rates)).slice(0,16),from,until,rates,sources};
}
