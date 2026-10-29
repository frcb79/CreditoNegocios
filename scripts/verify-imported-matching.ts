/** Read-only replay: accepts a snapshot, never connects to PostgreSQL or publishes. */
import {getOfferAgePolicy} from '../shared/offerAgePolicy';
import {readFileSync} from 'node:fs';
import {evaluateOfferCompatibility} from '../server/matching/compatibilityEvaluator';
const file=process.argv[2];if(!file)throw Error('Indica el JSON de ofertas/versiones a revisar. No usa datos de clientes reales.');
const offers=JSON.parse(readFileSync(file,'utf8'));
const rows:Record<string,{rules:number;pass:number;fail:number;missing:number}>={};
let falseCompatibility=0,profilesEvaluated=0,unresolvedPolicyChecks=0;
for(const entry of offers){
 const {product,version}=structuredClone(entry);product.status='published';version.status='published';
 const req=version.requirements,cond=version.conditions;
 for(const profile of req.targetProfiles || []){
 profilesEvaluated++;
 const base:any={type:profile,companyAgeMonths:1000,ingresoMensualPromedio:1000000000,ingresoAnual:12000000000,buroEmpresa:400,buroAccionistaPrincipal:760,buroPersonaFisica:760,satCiec:'si',estadosFinancieros:'si',atrasosDeudas:'no',opinionCumplimiento:'positiva',participacionVentasGobierno:'0',garantia:'si',avalObligadoSolidario:'si'};
 const checks=[['companyAge','minMonthsInBusiness','companyAgeMonths'],['monthlyRevenue','minMonthlyIncome','ingresoMensualPromedio'],['annualIncome','minAnnualIncome','ingresoAnual'],['businessBureau','minBusinessBureau','buroEmpresa'],['shareholderBureau','minShareholderBureau','buroAccionistaPrincipal'],['personalBureau','minPersonalBureau','buroPersonaFisica']];
 for(const [code,key,clientKey] of checks){
  if((code==='businessBureau'||code==='shareholderBureau') && profile!=='persona_moral')continue;
  if(code==='personalBureau' && profile==='persona_moral')continue;
  if(typeof req[key]!=='number' || req[key]<=0)continue;
  const agePolicy = code==='companyAge' ? getOfferAgePolicy(cond,req).rows.find(row=>row.profile===profile) : undefined;
  const minimum = agePolicy?.effectiveMonths ?? req[key];
  const counts=rows[code]??={rules:0,pass:0,fail:0,missing:0};counts.rules++;
  for(const mode of ['pass','fail','missing'] as const){
   const client={...base,[clientKey]:mode==='pass'?minimum:mode==='fail'?Math.max(0,minimum-1):null};
   // Do not let the annual-to-monthly fallback stand in for a deliberately absent monthly source.
   if(code==='monthlyRevenue' && mode==='missing')client.ingresoAnual=null;
   const result=evaluateOfferCompatibility({client,credit:{amount:cond.minAmount||1,term:cond.maxTermMonths||12}},{product,version});
   const criterion=[...result.criteria.matched,...result.criteria.failed,...result.criteria.missing].find(c=>c.code===code);
   const expected=agePolicy?.pending?'MISSING_DATA':mode==='pass'?'PASSED':mode==='fail'?'FAILED':'MISSING_DATA';
   if(agePolicy?.pending)unresolvedPolicyChecks++;
   if(criterion?.status!==expected)throw Error(`${code}/${mode}: se esperaba ${expected} y se obtuvo ${criterion?.status}`);
   counts[mode]++;
   if(mode==='fail' && result.status==='COMPATIBLE')falseCompatibility++;
  }
 }
}
}
if(falseCompatibility)throw Error('Se encontraron falsos compatibles');
console.log(JSON.stringify({offers:offers.length,profilesEvaluated,criteria:rows,unresolvedPolicyChecks,falseCompatibility,note:'Copias en memoria. No se publica ni modifica información.'},null,2));
