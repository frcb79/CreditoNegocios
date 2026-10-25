/**
 * Private artwork transport.
 * Direct binary/image GET requests get rerouted through image infrastructure
 * without session cookies (401), even when their callers set credentials.
 * A JSON POST follows the same authenticated path as administrative requests.
 */
export function commercialArtworkEndpoint(id:string):string{
  return "/api/commercial-resources/templates/"+encodeURIComponent(id)+"/art";
}

const PRIVATE_ARTWORK_JSON="/api/commercial-resources/private-artwork-data";
const ART_PATH=/^\/api\/commercial-resources\/templates\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/art$/i;
const LOGO_PATH="/api/commercial-resources/my-approved-logo";

export async function fetchPrivateCommercialPng(path:string,signal?:AbortSignal):Promise<Blob>{
  const match=ART_PATH.exec(path);
  const request=match?{templateId:match[1]}:
    path===LOGO_PATH?{myLogo:true}:null;
  if(!request)throw new Error("Ruta de imagen comercial no autorizada.");

  const response=await fetch(PRIVATE_ARTWORK_JSON,{
    method:"POST",
    credentials:"include",
    cache:"no-store",
    signal,
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify(request)
  });
  if(response.status===401||response.status===403)
    throw new Error("Tu sesión no permite ver esta imagen. Actualiza la página e inicia sesión nuevamente si persiste.");
  if(!response.ok)
    throw new Error("No se pudo recuperar la imagen privada (HTTP "+response.status+").");
  const payload=await response.json();
  if(payload?.mimeType!=="image/png"||typeof payload.pngBase64!=="string"||
    payload.pngBase64.length<56||payload.pngBase64.length>4_000_100 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.pngBase64)){
    throw new Error("Respuesta de imagen inválida.");
  }
  const binary=atob(payload.pngBase64);
  if(binary.length<40||binary.length>3_000_000)
    throw new Error("El PNG no cumple el tamaño permitido.");
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  if([137,80,78,71,13,10,26,10].some((value,index)=>bytes[index]!==value))
    throw new Error("El archivo recuperado no es PNG.");
  return new Blob([bytes],{type:"image/png"});
}

export async function loadAuthenticatedImage(path:string,signal?:AbortSignal):Promise<HTMLImageElement>{
  const png=await fetchPrivateCommercialPng(path,signal);
  const objectUrl=URL.createObjectURL(png);
  try {
    return await new Promise<HTMLImageElement>((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error("El PNG recibido no pudo abrirse."));
      img.src=objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
