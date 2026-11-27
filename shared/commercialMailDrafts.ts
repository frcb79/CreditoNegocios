import {z} from "zod";
export const audiences=["pending_registration","registered_no_requests","individual","newsletter"] as const;
export const commercialMailSchema=z.object({name:z.string().trim().min(3).max(120),audience:z.enum(audiences),recipientIds:z.array(z.string().min(1).max(100)).max(500).optional(),steps:z.array(z.object({day:z.number().int().min(1).max(90),subject:z.string().trim().min(3).max(180),body:z.string().trim().min(10).max(12000),cta:z.enum(["activate","login","reply","none"])}).strict()).min(1).max(12)}).strict().superRefine((v,ctx)=>{
  if(v.audience==="newsletter"&&(v.steps.length!==1||v.steps[0].day!==1))ctx.addIssue({code:"custom",path:["steps"],message:"Cada edición de newsletter contiene un solo envío (día 1)."});
  if(v.audience==="individual"&&(v.recipientIds?.length??0)>1)ctx.addIssue({code:"custom",path:["recipientIds"],message:"El seguimiento individual admite un solo destinatario."});
  if(v.recipientIds && new Set(v.recipientIds).size!==v.recipientIds.length)ctx.addIssue({code:"custom",path:["recipientIds"],message:"No se permiten destinatarios duplicados."});
  if(v.steps.some((s,i)=>i>0&&s.day<=v.steps[i-1].day))ctx.addIssue({code:"custom",path:["steps"],message:"Los días deben ser únicos y ascendentes."});
  if(v.audience==="pending_registration"&&v.steps.some(s=>![25,29,33,39].includes(s.day)||s.cta!=="activate"))ctx.addIssue({code:"custom",path:["steps"],message:"Recuperación: usa días 25, 29, 33, 39 y activación de cuenta."});
  if(v.steps.some(s=>s.cta==="activate"&&v.audience!=="pending_registration"))ctx.addIssue({code:"custom",path:["steps"],message:"El enlace de activación sólo aplica a registros pendientes."});
});
export type CommercialMailDraft=z.infer<typeof commercialMailSchema>;
export const commercialMailStarters:CommercialMailDraft[]=[
{name:"Recuperación de registros",audience:"pending_registration",steps:[
{day:25,subject:"¿Tienes clientes buscando financiamiento?",body:"Hola, {{nombre}}:\n\nEn Crédito Negocios puedes encontrar alternativas de financiamiento para tus clientes en un catálogo de más de 25 instituciones. Comparte tu enlace personal, recibe una evaluación preliminar y gestiona las oportunidades con nuestro equipo.\n\nCompleta tu registro y comienza a generar oportunidades de negocio.",cta:"activate"},
{day:29,subject:"Un enlace puede ser el inicio de tu próxima operación",body:"Hola, {{nombre}}:\n\n¿Conoces alguna empresa que necesite capital o busque arrendamiento? Con tu enlace personal, el prospecto puede ingresar su información y obtener una evaluación preliminar. Tú podrás revisar alternativas y continuar con la gestión.\n\nActiva tu cuenta para encontrar tu enlace dentro de la plataforma.",cta:"activate"},
{day:33,subject:"Convierte contactos en oportunidades de ingresos",body:"Hola, {{nombre}}:\n\nImagina una operación de $1,000,000 MXN con una comisión hipotética del 1.5%: serían $15,000 MXN. El porcentaje y pago reales dependen del producto, la institución, las condiciones asignadas y el desembolso. Es únicamente un ejemplo, no una promesa de ingresos.\n\nActiva tu cuenta y revisemos las oportunidades de tus clientes.",cta:"activate"},
{day:39,subject:"Te acompañamos en tu primera operación",body:"Hola, {{nombre}}:\n\nSi tienes un cliente buscando financiamiento, podemos ayudarte a comenzar. Completa tu acceso o responde a este correo para recibir orientación. Con esto cerramos esta secuencia de seguimiento.",cta:"activate"}]},
{name:"Activación de asesores registrados",audience:"registered_no_requests",steps:[
{day:1,subject:"Tu próxima operación puede comenzar hoy",body:"Hola, {{nombre}}:\n\nTu cuenta ya está registrada. Entra a Crédito Negocios y revisa las herramientas disponibles para encontrar alternativas de financiamiento. Si tienes un prospecto, podemos acompañarte en la gestión.",cta:"login"},
{day:4,subject:"Comparte tu enlace personal con un prospecto",body:"Hola, {{nombre}}:\n\nEncuentra tu enlace personalizado dentro de la plataforma. Compártelo con un cliente que busca crédito para que ingrese su información y obtenga una evaluación preliminar. Después revisa la solicitud y continúa la gestión.",cta:"login"},
{day:8,subject:"Transforma una oportunidad en ingresos comerciales",body:"Hola, {{nombre}}:\n\nUna operación hipotética de $1,000,000 MXN al 1.5% representaría $15,000 MXN de comisión. El ejemplo es ilustrativo; no garantiza ingresos ni representa condiciones ofrecidas. Revisa las condiciones asignadas en la plataforma y registra una oportunidad real.",cta:"login"},
{day:14,subject:"¿Te ayudamos a gestionar tu primera solicitud?",body:"Hola, {{nombre}}:\n\nQueremos ayudarte a comenzar. Si tienes un caso o una duda sobre el proceso, responde a este mensaje. Nuestro objetivo es facilitar tu primera operación.",cta:"reply"}]},
{name:"Seguimiento personalizado — originador activo",audience:"individual",steps:[{day:1,subject:"¿Cómo podemos ayudarte a avanzar tus operaciones?",body:"Hola, {{nombre}}:\n\nGracias por compartir oportunidades con Crédito Negocios. Queremos conocer tu experiencia y ayudarte a avanzar los casos que estás gestionando. ¿Qué te está funcionando y qué necesitas de nuestro equipo para cerrar más operaciones?\n\nCuéntanos también qué tipo de clientes o productos estás trabajando para identificar juntos nuevas oportunidades.",cta:"reply"}]},
{name:"Newsletter comercial",audience:"newsletter",steps:[{day:1,subject:"Oportunidades de negocio con Crédito Negocios",body:"Hola, {{nombre}}:\n\nEsta semana te invitamos a revisar las alternativas disponibles para tus clientes y compartir tu enlace personal. Si tienes una oportunidad, responde a este correo y revisamos el siguiente paso contigo.",cta:"login"}]}
];
export function commercialMailPreview(body:string,name="Asesor de ejemplo"){return body.replace(/\{\{nombre\}\}/g,name);}

/** Import local plain text only. Never execute HTML or accept audience/schedule from a file. */
export function importCommercialNewsletter(raw:string,fileName:string):CommercialMailDraft {
  if(raw.length>24000||!fileName.toLowerCase().endsWith(".txt"))throw Error("Usa un archivo TXT de hasta 24,000 caracteres.");
  const text=raw.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n").trim();
  const match=/^Asunto:[ \t]*([^\n]+)\n+([\s\S]+)$/i.exec(text);
  const subject=match?.[1].trim()||"",body=(match?.[2]||text).trim();
  if(body.length<10||body.length>12000||subject.length>180||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(body))throw Error("Revisa el texto: contenido de 10 a 12,000 caracteres y asunto de hasta 180.");
  const name=fileName.replace(/\.txt$/i,"").trim().slice(0,120);
  return {name:name.length>=3?name:"Nueva edición",audience:"newsletter",steps:[{day:1,subject,body,cta:"login"}]};
}
