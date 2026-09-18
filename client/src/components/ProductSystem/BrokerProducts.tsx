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
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-800",
      lightBg: "bg-blue-50 dark:bg-blue-950/40",
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
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
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
      lightBg: "bg-emerald-50 dark:bg-emerald-950/40",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
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
      bg: "bg-purple-600",
      text: "text-purple-600 dark:text-purple-400",
      border: "border-purple-200 dark:border-purple-800",
      lightBg: "bg-purple-50 dark:bg-purple-950/40",
      badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
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
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-800",
      lightBg: "bg-amber-50 dark:bg-amber-950/40",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
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
      text: "text-cyan-600 dark:text-cyan-400",
      border: "border-cyan-200 dark:border-cyan-800",
      lightBg: "bg-cyan-50 dark:bg-cyan-950/40",
      badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
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
      text: "text-teal-600 dark:text-teal-400",
      border: "border-teal-200 dark:border-teal-800",
      lightBg: "bg-teal-50 dark:bg-teal-950/40",
      badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
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
      bg: "bg-slate-600",
      text: "text-slate-600 dark:text-slate-400",
      border: "border-slate-200 dark:border-slate-800",
      lightBg: "bg-slate-50 dark:bg-slate-950/40",
      badge: "bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300",
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
      text: "text-rose-600 dark:text-rose-400",
      border: "border-rose-200 dark:border-rose-800",
      lightBg: "bg-rose-50 dark:bg-rose-950/40",
      badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
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
      text: "text-sky-600 dark:text-sky-400",
      border: "border-sky-200 dark:border-sky-800",
      lightBg: "bg-sky-50 dark:bg-sky-950/40",
      badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
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
      <div className="space-y-8">
        {/* Banner Comercial */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-background border border-primary/20 p-6 sm:p-8">
          <div className="max-w-3xl space-y-3">
            <Badge className="bg-primary/20 text-primary border-primary/30 text-xs px-2.5 py-0.5">
              Catálogo Comercial Multifinanciera
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              ¿Qué tipo de financiamiento necesita tu cliente?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Selecciona la categoría adecuada para consultar las financieras disponibles, sus rangos de monto, tasas
              indicativas y condiciones comerciales.
            </p>
          </div>

          {/* Quick Search */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por financiera (ej. Hey Banco, Banorte, Konfío)..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="pl-10 h-11 bg-background/90 shadow-xs"
              />
            </div>
            {globalSearch && (
              <Button variant="ghost" size="sm" onClick={() => setGlobalSearch("")} className="text-xs h-11">
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Categories Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-primary" />
              Categorías de Crédito
            </h3>
            <span className="text-xs text-muted-foreground font-medium">
              {institutionProducts.length} productos registrados en {institutions.length} financieras
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
                  className={`group relative overflow-hidden transition-all duration-200 cursor-pointer border hover:shadow-md hover:border-primary/50 flex flex-col justify-between ${
                    hasProducts ? "bg-card" : "bg-muted/10 opacity-75 hover:opacity-100"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`p-3 rounded-xl ${cat.colorClass.lightBg} ${cat.colorClass.text}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      {hasProducts ? (
                        <Badge variant="outline" className={`text-xs font-semibold ${cat.colorClass.badge}`}>
                          {instCount} {instCount === 1 ? "financiera" : "financieras"} · {prods.length} {prods.length === 1 ? "opción" : "opciones"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground bg-muted/30">
                          En integración
                        </Badge>
                      )}
                    </div>

                    <CardTitle className="text-lg font-bold text-foreground mt-3 group-hover:text-primary transition-colors flex items-center justify-between">
                      <span>{cat.name}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-transform" />
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {cat.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-0 pb-4">
                    {hasProducts ? (
                      <div className="mt-2 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                        <div className="flex -space-x-1 overflow-hidden">
                          {Array.from(new Set(prods.map((p) => institutionsMap.get(p.institutionId)?.name).filter(Boolean)))
                            .slice(0, 3)
                            .map((name, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-1.5 py-0.5 bg-muted text-[10px] font-medium text-foreground rounded border border-background truncate max-w-[90px]"
                              >
                                {name}
                              </span>
                            ))}
                          {instCount > 3 && (
                            <span className="inline-block px-1 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded">
                              +{instCount - 3}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-primary flex items-center gap-1 group-hover:underline">
                          Ver financieras
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 pt-3 border-t border-border/40 text-[11px] text-muted-foreground italic flex items-center gap-1">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedCategoryId(null);
              setGlobalSearch("");
              setSelectedProfileFilter("all");
            }}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Categorías
          </Button>

          <div className="h-5 w-px bg-border" />

          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${currentCategory?.colorClass.lightBg} ${currentCategory?.colorClass.text}`}>
              <CatIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground leading-none">{currentCategory?.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{currentCategory?.tagline}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${currentCategory?.colorClass.badge}`}>
            {categoryProducts.length} {categoryProducts.length === 1 ? "opción disponible" : "opciones disponibles"}
          </Badge>
        </div>
      </div>

      {/* Description Callout */}
      <div className="p-4 rounded-xl bg-muted/40 border border-border/80 flex items-start gap-3 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <strong className="text-foreground">Enfoque Comercial:</strong> {currentCategory?.description}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por financiera o producto..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-medium text-muted-foreground flex-shrink-0">Perfil de cliente:</span>
          {["all", "persona_moral", "fisica_empresarial", "fisica"].map((prof) => (
            <Button
              key={prof}
              type="button"
              variant={selectedProfileFilter === prof ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedProfileFilter(prof)}
              className="h-8 text-xs flex-shrink-0"
            >
              {prof === "all" ? "Todos" : profileLabels[prof] || prof}
            </Button>
          ))}
        </div>
      </div>

      {/* Financieras & Products List */}
      {categoryProducts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-3">
            <Building className="w-12 h-12 text-muted-foreground mx-auto opacity-40" />
            <h4 className="text-base font-bold text-foreground">No hay financieras disponibles con estos filtros</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
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
              className="text-xs mt-2"
            >
              Restablecer Filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {categoryProducts.map((prod) => {
            const inst = institutionsMap.get(prod.institutionId);
            const config = (prod.configuration || {}) as Record<string, any>;
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
                key={prod.id}
                className="overflow-hidden border hover:border-primary/60 hover:shadow-md transition-all flex flex-col justify-between bg-card"
              >
                <div>
                  {/* Card Header: Institution & Product */}
                  <div className="p-5 pb-4 border-b bg-muted/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                          {inst?.name ? inst.name.substring(0, 2).toUpperCase() : "FI"}
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-foreground leading-tight flex items-center gap-1.5">
                            {inst?.name || "Financiera"}
                          </h4>
                          <span className="text-xs text-muted-foreground line-clamp-1">
                            {prod.customName || prod.template?.name || "Crédito Empresarial"}
                          </span>
                        </div>
                      </div>

                      {(inst as any)?.type && (
                        <Badge variant="secondary" className="text-[10px] uppercase font-semibold px-2 py-0.5">
                          {(inst as any).type}
                        </Badge>
                      )}
                    </div>

                    {/* Profiles */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {(prod.targetProfiles || []).map((prof) => (
                        <Badge
                          key={prof}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 bg-background text-muted-foreground border-border"
                        >
                          {profileLabels[prof] || prof}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Commercial Conditions Matrix */}
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border text-xs">
                      <div>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                          <DollarSign className="w-3 h-3 text-primary" />
                          Rango de Monto
                        </span>
                        <p className="text-xs font-bold text-foreground mt-0.5">
                          {minAmount || maxAmount
                            ? `${formatMoney(minAmount)} - ${formatMoney(maxAmount)}`
                            : "A convenir"}
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                          <Calendar className="w-3 h-3 text-primary" />
                          Plazo
                        </span>
                        <p className="text-xs font-bold text-foreground mt-0.5">
                          {term ? `Hasta ${formatPlazo(term)}` : "A convenir"}
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                          <Percent className="w-3 h-3 text-primary" />
                          Tasa Indicativa
                        </span>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {rate ? `Desde ${formatRate(rate)}` : "Según análisis"}
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                          <Coins className="w-3 h-3 text-primary" />
                          Comisión Apertura
                        </span>
                        <p className="text-xs font-bold text-foreground mt-0.5">
                          {fee ? formatFee(fee) : "Consultar"}
                        </p>
                      </div>
                    </div>

                    {/* Highlights / Destinos */}
                    {Array.isArray(destinos) && destinos.length > 0 && (
                      <div className="text-xs space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">Destinos permitidos:</span>
                        <p className="text-xs text-foreground line-clamp-1">
                          {destinos.join(", ")}
                        </p>
                      </div>
                    )}

                    {/* Cobertura */}
                    {presence && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="truncate">{presence}</span>
                      </div>
                    )}

                    {/* Giros Prohibidos Warning */}
                    {prohibitedGiros && (
                      <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-md text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          <strong>Restricciones:</strong> {prohibitedGiros}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="p-4 pt-0 border-t bg-muted/10 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedProduct(prod)}
                    className="flex-1 text-xs h-9"
                  >
                    Ver Ficha Completa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setLocation("/creditos")}
                    className="flex-1 text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground gap-1"
                  >
                    Iniciar Solicitud
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
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
