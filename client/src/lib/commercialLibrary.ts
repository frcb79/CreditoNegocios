import type { PublishedCommercialTemplate } from "./commercialResources";
import { imageSize } from "./commercialResources";

export const COMMERCIAL_STYLES = [
  { value: "llamativo", label: "Llamativo" },
  { value: "explicativo", label: "Explicativo" },
  { value: "institucional", label: "Institucional" },
  { value: "promocional", label: "Promocional" },
  { value: "informativo", label: "Informativo" },
] as const;
export type CommercialStyle = typeof COMMERCIAL_STYLES[number]["value"];
export type CommercialFormat = "4:5" | "1:1" | "9:16";

export const COMMERCIAL_PRODUCTS: Readonly<Record<string,string>> = {
  simple: "Crédito Simple",
  revolvente: "Crédito Revolvente",
  factoraje: "Factoraje",
  arrendamiento: "Arrendamiento",
  hipotecario: "Hipotecario",
  tpv_anticipo: "Anticipo TPV",
  institucional: "Campañas generales"
};

export function commercialProductName(product:string):string {
  return COMMERCIAL_PRODUCTS[product] || product;
}
export function commercialStyleLabel(style:string|null|undefined):string {
  return COMMERCIAL_STYLES.find(item=>item.value===style)?.label || "Sin clasificar";
}
export function commercialFormat(template:PublishedCommercialTemplate):CommercialFormat {
  const size=template.definition.graphic?.canvas || imageSize(template.channel);
  if(size.height>=size.width*1.6)return "9:16";
  if(size.height>size.width*1.1)return "4:5";
  return "1:1";
}
export function commercialFormatLabel(format:CommercialFormat):string {
  return ({ "4:5":"Vertical 4:5", "1:1":"Cuadrada 1:1", "9:16":"Historia 9:16" })[format];
}
export function commercialThumbSrc(template:PublishedCommercialTemplate):string {
  // Same-origin authenticated art: draft artwork is only visible to Super Admin.
  // Never prefetch drafts for Brokers or expose binary data inside JSON lists.
  return template.definition.graphic
    ? "/api/commercial-resources/templates/"+encodeURIComponent(template.id)+"/art"
    : "";
}
export type CommercialLibraryFilters = {
  search:string; product:string; format:string; style:string; status?:string
};
export function filterCommercialTemplates(
  templates:PublishedCommercialTemplate[], filters:CommercialLibraryFilters
):PublishedCommercialTemplate[] {
  const normalizeSearch=(value:string)=>value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es-MX");
  const search=normalizeSearch(filters.search.trim());
  return templates.filter(item=>{
    if(filters.product!=="all" && item.product!==filters.product)return false;
    if(filters.format!=="all" && commercialFormat(item)!==filters.format)return false;
    if(filters.style!=="all" && (item.style || "unclassified")!==filters.style)return false;
    if(filters.status && filters.status!=="all" && item.status!==filters.status)return false;
    return !search || [
      item.name,item.slug,commercialProductName(item.product),item.product,
      item.channel,commercialFormatLabel(commercialFormat(item)),commercialStyleLabel(item.style),
      item.definition.headline,item.definition.supportingLine,item.definition.description,
      item.definition.hook,item.definition.cta,...item.definition.highlights
    ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLocaleLowerCase("es-MX").includes(search);
  });
}
