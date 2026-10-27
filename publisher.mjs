// Only local output here. Publication is a separately approved workflow.
import {createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {dirname} from 'node:path';
import {collect,validateRates,civil} from './collector.mjs';

export function readEnvelope(body,publicKey) {
  if(Buffer.byteLength(body)>262144)throw Error('ENVELOPE_SIZE');
  const e=JSON.parse(body);
  const payload=Buffer.from(e.payload||'','base64'),signature=Buffer.from(e.signature||'','base64');
  if(e.algorithm!=='Ed25519'||payload.length>196608||signature.length!==64||!verify(null,payload,publicKey,signature))throw Error('SIGNATURE');
  const p=JSON.parse(payload);
  if(p.schema!==1||!Number.isSafeInteger(p.sequence)||p.sequence<1||!Array.isArray(p.policies)||p.policies.length>36)throw Error('SCHEMA');
  const issued=Date.parse(p.issuedAt),expires=Date.parse(p.expiresAt);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued||expires-issued>72*3600000)throw Error('VALIDITY');
  let last='';
  for(const policy of p.policies) {
    validatePolicy(policy);
    if(last>policy.from)throw Error('OVERLAP');last=policy.until;
  }
  return p;
}
function validatePolicy(p) {
  validateRates(p.rates);
  if(!/^\d{4}-\d{2}-01$/.test(p.from)||!/^\d{4}-\d{2}-01$/.test(p.until)||p.until<=p.from)throw Error('POLICY_PERIOD');
  civil(+p.from.slice(0,4),+p.from.slice(5,7));civil(+p.until.slice(0,4),+p.until.slice(5,7));
  if(!p.id||!Array.isArray(p.sources)||!p.sources.length||p.sources.length>20)throw Error('SOURCES');
  for(const s of p.sources){const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password||!['www.law.go.kr','m.nps.or.kr','moel.go.kr'].includes(u.hostname)||!/^[a-f0-9]{64}$/.test(s.sha256))throw Error('SOURCES');}
}
export function signCatalog(policy,{privateKey,previous=null,now=new Date()}) {
  const key=typeof privateKey==='string'?createPrivateKey(privateKey):privateKey;
  if(key.asymmetricKeyType!=='ed25519')throw Error('KEY_TYPE');
  const old=previous?readEnvelope(previous,createPublicKey(key)):null;
  validatePolicy(policy);
  if(old&&Date.parse(old.issuedAt)>=now.getTime())throw Error('CLOCK_ROLLBACK');
  const month=new Date(now.getTime()+9*3600000).toISOString().slice(0,7)+'-01';
  if(policy.from!==month)throw Error('CURRENT_MONTH_REQUIRED');
  if(old?.policies.some(p=>p.from>month))throw Error('POLICY_ROLLBACK');
  const prior=old?.policies.find(p=>p.from===month)??old?.policies.at(-1);
  const changes=Object.fromEntries(Object.entries(policy.rates).filter(([k,v])=>JSON.stringify(prior?.rates[k])!==JSON.stringify(v)).map(([k,v])=>[k,{before:prior?.rates[k]??null,after:v}]));
  const history=[...(old?.history??[])];
  if(Object.keys(changes).length)history.push({observedAt:now.toISOString(),effectiveFrom:policy.from,policyId:policy.id,changes});
  const policies=[...(old?.policies??[]).filter(p=>p.until<=month),{...policy,observedAt:now.toISOString()}].slice(-36);
  const data={schema:1,sequence:(old?.sequence??0)+1,issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+72*3600000).toISOString(),policies,history:history.slice(-48)};
  const bytes=Buffer.from(JSON.stringify(data));
  if(bytes.length>196608)throw Error('CATALOG_SIZE');
  const result=JSON.stringify({algorithm:'Ed25519',payload:bytes.toString('base64'),signature:sign(null,bytes,key).toString('base64')});
  readEnvelope(result,createPublicKey(key));
  return result;
}
export async function publishLocal({output,privateKey,bootstrap=false,now=new Date(),collector=collect}) {
  let previous=null;
  try{previous=await readFile(output,'utf8');}catch(e){if(e.code!=='ENOENT'||!bootstrap)throw Error('PREVIOUS_REQUIRED');}
  const month=new Date(now.getTime()+9*3600000).toISOString().slice(0,7)+'-01';
  // All official collection and validation must succeed before extending expiry.
  const policy=await collector(month);
  const body=signCatalog(policy,{privateKey,previous,now});
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output+'.pending',body,{mode:0o600});
  await rename(output+'.pending',output);
  return {policyId:policy.id,from:policy.from,until:policy.until};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const result=await publishLocal({output:'public/latest.json',privateKey:process.env.POLICY_SIGNING_KEY,bootstrap:process.argv.includes('--bootstrap')});
    console.log(JSON.stringify({status:'signed-local-output',...result}));
  } catch { console.error('POLICY_UPDATE_FAILED: previous feed unchanged; operator investigation required. No credentials or source body logged.');process.exitCode=1; }
}
