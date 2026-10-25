/**
 * Private commercial images must be fetched with the user's authenticated
 * session. Browser image-optimization proxies can strip credentials from
 * plain <img src="/api/..."> requests, causing 401 for draft artwork.
 *
 * Never make draft artwork public to fix this. Preserve private, no-store
 * semantics, and expose a temporary object URL only within this browser.
 */
export function commercialArtworkEndpoint(id:string):string{
  return "/api/commercial-resources/templates/"+encodeURIComponent(id)+"/art";
}

export async function fetchPrivateCommercialPng(path:string,signal?:AbortSignal):Promise<Blob>{
  if(!path.startsWith("/api/commercial-resources/") || path.includes("..") ||
    path.includes("://") || path.includes("?")) {
    throw new Error("Ruta de imagen comercial no autorizada.");
  }
  const response=await fetch(path,{credentials:"include",cache:"no-store",signal,
    headers:{Accept:"image/png"}});
  if(response.status===401||response.status===403) {
    throw new Error("No se pudo cargar la imagen con tu sesión. Actualiza la página e inicia sesión de nuevo si persiste.");
  }
  if(!response.ok)throw new Error("No se pudo cargar la imagen (HTTP "+response.status+").");
  const type=response.headers.get("content-type")?.toLowerCase()||"";
  if(!type.startsWith("image/png"))throw new Error("La respuesta no es un PNG válido.");
  const blob=await response.blob();
  if(blob.size<40||blob.size>3_000_000)throw new Error("El PNG no cumple con el tamaño permitido.");
  return blob;
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
