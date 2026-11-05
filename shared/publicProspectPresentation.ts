/** Only the prospect's own submitted values are shown. Never include lender-level data. */
export type PublicSummaryItem = { label: string; value: string };
export type PublicDocumentGroup = {
  heading: string;
  description: string;
  items: { title: string; detail?: string }[];
};
export type PublicFinancingSummary = {
  product: string; amount: number; termMonths: number; purpose: string; leasingAssetType?: string;
};
const TYPES: Record<string,string> = {
  persona_moral:"Empresa (persona moral)", fisica_empresarial:"Persona física con actividad empresarial",
  fisica:"Persona física", sin_sat:"Negocio sin SAT / por regularizar",
};
const PRODUCTS: Record<string,string> = {
  simple:"Crédito Simple / Capital de trabajo", revolvente:"Crédito Revolvente",
  factoraje:"Factoraje", arrendamiento:"Arrendamiento",
  hipotecario:"Hipotecario / Garantía inmobiliaria", tpv_anticipo:"Anticipo de ventas (TPV)",
  institucional:"Otro financiamiento",
};
const YES_NO: Record<string,string>={si:"Sí",no:"No","sin-garantia":"No"};
const CREDIT_BUREAU: Record<string,string> = {
  "alto-694-760":"Alto (694–760)","bueno-592-693":"Bueno (592–693)",
  "medio-524-591":"Medio (524–591)","bajo-490-523":"Bajo (490–523)",
  "malo-456-489":"Malo (456–489)",
  "alto-310-400":"Alto (310–400)","bueno-250-309":"Bueno (250–309)",
  "medio-230-249":"Medio (230–249)","bajo-220-229":"Bajo (220–229)",
  "malo-100-219":"Malo (100–219)",
};
const GUARANTEE: Record<string,string> = {
  prendaria:"Sí · garantía prendaria",hipotecaria:"Sí · garantía inmobiliaria",
  otros:"Sí · otro tipo", "sin-garantia":"No",
};
const ASSETS: Record<string,string> = {
  vehiculos:"Vehículos",maquinaria:"Maquinaria / equipo",inmueble:"Inmueble",
  otros:"Otro bien",oficina:"Oficina",departamento:"Departamento",casa:"Casa",
  bodega:"Bodega",terreno:"Terreno",otro:"Otro",
};
function stringValue(value: unknown): string {
  return typeof value==="string" ? value.trim() :
    typeof value==="number" && Number.isFinite(value) ? String(value) : "";
}
function money(value: unknown): string {
  const text=stringValue(value),number=Number(text);
  return text && Number.isFinite(number) ? number.toLocaleString("es-MX",{
    style:"currency", currency:"MXN", maximumFractionDigits:2,
  }) : text;
}
function pretty(value: unknown): string {
  const text=stringValue(value);
  return YES_NO[text] || CREDIT_BUREAU[text] || ASSETS[text] || text;
}
function guaranteeAsset(profile:Record<string,unknown>):string {
  const detail = [profile.garantiaFisicaDetalles,profile.garantiaSinSatDetalles,profile.garantiaDetalles]
    .find(x=>x && typeof x==="object" && !Array.isArray(x)) as Record<string,unknown>|undefined;
  return detail ? pretty(detail.tipoInmueble || detail.tipo) : "";
}
export function buildPublicProspectSummary(
  profile:Record<string,unknown>, financing:PublicFinancingSummary,
):PublicSummaryItem[] {
  const result:PublicSummaryItem[]=[];
  const add=(label:string,value:unknown,format:(v:unknown)=>string = stringValue)=>{
    const display=format(value);
    if(display) result.push({label,value:display});
  };
  add("Tipo de financiamiento",PRODUCTS[financing.product]||financing.product);
  add("Monto solicitado",financing.amount,money);
  add("Plazo deseado",financing.termMonths, v=>v ? String(v)+" meses":"");
  add("Destino del financiamiento",financing.purpose);
  add("Activo para arrendamiento",financing.leasingAssetType,pretty);
  add("Tipo de cliente",TYPES[stringValue(profile.type)]||profile.type);
  add("Razón social",profile.businessName);
  add("Nombre del prospecto",[profile.firstName,profile.lastName].map(stringValue).filter(Boolean).join(" "));
  add("WhatsApp / teléfono",profile.phone);
  add("Correo electrónico",profile.email);
  add("Ingresos mensuales",profile.ingresoMensualPromedio ||
    profile.ingresoMensualPromedioComprobables || profile.ingresoMensualPromedioComprobablesSinSat,money);
  add("Años operando",profile.yearsInBusiness,v=>v!==undefined && v!==null && String(v)!==""?String(v)+" años":"");
  add("Buró aproximado",profile.buroPersonaFisica || profile.buroAccionistaPrincipal,pretty);
  add("Buró de la empresa",profile.buroEmpresa,pretty);
  add("Historial en Buró",profile.buroPersonaFisicaSinSat,pretty);
  add("Atrasos en Buró",profile.atrasosDeudasBuro || profile.atrasosDeudasBuroSinSat || profile.atrasosDeudas,pretty);
  add("Información sobre atrasos",profile.atrasosDeudasBuroDetalles ||
    profile.atrasosDeudasBuroDetallesSinSat || profile.atrasosDetalles);
  const guarantee=profile.cuentaConGarantiaFisica || profile.cuentaConGarantiaSinSat || profile.garantia;
  add("Garantía",GUARANTEE[stringValue(guarantee)]||guarantee);
  add("Tipo de bien en garantía",guaranteeAsset(profile));
  add("Aval / obligado solidario",profile.tieneAvalObligadoSolidarioFisica ||
    profile.tieneAvalObligadoSolidarioSinSat || profile.avalObligadoSolidario,pretty);
  add("Créditos vigentes",profile.creditosVigentes,pretty);
  add("Participación de ventas con gobierno",profile.participacionVentasGobierno);
  add("Ventas con terminal bancaria",profile.ventasTerminalBancaria);
  add("Disposición a conectar SAT",profile.satCiec,pretty);
  add("Estados financieros disponibles",profile.estadosFinancieros,pretty);
  add("Opinión de cumplimiento",profile.opinionCumplimiento,pretty);
  add("Detalle de opinión fiscal",profile.opinionDetalles);
  add("Egresos mensuales",profile.egresoMensualPromedio,money);
  return result;
}
const representativeDocuments:PublicDocumentGroup = {
  heading:"Representante legal", description:"Documentación de la persona representante de la empresa",
  items:[
    {title:"Identificación oficial", detail:"INE vigente"},
    {title:"Comprobante de domicilio", detail:"No mayor a 2 meses; luz o telefonía fija"},
    {title:"Constancia de situación fiscal", detail:"Del mes actual"},
  ],
};
const companyDocuments:PublicDocumentGroup = {
  heading:"Empresa",description:"Documentación empresarial que conviene reunir",
  items:[
    {title:"Estados de cuenta",detail:"Últimos 6 meses, completos y descargados de las aplicaciones; máximo 3 bancos"},
    {title:"Acta constitutiva",detail:"Completa, incluidas asambleas si existen, con registro en RPC"},
    {title:"Constancia de situación fiscal",detail:"Del mes actual"},
    {title:"Comprobante de domicilio de la empresa",detail:"No mayor a 2 meses; luz o telefonía fija"},
    {title:"3 referencias de clientes y 3 de proveedores",detail:"Nombre de la empresa, persona de contacto y teléfono"},
    {title:"3 referencias personales",detail:"Nombre completo, teléfono y parentesco"},
  ],
};
/** The attached document describes the legal representative and the company.
 * Avoid suggesting incorporation documents are required of a physical person.
 */
export function getPublicDocumentGroups(clientType:unknown):PublicDocumentGroup[] {
  if(clientType==="persona_moral") return [representativeDocuments,companyDocuments];
  return [{
    heading:"Documentación inicial orientativa",
    description:"Tu asesor confirmará la lista aplicable a tu perfil",
    items:[
      {title:"Identificación oficial",detail:"Vigente"},
      {title:"Constancia de situación fiscal",detail:"Cuando corresponda, del mes actual"},
      {title:"Comprobante de domicilio",detail:"Reciente, por ejemplo luz o telefonía fija"},
      {title:"Estados de cuenta",detail:"Cuando la financiera los solicite; de preferencia completos"},
    ],
  }];
}
/** The user will provide actual times after reviewing the design.
 * Never publish illustrative ranges as real service level promises.
 */
export const PUBLIC_PROCESS_TIMES = [
  {title:"Contacto y revisión inicial con tu asesor",value:"Por confirmar"},
  {title:"Presentación y selección de alternativas",value:"Por confirmar"},
  {title:"Revisión y respuesta de la financiera",value:"Depende de cada institución"},
] as const;
