import type { PublishedCommercialTemplate } from "@/lib/commercialResources";
import {
  COMMERCIAL_STYLES, commercialProductName, commercialFormat,
  filterCommercialTemplates, type CommercialLibraryFilters
} from "@/lib/commercialLibrary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

export const INITIAL_LIBRARY_FILTERS:CommercialLibraryFilters = {
  search:"", product:"all", format:"all", style:"all", status:"all"
};

type Props={
  templates:PublishedCommercialTemplate[];
  filters:CommercialLibraryFilters;
  onChange:(next:CommercialLibraryFilters)=>void;
  includeStatus?:boolean;
};

export default function CommercialLibraryToolbar({templates,filters,onChange,includeStatus=false}:Props){
  const products=Array.from(new Set(templates.map(t=>t.product)));
  const results=filterCommercialTemplates(templates,filters);
  const set=(part:Partial<CommercialLibraryFilters>)=>onChange({...filters,...part});
  const chooseStyle=[
    {value:"all",label:"Todos los estilos"},
    ...COMMERCIAL_STYLES,
    ...(includeStatus?[{value:"unclassified",label:"Sin clasificar"}]:[])
  ];
  return <div className="space-y-3" data-testid="commercial-library-toolbar">
    <div className="relative">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input aria-label="Buscar plantillas" placeholder="Buscar por nombre, producto o tema…"
        className="pl-9" value={filters.search}
        onChange={e=>set({search:e.target.value})} data-testid="commercial-library-search" />
    </div>
    <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por producto">
      <Button size="sm" type="button" variant={filters.product==="all"?"default":"outline"}
        aria-pressed={filters.product==="all"} onClick={()=>set({product:"all"})}>Todos</Button>
      {products.map(product=><Button key={product} size="sm" type="button"
        variant={filters.product===product?"default":"outline"}
        aria-pressed={filters.product===product} onClick={()=>set({product})}>
        {commercialProductName(product)}
      </Button>)}
    </div>
    <div className={"grid gap-2 grid-cols-2 "+(includeStatus?"lg:grid-cols-3":"")}>
      <label className="block text-xs font-medium space-y-1">
        <span>Formato</span>
        <select aria-label="Formato" className="w-full h-9 rounded-md border bg-background px-2 text-xs"
          value={filters.format} onChange={e=>set({format:e.target.value})} data-testid="commercial-library-format">
          <option value="all">Todos los formatos</option>
          <option value="4:5">Publicación 4:5</option>
          <option value="1:1">Cuadrada 1:1</option>
          <option value="9:16">Historia 9:16</option>
        </select>
      </label>
      <label className="block text-xs font-medium space-y-1">
        <span>Estilo</span>
        <select aria-label="Estilo" className="w-full h-9 rounded-md border bg-background px-2 text-xs"
          value={filters.style} onChange={e=>set({style:e.target.value})} data-testid="commercial-library-style">
          {chooseStyle.map(style=><option key={style.value} value={style.value}>{style.label}</option>)}
        </select>
      </label>
      {includeStatus&&<label className="block text-xs font-medium space-y-1 col-span-2 lg:col-span-1">
        <span>Estado</span>
        <select aria-label="Estado" className="w-full h-9 rounded-md border bg-background px-2 text-xs"
          value={filters.status||"all"} onChange={e=>set({status:e.target.value})}
          data-testid="commercial-library-status">
          <option value="all">Todos los estados</option>
          <option value="draft">Borradores</option>
          <option value="published">Publicadas</option>
          <option value="retired">Retiradas</option>
        </select>
      </label>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground" data-testid="commercial-library-result-count">
        {results.length} de {templates.length} {templates.length===1?"plantilla":"plantillas"}
      </p>
      {(filters.search || filters.product!=="all" || filters.format!=="all" ||
        filters.style!=="all" || (filters.status && filters.status!=="all")) && (
        <Button size="sm" variant="ghost" type="button" onClick={()=>onChange({...INITIAL_LIBRARY_FILTERS})}>
          <X className="h-3.5 w-3.5 mr-1" /> Limpiar filtros
        </Button>
      )}
    </div>
  </div>;
}
