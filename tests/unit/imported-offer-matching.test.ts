import {evaluateOfferCompatibility,isCriterionOriginVerified} from '../../server/matching/compatibilityEvaluator';
import {offerConditions,bureauInterval,compareMinimum} from '../../server/matching/importedRequirements';
const offer=(requirements:any={},conditions:any={})=>({product:{id:'offer',institutionId:'fin',name:'Oferta QA',status:'published'},version:{id:'v1',versionNumber:1,status:'published',conditions:{minAmount:100,maxAmount:1000000,maxTermMonths:36,...conditions},requirements:{targetProfiles:['persona_moral','fisica_empresarial','fisica','sin_sat'],...requirements}}});
const app=(client:any={})=>({credit:{amount:100000,term:24},client:{type:'persona_moral',companyAgeMonths:36,ingresoMensualPromedio:500000,ingresoAnual:6000000,buroEmpresa:300,buroAccionistaPrincipal:700,buroPersonaFisica:700,atrasosDeudas:'no',satCiec:'si',estadosFinancieros:'si',opinionCumplimiento:'positiva',participacionVentasGobierno:'0',...client}});
const find=(result:any,code:string)=>[...result.criteria.matched,...result.criteria.failed,...result.criteria.missing].find((e:any)=>e.code===code);
const allRules={minMonthsInBusiness:24,minMonthlyIncome:200000,minAnnualIncome:2400000,minBusinessBureau:250,minShareholderBureau:600,minPersonalBureau:600,requiresCiec:true,requiresFinancialStatements:true,satOpinion:'positiva',allowsArrears:false,governmentSalesLimit:'menor a 10%'};
describe('Published imported requirements: one explicit three-state result per material rule',()=>{
 it('accepts a fully captured applicant satisfying every structured imported rule without changing the offer',()=>{
  const source=offer(allRules),before=JSON.stringify(source);
  const result=evaluateOfferCompatibility(app(),source);
  expect(result.status).toBe('COMPATIBLE');expect(result.criteria.missing).toEqual([]);expect(result.criteria.matched).toHaveLength(13);
  expect(JSON.stringify(source)).toBe(before);
 });
 it.each([
  ['companyAge',{companyAgeMonths:12}],['monthlyRevenue',{ingresoMensualPromedio:100}],['annualIncome',{ingresoAnual:100}],
  ['businessBureau',{buroEmpresa:100}],['shareholderBureau',{buroAccionistaPrincipal:100}],['personalBureau',{buroPersonaFisica:100}],
  ['requiresCiec',{satCiec:'no'}],['requiresFinancialStatements',{estadosFinancieros:'no'}],['satOpinion',{opinionCumplimiento:'negativa'}],
  ['arrearsPolicy',{atrasosDeudas:'si'}],['governmentSalesLimit',{participacionVentasGobierno:'21-40'}],
 ])('rejects verified noncompliance for %s',(code,client)=>{
  const result=evaluateOfferCompatibility(app({...client,...(code==='personalBureau'?{type:'fisica_empresarial'}:{})}),offer(allRules));expect(result.status).toBe('NOT_COMPATIBLE');expect(find(result,code).status).toBe('FAILED');
 });
 it.each([
  ['companyAge',{companyAgeMonths:null}],['monthlyRevenue',{ingresoMensualPromedio:null,ingresoAnual:null}],['annualIncome',{ingresoAnual:null}],
  ['businessBureau',{buroEmpresa:null}],['shareholderBureau',{buroAccionistaPrincipal:null}],['personalBureau',{buroPersonaFisica:null}],
  ['requiresCiec',{satCiec:null}],['requiresFinancialStatements',{estadosFinancieros:null}],['satOpinion',{opinionCumplimiento:null}],
  ['arrearsPolicy',{atrasosDeudas:null}],['governmentSalesLimit',{participacionVentasGobierno:null}],
 ])('returns pending rather than compatibility for missing %s',(code,client)=>{
  const result=evaluateOfferCompatibility(app({...client,...(code==='personalBureau'?{type:'fisica_empresarial'}:{})}),offer(allRules));expect(result.status).toBe('INSUFFICIENT_DATA');expect(find(result,code).status).toBe('MISSING_DATA');
 });
 it('respects profile-specific ranges and canonical explicit values, including deliberate clearing',()=>{
  const req={minMonthsInBusiness:36,ranges:{tiempoActividad:{min:36}},profileRules:{persona_moral:{ranges:{tiempoActividad:{min:12}}}}};
  expect(offerConditions({},req,{type:'persona_moral'},{}).minCompanyAgeMonths).toBe(12);
  expect(offerConditions({minCompanyAgeMonths:24},req,{type:'persona_moral'},{}).minCompanyAgeMonths).toBe(24);
  expect(offerConditions({minCompanyAgeMonths:null},req,{type:'persona_moral'},{}).minCompanyAgeMonths).toBeNull();
 });
 it('treats interval boundaries conservatively for bureau and annual income',()=>{
  expect(compareMinimum(bureauInterval('bueno-592-693'),650)).toBe('MISSING_DATA');
  expect(compareMinimum(bureauInterval('bueno-592-693'),592)).toBe('PASSED');
  expect(compareMinimum(bureauInterval('bueno-592-693'),694)).toBe('FAILED');
  expect(bureauInterval('bueno-100-9999')).toBeNull();
  const result=evaluateOfferCompatibility(app({type:'fisica_empresarial',ingresoAnual:'1000000-2000000',buroPersonaFisica:'bueno-592-693'}),offer({minAnnualIncome:1500000,minPersonalBureau:650}));
  expect(find(result,'annualIncome').status).toBe('MISSING_DATA');expect(find(result,'personalBureau').status).toBe('MISSING_DATA');
 });
 it('does not equate a government-sales interval touching an exclusive upper bound to a pass',()=>{
  const result=evaluateOfferCompatibility(app({participacionVentasGobierno:'0-10'}),offer({governmentSalesLimit:'menor a 10%'}));
  expect(find(result,'governmentSalesLimit').status).toBe('MISSING_DATA');
  expect(find(evaluateOfferCompatibility(app(),offer({governmentSalesLimit:'arriba de 40%'})),'governmentSalesLimit').status).toBe('MISSING_DATA');
 });
 it('uses captured profilingData, preserving explicit false and zero',()=>{
  const candidate={credit:{amount:100000,term:24},client:{type:'persona_moral',profilingData:{companyAgeMonths:0,ingresoMensualPromedio:0,ingresoAnual:0,satCiec:false,atrasosDeudas:false}}};
  const result=evaluateOfferCompatibility(candidate,offer({minMonthsInBusiness:24,minMonthlyIncome:100,minAnnualIncome:100,requiresCiec:true,allowsArrears:false}));
  for(const code of ['companyAge','monthlyRevenue','annualIncome','requiresCiec'])expect(find(result,code).status).toBe('FAILED');
  expect(find(result,'arrearsPolicy').status).toBe('PASSED');
 });
 it('never ignores unsupported source policies or variable thresholds',()=>{
  const result=evaluateOfferCompatibility(app(),offer({guarantee:'Según evaluación',guarantorSource:'RL / Aval',bureauPolicySource:'Experiencia 12 meses',excludedSectors:'Giros de riesgo sujetos a revisión',presence:'Estados excluidos según ficha',minMonthlyIncomeSource:'1 mes de ventas',minAnnualIncomeSource:'1 mes de venta'}));
  for(const code of ['guaranteePolicy','guarantorPolicy','bureauPolicyReview','excludedSectors','presence','monthlyRevenue','annualIncome'])expect(find(result,code).status).toBe('MISSING_DATA');
  expect(result.status).toBe('INSUFFICIENT_DATA');
 });
 it('requires exact late-payment evidence when a limited tolerance applies',()=>{
  const result=evaluateOfferCompatibility(app({atrasosDeudas:'si'}),offer({allowsArrears:true,arrearsPolicy:'30 días'}));
  expect(find(result,'arrearsPolicy').status).toBe('MISSING_DATA');
  expect(find(evaluateOfferCompatibility(app(),offer({allowsArrears:true,arrearsPolicy:'30 días'})),'arrearsPolicy').status).toBe('PASSED');
 });
 it('evaluates exact conditional guarantee thresholds without assuming an unknown type',()=>{
  const source=offer({guarantee:'Sin garantía hasta 1.99 MDP; con garantía hasta 5 MDP'},{maxAmount:5000000});
  const below=app({garantia:'no'});below.credit.amount=1990000;
  expect(evaluateOfferCompatibility(below,source).status).toBe('COMPATIBLE');
  below.credit.amount=1990001;expect(find(evaluateOfferCompatibility(below,source),'guaranteeType').status).toBe('FAILED');
  expect(find(evaluateOfferCompatibility(app({garantia:'si'}),offer({}, {guaranteeType:'por_definir'})),'guaranteeType').status).toBe('MISSING_DATA');
 });
 it('does not turn one generic available guarantor into two guarantors or collateral',()=>{
  expect(find(evaluateOfferCompatibility(app({avalObligadoSolidario:'si'}),offer({}, {avalesType:'dos_avales'})),'avalesType').status).toBe('MISSING_DATA');
  expect(find(evaluateOfferCompatibility(app({avalObligadoSolidario:'si'}),offer({}, {avalesType:'aval_con_inmueble'})),'avalesType').status).toBe('MISSING_DATA');
 });
 it('honours unverified-source flags for newly connected criteria and never uses unrelated bureau scores',()=>{
  const result=evaluateOfferCompatibility(app({buroEmpresa:100,unverifiedFields:['buroEmpresa']}),offer({minBusinessBureau:250}));
  expect(find(result,'businessBureau').status).toBe('MISSING_DATA');
  expect(find(evaluateOfferCompatibility(app({buroAccionistaPrincipal:null,buroPersonaFisica:750}),offer({minShareholderBureau:650})),'shareholderBureau').status).toBe('MISSING_DATA');
 });
 it.each(['no disponible','pendiente','1 mes de venta','-500','NaN'])('does not parse %s as verified monthly income',value=>{
  const result=evaluateOfferCompatibility(app({ingresoMensualPromedio:value,ingresoAnual:null}),offer({minMonthlyIncome:100}));
  expect(find(result,'monthlyRevenue').status).toBe('MISSING_DATA');
 });
 it.each(['pendiente','por definir','no disponible'])('does not infer collateral from unknown declaration %s',garantia=>{
  expect(find(evaluateOfferCompatibility(app({garantia}),offer({}, {guaranteeType:'con_garantia'})),'guaranteeType').status).toBe('MISSING_DATA');
 });

 it('uses corporate and shareholder scores for PM and the personal score for PFAE, PF and Sin SAT',()=>{
  const pm=evaluateOfferCompatibility(app({buroPersonaFisica:null}),offer(allRules));
  expect(pm.status).toBe('COMPATIBLE');expect(find(pm,'personalBureau')).toBeUndefined();
  for(const type of ['fisica_empresarial','fisica','sin_sat']){
    const result=evaluateOfferCompatibility(app({type,buroEmpresa:null,buroAccionistaPrincipal:null}),offer(allRules));
    expect(result.status).toBe('COMPATIBLE');expect(find(result,'businessBureau')).toBeUndefined();expect(find(result,'shareholderBureau')).toBeUndefined();expect(find(result,'personalBureau').status).toBe('PASSED');
  }
 });

 it('never treats undefined imported boolean policies or variable age as absence of a requirement',()=>{
  const result=evaluateOfferCompatibility(app(),offer({requiresCiec:null,requiresFinancialStatements:null,allowsArrears:null,minMonthsInBusiness:null,minMonthsInBusinessSource:'Según operación'}));
  for(const code of ['requiresCiec','requiresFinancialStatements','arrearsPolicy','companyAge'])expect(find(result,code).status).toBe('MISSING_DATA');
  expect(result.status).toBe('INSUFFICIENT_DATA');
 });

});
