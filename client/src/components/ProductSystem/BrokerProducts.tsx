import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Briefcase,
  Coins,
  RefreshCw,
  Building2,
  CreditCard,
  Tractor,
  FileSpreadsheet,
  ArrowRightLeft,
  Construction,
  ArrowLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Building,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Calendar,
  Percent,
  DollarSign,
  ShieldAlert,
  ArrowUpRight,
  Info
} from "lucide-react";
import { InstitutionProductWithTemplate, FinancialInstitution } from "@shared/schema";

interface CategoryDefinition {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  icon: any;
  colorClass: {
    bg: string;
    text: string;
    border: string;
    lightBg: string;
    badge: string;
  };
}

const COMMERCIAL_CATEGORIES: CategoryDefinition[] = [
  {
    id: "capital_trabajo",
    name: "Capital de Trabajo",
    shortName: "Capital de Trabajo",
    tagline: "Liquidez operativa ágil",
    description: "Financiamiento a corto y mediano plazo para compra de inventario, materias primas y operación comercial.",
    icon: Coins,
    colorClass: {
      bg: "bg-blue-600",
      text: "text-blue-700",
      border: "border-blue-200",
      lightBg: "bg-blue-50/70",
      badge: "bg-blue-50 text-blue-700 border-blue-200",
    },
  },
  {
    id: "credito_simple",
    name: "Crédito Simple",
    shortName: "Crédito Simple",
    tagline: "Crecimiento y expansión",
    description: "Préstamos con amortización fija para inversión en activo fijo, consolidación de pasivos o proyectos.",
    icon: Briefcase,
    colorClass: {
      bg: "bg-emerald-600",
      text: "text-emerald-700",
      border: "border-emerald-200",
      lightBg: "bg-emerald-50/70",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  },
  {
    id: "credito_revolvente",
    name: "Crédito Revolvente",
    shortName: "Línea Revolvente",
    tagline: "Tesorería y flujos flexibles",
    description: "Línea de crédito disponible permanentemente con disposiciones y pagos continuos según requerimientos.",
    icon: RefreshCw,
    colorClass: {
      bg: "bg-indigo-600",
      text: "text-indigo-700",
      border: "border-indigo-200",
      lightBg: "bg-indigo-50/70",
      badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
  },
  {
    id: "garantia_inmobiliaria",
    name: "Hipotecario / Garantía Inmobiliaria",
    shortName: "Garantía Inmobiliaria",
    tagline: "Liquidez con respaldo inmueble",
    description: "Créditos comerciales de alto monto respaldados por bienes inmuebles comerciales, industriales o habitacionales.",
    icon: Building2,
    colorClass: {
      bg: "bg-amber-600",
      text: "text-amber-800",
      border: "border-amber-200",
      lightBg: "bg-amber-50/70",
      badge: "bg-amber-50 text-amber-800 border-amber-200",
    },
  },
  {
    id: "flujos_tpv",
    name: "Crédito sobre Flujos / TPV",
    shortName: "Flujos & TPV",
    tagline: "Cobranza y punto de venta",
    description: "Anticipo de capital para comercios basado en el historial de facturación de terminales punto de venta.",
    icon: CreditCard,
    colorClass: {
      bg: "bg-cyan-600",
      text: "text-cyan-800",
      border: "border-cyan-200",
      lightBg: "bg-cyan-50/70",
      badge: "bg-cyan-50 text-cyan-800 border-cyan-200",
    },
  },
  {
    id: "maquinaria_agropecuario",
    name: "Crédito para Maquinaria / Equipo / Agro",
    shortName: "Maquinaria y Agro",
    tagline: "Equipamiento y sector primario",
    description: "Financiamiento especializado para activos productivos, vehículos comerciales y proyectos agropecuarios.",
    icon: Tractor,
    colorClass: {
      bg: "bg-teal-600",
      text: "text-teal-800",
      border: "border-teal-200",
      lightBg: "bg-teal-50/70",
      badge: "bg-teal-50 text-teal-800 border-teal-200",
    },
  },
  {
    id: "arrendamiento",
    name: "Arrendamiento (Leasing)",
    shortName: "Arrendamiento",
    tagline: "Uso y goce con ventaja fiscal",
    description: "Arrendamiento puro o financiero para flotillas, maquinaria pesada y tecnología con deducción al 100%.",
    icon: FileSpreadsheet,
    colorClass: {
      bg: "bg-slate-700",
      text: "text-slate-800",
      border: "border-slate-200",
      lightBg: "bg-slate-100",
      badge: "bg-slate-100 text-slate-800 border-slate-200",
    },
  },
  {
    id: "factoraje",
    name: "Factoraje Financiero",
    shortName: "Factoraje",
    tagline: "Adelanto de cuentas por cobrar",
    description: "Conversión inmediata de facturas comerciales a crédito en efectivo para proveedores de grandes empresas.",
    icon: ArrowRightLeft,
    colorClass: {
      bg: "bg-rose-600",
      text: "text-rose-800",
      border: "border-rose-200",
      lightBg: "bg-rose-50/70",
      badge: "bg-rose-50 text-rose-800 border-rose-200",
    },
  },
  {
    id: "credito_puente",
    name: "Crédito Puente",
    shortName: "Crédito Puente",
    tagline: "Desarrollo y edificación",
    description: "Financiamiento para constructores y promotores de vivienda, oficinas y parques industriales.",
    icon: Construction,
    colorClass: {
      bg: "bg-sky-600",
      text: "text-sky-800",
      border: "border-sky-200",
      lightBg: "bg-sky-50/70",
      badge: "bg-sky-50 text-sky-800 border-sky-200",
    },
  },
];

// Helper to determine product category based on real catalog data
function getProductCategory(p: InstitutionProductWithTemplate): string {
  const tName = (p.template?.name || "").toLowerCase();
  const cName = (p.customName || "").toLowerCase();
  const config = (p.configuration || {}) as Record<string, any>;
  const destinos = Array.isArray(config.destinos) ? config.destinos.join(" ").toLowerCase() : "";

  if (tName.includes("revolvente") || cName.includes("revolvente")) {
    return "credito_revolvente";
  }
  if (tName.includes("flujos") || tName.includes("tpv") || cName.includes("tpv")) {
    return "flujos_tpv";
  }
  if (tName.includes("agropecuario") || cName.includes("agropecuario") || tName.includes("maquinaria")) {
    return "maquinaria_agropecuario";
  }
  if (
    tName.includes("garantia") ||
    tName.includes("garantía") ||
    tName.includes("liquidez") ||
    cName.includes("garantia") ||
    cName.includes("hipotecario")
  ) {
    return "garantia_inmobiliaria";
  }
  if (tName.includes("arrendamiento") || cName.includes("arrendamiento")) {
    return "arrendamiento";
  }
  if (tName.includes("factoraje") || cName.includes("factoraje")) {
    return "factoraje";
  }
  if (tName.includes("puente") || cName.includes("puente")) {
    return "credito_puente";
  }
  if (destinos.includes("capital de trabajo") && !destinos.includes("activo") && !destinos.includes("inversión")) {
    return "capital_trabajo";
  }
  return "credito_simple";
}

// Helpers for format
function formatMoney(val: any): string {
  if (val === undefined || val === null || val === "") return "N/D";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return String(val);
  if (num >= 1000000) {
    const millions = num / 1000000;
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M MXN`;
  }
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(num);
}

function formatPlazo(val: any): string {
  if (!val) return "N/D";
  const num = parseInt(String(val), 10);
  if (isNaN(num)) return String(val);
  if (num <= 10) return `${num} años`;
  return `${num} meses`;
}

function formatRate(val: any): string {
  if (val === undefined || val === null || val === "") return "Variable";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return String(val);
  return `${num}% anual`;
}

function formatFee(val: any): string {
  if (val === undefined || val === null || val === "") return "N/D";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return String(val);
  if (num < 1 && num > 0) {
    return `${(num * 100).toFixed(1)}%`;
  }
  return `${num}%`;
}

const profileLabels: Record<string, string> = {
  persona_moral: "Persona Moral",
  fisica_empresarial: "PFAE",
  fisica: "Persona Física",
  sin_sat: "Sin SAT",
};

interface InstitutionCommercialCardProps {
  institution: FinancialInstitution;
  products: InstitutionProductWithTemplate[];
  onSelectProduct: (prod: InstitutionProductWithTemplate) => void;
  onStartRequest: () => void;
}

function InstitutionCommercialCard({
  institution,
  products,
  onSelectProduct,
  onStartRequest,
}: InstitutionCommercialCardProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const currentProd = products[activeIdx] || products[0];
  const config = (currentProd?.configuration || {}) as Record<string, any>;
  const minAmount = config.montoMinimo || config.montoMin;
  const maxAmount = config.montoMaximo || config.montoMax;
  const term = config.plazo || config.plazoMax;
  const rate = config.tasaInteres || config.tasa;
  const fee = config.comisionApertura || config.comision;
  const prohibitedGiros = config.girosProhibidos;
  const presence = config.presencia;
  const destinos = config.destinos;

  return (
    <Card
      className="overflow-hidden border border-slate-200/80 hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between bg-white"
      data-testid={`financiera-card-${institution.id}`}
    >
      <div>
        {/* Card Header: Institution & Product Selector */}
        <div className="p-4 pb-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-white text-xs flex-shrink-0">
                {institution?.name ? institution.name.substring(0, 2).toUpperCase() : "FI"}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 leading-tight flex items-center gap-1.5" data-testid={`financiera-name-${institution.id}`}>
                  {institution?.name || "Financiera"}
                </h4>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                  {currentProd?.customName || currentProd?.template?.name || "Crédito Empresarial"}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              {(institution as any)?.type && (
                <Badge variant="outline" className="text-[10px] uppercase font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 border-slate-200">
                  {(institution as any).type}
                </Badge>
              )}
              {products.length > 1 && (
                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                  {products.length} opciones
                </Badge>
              )}
            </div>
          </div>

          {/* If institution has multiple products in this category, provide quick tabs */}
          {products.length > 1 && (
            <div className="mt-3 pt-2 border-t border-slate-200/60">
              <span className="text-[11px] font-medium text-slate-400 block mb-1.5">
                Opciones en esta categoría:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {products.map((p, idx) => (
                  <Button
                    key={p.id}
                    type="button"
                    variant={idx === activeIdx ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveIdx(idx)}
                    className={`h-7 text-xs px-2.5 py-0 rounded-lg ${idx === activeIdx ? 'bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
                  >
                    {p.customName || p.template?.name || `Opción ${idx + 1}`}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Profiles */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {(currentProd?.targetProfiles || []).map((prof) => (
              <Badge
                key={prof}
                variant="outline"
                className="text-[10px] px-2 py-0.5 bg-white text-slate-600 border-slate-200 font-medium"
              >
                {profileLabels[prof] || prof}
              </Badge>
            ))}
          </div>
        </div>

        {/* Commercial Conditions Matrix */}
        <div className="p-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-200/60 text-xs">
            <div>
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <DollarSign className="w-3 h-3 text-slate-500" />
                Rango de Monto
              </span>
              <p className="text-xs font-bold text-slate-900 mt-0.5">
                {minAmount || maxAmount
                  ? `${formatMoney(minAmount)} - ${formatMoney(maxAmount)}`
                  : "A convenir"}
              </p>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Calendar className="w-3 h-3 text-slate-500" />
                Plazo
              </span>
              <p className="text-xs font-bold text-slate-900 mt-0.5">
                {term ? `Hasta ${formatPlazo(term)}` : "A convenir"}
              </p>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Percent className="w-3 h-3 text-emerald-600" />
                Tasa Indicativa
              </span>
              <p className="text-xs font-bold text-emerald-700 mt-0.5">
                {rate ? `Desde ${formatRate(rate)}` : "Según análisis"}
              </p>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Coins className="w-3 h-3 text-slate-500" />
                Comisión Apertura
              </span>
              <p className="text-xs font-bold text-slate-900 mt-0.5">
                {fee ? formatFee(fee) : "Consultar"}
              </p>
            </div>
          </div>

          {/* Highlights / Destinos */}
          {Array.isArray(destinos) && destinos.length > 0 && (
            <div className="text-xs space-y-0.5">
              <span className="text-[11px] font-medium text-slate-400">Destinos autorizados:</span>
              <p className="text-xs text-slate-700 line-clamp-1">
                {destinos.join(", ")}
              </p>
            </div>
          )}

          {/* Cobertura */}
          {presence && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">{presence}</span>
            </div>
          )}

          {/* Giros Prohibidos Warning */}
          {prohibitedGiros && (
            <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-lg text-[11px] text-amber-900 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">
                <strong className="font-semibold text-amber-950">Restricciones:</strong> {prohibitedGiros}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Card Action Buttons */}
      <div className="p-4 pt-0 border-t border-slate-100 flex items-center gap-2 bg-slate-50/30">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelectProduct(currentProd)}
          className="flex-1 text-xs h-8 font-semibold text-slate-700 border-slate-200 hover:bg-slate-100"
          data-testid={`button-view-product-${currentProd?.id}`}
        >
          Ver Ficha Completa
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onStartRequest}
          className="flex-1 text-xs h-8 font-semibold bg-slate-900 hover:bg-slate-800 text-white gap-1 shadow-xs"
        >
          Iniciar Solicitud
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}

export default function BrokerProducts() {
  const [, setLocation] = useLocation();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [selectedProfileFilter, setSelectedProfileFilter] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<InstitutionProductWithTemplate | null>(null);

  // Queries
  const { data: institutionProducts = [], isLoading: isLoadingProducts } = useQuery<InstitutionProductWithTemplate[]>({
    queryKey: ["/api/institution-products"],
  });

  const { data: institutions = [], isLoading: isLoadingInstitutions } = useQuery<FinancialInstitution[]>({
    queryKey: ["/api/financial-institutions"],
  });

  // Map of institutions by ID
  const institutionsMap = useMemo(() => {
    const map = new Map<string, FinancialInstitution>();
    institutions.forEach((inst) => map.set(inst.id, inst));
    return map;
  }, [institutions]);

  // Group active products by category
  const productsByCategory = useMemo(() => {
    const map: Record<string, InstitutionProductWithTemplate[]> = {};
    COMMERCIAL_CATEGORIES.forEach((cat) => {
      map[cat.id] = [];
    });

    institutionProducts
      .filter((p) => p.isActive)
      .forEach((p) => {
        const catId = getProductCategory(p);
        if (!map[catId]) {
          map[catId] = [];
        }
        map[catId].push(p);
      });

    return map;
  }, [institutionProducts]);

  // Selected Category Object
  const currentCategory = useMemo(() => {
    return COMMERCIAL_CATEGORIES.find((c) => c.id === selectedCategoryId) || null;
  }, [selectedCategoryId]);

  // Filtered products within selected category
  const categoryProducts = useMemo(() => {
    if (!selectedCategoryId) return [];
    let list = productsByCategory[selectedCategoryId] || [];

    if (selectedProfileFilter !== "all") {
      list = list.filter((p) => (p.targetProfiles || []).includes(selectedProfileFilter));
    }

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      list = list.filter((p) => {
        const inst = institutionsMap.get(p.institutionId);
        const config = (p.configuration || {}) as Record<string, any>;
        const matchName = p.customName?.toLowerCase().includes(q);
        const matchInst = inst?.name?.toLowerCase().includes(q);
        const matchTemplate = p.template?.name?.toLowerCase().includes(q);
        const matchDestinos = Array.isArray(config.destinos) && config.destinos.some((d: string) => d.toLowerCase().includes(q));
        return matchName || matchInst || matchTemplate || matchDestinos;
      });
    }

    return list;
  }, [selectedCategoryId, productsByCategory, selectedProfileFilter, globalSearch, institutionsMap]);

  // Group category products by institution so that 1 institution = 1 main card
  const groupedInstitutions = useMemo(() => {
    const map = new Map<string, {
      institution: FinancialInstitution;
      products: InstitutionProductWithTemplate[];
    }>();

    categoryProducts.forEach((prod) => {
      const inst = institutionsMap.get(prod.institutionId);
      if (!inst) return;
      if (!map.has(inst.id)) {
        map.set(inst.id, { institution: inst, products: [] });
      }
      map.get(inst.id)!.products.push(prod);
    });

    return Array.from(map.values());
  }, [categoryProducts, institutionsMap]);

  if (isLoadingProducts || isLoadingInstitutions) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 1: CATEGORY SELECTION (MAIN VIEW)
  // ==========================================
  if (!selectedCategoryId) {
    return (
      <div className="space-y-6">
        {/* Banner Comercial Institucional */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-7 text-white shadow-sm">
          <div className="max-w-3xl space-y-2.5">
            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-400/20 text-xs px-2.5 py-0.5 font-semibold">
              Catálogo Comercial Multifinanciera
            </Badge>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
              ¿Qué tipo de financiamiento necesita tu cliente?
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              Selecciona la categoría adecuada para consultar las financieras disponibles, sus rangos de monto, tasas
              indicativas y condiciones comerciales.
            </p>
          </div>

          {/* Quick Search */}
          <div className="mt-5 flex flex-col sm:flex-row gap-2.5 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por financiera (ej. Hey Banco, Banorte, Konfío)..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="pl-9 h-9 text-xs bg-slate-800/80 border-slate-700 text-slate-100 placeholder:text-slate-400 focus-visible:ring-slate-500"
              />
            </div>
            {globalSearch && (
              <Button variant="ghost" size="sm" onClick={() => setGlobalSearch("")} className="text-xs h-9 text-slate-300 hover:text-white hover:bg-slate-800">
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Categories Grid */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-600" />
              Categorías de Crédito
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {institutionProducts.length} productos en {institutions.length} financieras
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {COMMERCIAL_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const prods = productsByCategory[cat.id] || [];
              const instCount = new Set(prods.map((p) => p.institutionId)).size;
              const hasProducts = prods.length > 0;

              // Filter if user searched
              const matchesSearch =
                !globalSearch ||
                cat.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
                cat.description.toLowerCase().includes(globalSearch.toLowerCase()) ||
                prods.some((p) => {
                  const inst = institutionsMap.get(p.institutionId);
                  return (
                    p.customName?.toLowerCase().includes(globalSearch.toLowerCase()) ||
                    inst?.name?.toLowerCase().includes(globalSearch.toLowerCase())
                  );
                });

              if (!matchesSearch) return null;

              return (
                <Card
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`group relative overflow-hidden transition-all duration-200 cursor-pointer border border-slate-200/80 hover:shadow-sm hover:border-slate-300 flex flex-col justify-between ${
                    hasProducts ? "bg-white" : "bg-slate-50/50 opacity-80 hover:opacity-100"
                  }`}
                >
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border border-slate-200/80 ${cat.colorClass.lightBg} ${cat.colorClass.text}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {hasProducts ? (
                        <Badge variant="outline" className={`text-[11px] font-semibold ${cat.colorClass.badge}`}>
                          {instCount} {instCount === 1 ? "financiera" : "financieras"} · {prods.length} {prods.length === 1 ? "opción" : "opciones"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-slate-500 bg-slate-50 border-slate-200">
                          En integración
                        </Badge>
                      )}
                    </div>

                    <CardTitle className="text-sm font-semibold text-slate-900 mt-2.5 group-hover:text-slate-950 transition-colors flex items-center justify-between">
                      <span>{cat.name}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-transform" />
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                      {cat.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-4 pt-0">
                    {hasProducts ? (
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex -space-x-1 overflow-hidden">
                          {Array.from(new Set(prods.map((p) => institutionsMap.get(p.institutionId)?.name).filter(Boolean)))
                            .slice(0, 3)
                            .map((name, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-1.5 py-0.5 bg-slate-100 text-[10px] font-medium text-slate-700 rounded border border-white truncate max-w-[85px]"
                              >
                                {name}
                              </span>
                            ))}
                          {instCount > 3 && (
                            <span className="inline-block px-1 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">
                              +{instCount - 3}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1 group-hover:text-slate-900">
                          Ver financieras
                        </span>
                      </div>
                    ) : (
                      <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 italic flex items-center gap-1">
                        <Info className="w-3.5 h-3.5" />
                        Próximamente disponible
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: CATEGORY DETAIL (FINANCIERAS GRID)
  // ==========================================
  const CatIcon = currentCategory?.icon || Briefcase;

  return (
    <div className="space-y-6">
      {/* Navigation Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedCategoryId(null);
              setGlobalSearch("");
              setSelectedProfileFilter("all");
            }}
            className="h-8 gap-1.5 text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a Categorías
          </Button>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200/80 ${currentCategory?.colorClass.lightBg} ${currentCategory?.colorClass.text}`}>
              <CatIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 leading-tight">{currentCategory?.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{currentCategory?.tagline}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs font-semibold ${currentCategory?.colorClass.badge}`}>
            {groupedInstitutions.length} {groupedInstitutions.length === 1 ? "financiera disponible" : "financieras disponibles"} ({categoryProducts.length} {categoryProducts.length === 1 ? "opción" : "opciones"})
          </Badge>
        </div>
      </div>

      {/* Description Callout */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-600">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 leading-relaxed">
          <strong className="text-slate-900 font-semibold">Enfoque Comercial:</strong> {currentCategory?.description}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Filtrar por financiera o producto..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="pl-9 h-8 text-xs border-slate-200 rounded-lg bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-medium text-slate-400 flex-shrink-0 mr-1">Perfil:</span>
          {["all", "persona_moral", "fisica_empresarial", "fisica"].map((prof) => (
            <Button
              key={prof}
              type="button"
              variant={selectedProfileFilter === prof ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedProfileFilter(prof)}
              className={`h-7 text-xs px-2.5 rounded-lg flex-shrink-0 font-medium ${
                selectedProfileFilter === prof 
                  ? "bg-slate-900 text-white" 
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {prof === "all" ? "Todos" : profileLabels[prof] || prof}
            </Button>
          ))}
        </div>
      </div>

      {/* Financieras & Products List */}
      {groupedInstitutions.length === 0 ? (
        <Card className="border border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="p-10 text-center space-y-2.5">
            <Building className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-900">No hay financieras disponibles con estos filtros</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Actualmente no se encontraron opciones en la categoría &ldquo;{currentCategory?.name}&rdquo; con los
              criterios de búsqueda seleccionados.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGlobalSearch("");
                setSelectedProfileFilter("all");
              }}
              className="text-xs mt-2 border-slate-200 text-slate-700"
            >
              Restablecer Filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groupedInstitutions.map(({ institution, products }) => (
            <InstitutionCommercialCard
              key={institution.id}
              institution={institution}
              products={products}
              onSelectProduct={(p) => setSelectedProduct(p)}
              onStartRequest={() => setLocation("/creditos")}
            />
          ))}
        </div>
      )}

      {/* ========================================== */}
      {/* PRODUCT DETAIL DIALOG                      */}
      {/* ========================================== */}
      {selectedProduct && (
        <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
            {(() => {
              const inst = institutionsMap.get(selectedProduct.institutionId);
              const config = (selectedProduct.configuration || {}) as Record<string, any>;
              const minAmount = config.montoMinimo || config.montoMin;
              const maxAmount = config.montoMaximo || config.montoMax;
              const term = config.plazo || config.plazoMax;
              const rate = config.tasaInteres || config.tasa;
              const fee = config.comisionApertura || config.comision;
              const prohibitedGiros = config.girosProhibidos;
              const presence = config.presencia;
              const destinos = config.destinos;

              return (
                <div>
                  <DialogHeader className="p-6 pb-4 border-b bg-muted/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-base">
                          {inst?.name ? inst.name.substring(0, 2).toUpperCase() : "FI"}
                        </div>
                        <div>
                          <DialogTitle className="text-xl font-bold text-foreground">
                            {inst?.name || "Financiera"}
                          </DialogTitle>
                          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                            {selectedProduct.customName || selectedProduct.template?.name || "Producto de Financiamiento"}
                          </DialogDescription>
                        </div>
                      </div>

                      {(inst as any)?.type && (
                        <Badge variant="outline" className="text-xs uppercase font-semibold">
                          {(inst as any).type}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {(selectedProduct.targetProfiles || []).map((prof) => (
                        <Badge key={prof} variant="secondary" className="text-xs">
                          {profileLabels[prof] || prof}
                        </Badge>
                      ))}
                    </div>
                  </DialogHeader>

                  <div className="p-6 space-y-6">
                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/30 border">
                      <div>
                        <span className="text-[11px] text-muted-foreground block font-medium">Monto Mínimo</span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {formatMoney(minAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-muted-foreground block font-medium">Monto Máximo</span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {formatMoney(maxAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-muted-foreground block font-medium">Plazo Máximo</span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {formatPlazo(term)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-muted-foreground block font-medium">Tasa Indicativa</span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                          {formatRate(rate)}
                        </span>
                      </div>
                    </div>

                    {/* Details Sections */}
                    <div className="space-y-4 text-xs">
                      {/* Comisión */}
                      {fee && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground font-medium">Comisión por Apertura</span>
                          <span className="font-bold text-foreground">{formatFee(fee)}</span>
                        </div>
                      )}

                      {/* Cobertura */}
                      {presence && (
                        <div className="py-2 border-b space-y-1">
                          <span className="text-muted-foreground font-medium flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-primary" />
                            Cobertura Geográfica
                          </span>
                          <p className="text-foreground leading-relaxed pl-4">{presence}</p>
                        </div>
                      )}

                      {/* Destinos */}
                      {Array.isArray(destinos) && destinos.length > 0 && (
                        <div className="py-2 border-b space-y-1">
                          <span className="text-muted-foreground font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Destinos de Financiamiento Aprobados
                          </span>
                          <p className="text-foreground leading-relaxed pl-4">{destinos.join(" · ")}</p>
                        </div>
                      )}

                      {/* Giros Prohibidos */}
                      {prohibitedGiros && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-1 text-amber-900 dark:text-amber-200">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            Restricciones y Giros No Participantes
                          </div>
                          <p className="leading-relaxed pl-5 text-[11px]">{prohibitedGiros}</p>
                        </div>
                      )}

                      {/* Template Description */}
                      {selectedProduct.template?.description && (
                        <div className="pt-2">
                          <span className="text-muted-foreground font-medium block mb-1">Descripción del Esquema</span>
                          <p className="text-muted-foreground leading-relaxed">{selectedProduct.template.description}</p>
                        </div>
                      )}
                    </div>

                    {/* Modal Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t">
                      <Button variant="outline" size="sm" onClick={() => setSelectedProduct(null)}>
                        Cerrar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedProduct(null);
                          setLocation("/creditos");
                        }}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                      >
                        Iniciar Solicitud
                        <ArrowUpRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
