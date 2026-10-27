import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parsePension,parsePensionLimits,parseLaw,parseEmployment,officialFetch,validateRates} from './collector.mjs';
import {signCatalog,readEnvelope,publishLocal} from './publisher.mjs';
const rates={pensionEachPpm:47500,pensionLower:410000,pensionUpper:6590000,healthTotalPpm:71900,healthLower:20160,healthUpper:9183480,carePpm:9448,unemploymentEachPpm:9000,employerExtraPpm:[2500,4500,6500,8500]};
const policy={id:'synthetic-2026',from:'2026-10-01',until:'2026-11-01',rates,sources:[{url:'https://www.law.go.kr/',sha256:'a'.repeat(64)}]};
const now=new Date('2026-10-26T00:00:00Z');
const {privateKey,publicKey}=generateKeyPairSync('ed25519'); // ephemeral; never persisted
test('pension enacted yearly table, 2026 and 2027',()=>{
  const h='[ 연도별 보험료율 인상 내역 ] 2026 9.5% 4.75% 4.75% 2027 10.0% 5.00% 5.00% 내용변경';
  assert.equal(parsePension(h,2026),47500);assert.equal(parsePension(h,2027),50000);
  assert.throws(()=>parsePension(h,2028));assert.throws(()=>parsePension(h.replace('4.75% 4.75%','4.75% 4.70%'),2026));
});
test('pension caps have explicit July-to-June interval',()=>{
  const h='2026년 7월부터 2027년 6월까지의 기준소득월액 하한액은 410,000원, 상한액은 6,590,000원';
  assert.equal(parsePensionLimits(h,'2027-06-01').pensionUpper,6590000);
  assert.throws(()=>parsePensionLimits(h,'2027-07-01'));
});
test('law effective date, future and ambiguous articles fail closed',()=>{
  const h='[시행 2026. 10. 1.] 제44조(보험료율 및 금액) ① 각각 1만분의 719로 한다 ② 기타';
  assert.equal(parseLaw(h,'health','2026-10-01').healthTotalPpm,71900);
  assert.throws(()=>parseLaw(h,'health','2026-09-01'));
  assert.throws(()=>parseLaw(h.replace('②','각각 1만분의 720로 한다 ②'),'health','2026-10-01'));
});
test('care law prior mid-month unrelated amendment is not a future rate',()=>{
  const h='[시행 2026. 5. 12.] 제4조(장기요양보험료율) 장기요양보험료율은 100만분의 9,448로 한다 [본조신설]';
  assert.equal(parseLaw(h,'care','2026-10-01').carePpm,9448);
  assert.throws(()=>parseLaw(h,'care','2026-05-01'));
});
test('health caps do not silently carry across annual notice boundary',()=>{
  const h='[시행 2026. 1. 1.] 제2조(월별 보험료액의 상한) 직장가입자의 보수월액보험료 : 9,183,480원 제3조(월별 보험료액의 하한) 직장가입자의 보수월액보험료 : 20,160원 제4조';
  assert.equal(parseLaw(h,'limits','2026-10-01').healthLower,20160);
  assert.throws(()=>parseLaw(h,'limits','2027-01-01'));
});
test('employment categories and date columns are parsed, not guessed',()=>{
  const h='<table><caption>보험료 부담비율</caption><thead>’22.7.1. 이후</thead><tr><td>실 업 급 여</td><td>0.9%(특고 0.8%)</td><td>0.9%</td></tr>'+['150인 미만 기업','150인 이상 우선지원','150인 이상 1000인 미만','1000인 이상 기업'].map((s,i)=>`<tr><td>${s}</td><td></td><td>${[.25,.45,.65,.85][i]}%</td></tr>`).join('')+'</table>';
  assert.deepEqual(parseEmployment(h,'2026-10-01').employerExtraPpm,rates.employerExtraPpm);
  assert.throws(()=>parseEmployment(h+h,'2026-10-01'));
});
test('bounds reject impossible rates and invalid ordering',()=>{
  assert.throws(()=>validateRates({...rates,healthTotalPpm:999999}));
  assert.throws(()=>validateRates({...rates,pensionUpper:300000}));
});
test('official transport refuses outside hosts, HTTP and oversized bodies',async()=>{
  await assert.rejects(officialFetch('https://example.com/'));
  await assert.rejects(officialFetch('http://www.law.go.kr/'));
  await assert.rejects(officialFetch('https://www.law.go.kr/',async()=>new Response('x',{headers:{'content-length':'4000001'}})));
});
test('signed catalog verification and tamper rejection',()=>{
  const e=signCatalog(policy,{privateKey,now});assert.equal(readEnvelope(e,publicKey).sequence,1);
  const b=JSON.parse(e);b.payload=Buffer.from('{}').toString('base64');assert.throws(()=>readEnvelope(JSON.stringify(b),publicKey));
  assert.throws(()=>readEnvelope(e,generateKeyPairSync('ed25519').publicKey));
});
test('refresh increments sequence; changed rate creates old/new history',()=>{
  const first=signCatalog(policy,{privateKey,now});
  const second=signCatalog({...policy,id:'synthetic-changed',rates:{...rates,pensionEachPpm:50000}},{privateKey,previous:first,now:new Date(now.getTime()+3600000)});
  const data=readEnvelope(second,publicKey);assert.equal(data.sequence,2);assert.equal(data.history[1].changes.pensionEachPpm.before,47500);assert.equal(data.history[1].changes.pensionEachPpm.after,50000);
  assert.throws(()=>signCatalog(policy,{privateKey,previous:second,now}));
});
test('future candidate cannot activate before its month',()=>{
  assert.throws(()=>signCatalog({...policy,from:'2027-01-01',until:'2027-02-01'},{privateKey,now}));
});
test('collector failure preserves exact previous file and expiration',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'careplet-policy-')),output=join(dir,'latest.json');
  await publishLocal({output,privateKey,bootstrap:true,now,collector:async()=>policy});
  const before=await readFile(output,'utf8');
  await assert.rejects(publishLocal({output,privateKey,now:new Date(now.getTime()+3600000),collector:async()=>{throw Error('source unavailable');}}));
  assert.equal(await readFile(output,'utf8'),before);
});
test('missing feed requires explicit one-time bootstrap',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'careplet-policy-'));
  await assert.rejects(publishLocal({output:join(dir,'missing.json'),privateKey,now,collector:async()=>policy}));
});
