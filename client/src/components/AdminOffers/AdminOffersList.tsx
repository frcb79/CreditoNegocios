import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  InstitutionProductWithTemplate, 
  FinancialInstitution 
} from "@shared/schema";
import NewOfferModal from "./NewOfferModal";
import OfferVersionsModal from "./OfferVersionsModal";
import {
  Search,
  Plus,
  Layers,
  GitBranch,
  Building2,
  DollarSign,
  Clock,
  Sparkles,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  Percent,
  Calendar,
  ShieldCheck,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminOffersListProps {
  institutionId?: string;
  institutionName?: string;
  hideHeaderBanner?: boolean;
}

type StatusFilter = "all" | "published" | "draft" | "archived";

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  credito_simple: "Crédito Simple",
  credito_revolvente: "Crédito Revolvente",
  arrendamiento: "Arrendamiento",
  factoraje: "Factoraje",
  credito_puente: "Crédito Puente",
  otro: "Especializado",
};

const PROFILE_SHORT_LABELS: Record<string, string> = {
  persona_moral: "PM",
  fisica_empresarial: "PFAE",
  fisica: "PF",
  sin_sat: "Sin SAT",
};

export default function AdminOffersList({
  institutionId,
  institutionName,
  hideHeaderBanner = false,
}: AdminOffersListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedInstId, setSelectedInstId] = useState<string>(institutionId || "all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [versionModalOffer, setVersionModalOffer] = useState<InstitutionProductWithTemplate | null>(null);

  // Fetch financial institutions for mapping names and filtering
  const { data: institutions = [] } = useQuery<FinancialInstitution[]>({
    queryKey: ["/api/financial-institutions"],
  });

  const institutionMap = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((inst) => {
      map.set(inst.id, inst.name);
    });
    return map;
  }, [institutions]);

  // Fetch products / commercial offers
  const { data: offers = [], isLoading } = useQuery<InstitutionProductWithTemplate[]>({
    queryKey: institutionId 
      ? ["/api/institution-products", { institutionId }] 
      : ["/api/institution-products"],
  });

  // Scope to institution if prop provided or selected in filter
  const scopedOffers = useMemo(() => {
    let result = offers;
    if (institutionId) {
      result = result.filter((o) => o.institutionId === institutionId);
    } else if (selectedInstId !== "all") {
      result = result.filter((o) => o.institutionId === selectedInstId);
    }
    return result;
  }, [offers, institutionId, selectedInstId]);

  // Counts
  const totalCount = scopedOffers.length;
  const publishedCount = scopedOffers.filter((o) => o.status === "published" || (o.status as any) === "active").length;
  const draftCount = scopedOffers.filter((o) => o.status === "draft").length;
  const archivedCount = scopedOffers.filter((o) => o.status === "archived" || o.status === "superseded").length;

  // Filtered by search, status, and product type
  const filteredOffers = useMemo(() => {
    return scopedOffers.filter((offer) => {
      // 1. Status Filter
      if (statusFilter === "published" && offer.status !== "published" && (offer.status as any) !== "active") {
        return false;
      }
      if (statusFilter === "draft" && offer.status !== "draft") {
        return false;
      }
      if (statusFilter === "archived" && offer.status !== "archived" && offer.status !== "superseded") {
        return false;
      }

      // 2. Type Filter
      if (typeFilter !== "all" && offer.productType !== typeFilter) {
        return false;
      }

      // 3. Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const offerName = (offer.name || offer.customName || "").toLowerCase();
        const offerDesc = (offer.description || "").toLowerCase();
        const typeLabel = (PRODUCT_TYPE_LABELS[offer.productType || ""] || offer.productType || "").toLowerCase();
        const instName = (institutionMap.get(offer.institutionId) || "").toLowerCase();

        return (
          offerName.includes(term) ||
          offerDesc.includes(term) ||
          typeLabel.includes(term) ||
          instName.includes(term)
        );
      }

      return true;
    });
  }, [scopedOffers, statusFilter, typeFilter, searchTerm, institutionMap]);

  const formatCurrency = (val: any) => {
    if (val === undefined || val === null || val === "") return "N/D";
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Publicada
          </span>
        );
      case "draft":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Borrador
          </span>
        );
      case "superseded":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Reemplazada
          </span>
        );
      case "archived":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Archivada
          </span>
        );
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-offers-catalog">
      {/* Top Banner & Metrics (Admin Refined v1) */}
      {!hideHeaderBanner && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#101F35] text-white tracking-wide">
                  <Layers className="w-3 h-3 text-[#2463D6]" />
                  Catálogo Comercial
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {institutionName ? `Financiera: ${institutionName}` : "Consolidado de Financieras"}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[#101F35] tracking-tight">
                Ofertas Comerciales y Versiones
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Administración multi-oferta por financiera con control de versiones inmutables y segregación de estados (Borradores / Publicadas).
              </p>
            </div>

            <Button
              onClick={() => setShowNewModal(true)}
              className="bg-[#2463D6] hover:bg-[#1d52b3] text-white text-xs font-semibold h-9 shadow-sm shrink-0 gap-1.5"
              data-testid="button-new-offer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Oferta Comercial</span>
            </Button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <span className="text-[11px] font-medium text-slate-500 block">Total Ofertas</span>
              <span className="text-lg font-bold text-[#101F35] mt-0.5 block">{totalCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <span className="text-[11px] font-medium text-emerald-800 block">Publicadas (Vigentes)</span>
              <span className="text-lg font-bold text-emerald-700 mt-0.5 block">{publishedCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100">
              <span className="text-[11px] font-medium text-amber-800 block">Borradores en Preparación</span>
              <span className="text-lg font-bold text-amber-700 mt-0.5 block">{draftCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <span className="text-[11px] font-medium text-slate-500 block">Archivadas / Reemplazadas</span>
              <span className="text-lg font-bold text-slate-700 mt-0.5 block">{archivedCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: Filters, Search & Type Selector */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row gap-3.5 lg:items-center justify-between">
        {/* Status Pills */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50/80 p-1 shrink-0 overflow-x-auto">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
              statusFilter === "all"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            )}
            data-testid="filter-status-all"
          >
            Todas ({totalCount})
          </button>
          <button
            onClick={() => setStatusFilter("published")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
              statusFilter === "published"
                ? "bg-white text-emerald-800 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            )}
            data-testid="filter-status-published"
          >
            Publicadas ({publishedCount})
          </button>
          <button
            onClick={() => setStatusFilter("draft")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
              statusFilter === "draft"
                ? "bg-white text-amber-800 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            )}
            data-testid="filter-status-draft"
          >
            Borradores ({draftCount})
          </button>
          <button
            onClick={() => setStatusFilter("archived")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
              statusFilter === "archived"
                ? "bg-white text-slate-800 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            )}
            data-testid="filter-status-archived"
          >
            Archivadas ({archivedCount})
          </button>
        </div>

        {/* Search, Type Dropdown, and Optional Institution Dropdown */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 flex-1 lg:max-w-xl lg:justify-end">
          {/* Optional Institution filter in global mode */}
          {!institutionId && institutions.length > 0 && (
            <div className="w-full sm:w-44 shrink-0">
              <Select value={selectedInstId} onValueChange={setSelectedInstId}>
                <SelectTrigger className="h-9 text-xs border-slate-200 bg-slate-50/50">
                  <SelectValue placeholder="Todas las Financieras" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="all" className="text-xs">
                    Todas las Financieras
                  </SelectItem>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id} className="text-xs">
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Product Type Filter */}
          <div className="w-full sm:w-40 shrink-0">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-xs border-slate-200 bg-slate-50/50">
                <SelectValue placeholder="Tipo de Producto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todos los tipos
                </SelectItem>
                {Object.entries(PRODUCT_TYPE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs border-slate-200 bg-slate-50/50 focus:bg-white"
              data-testid="input-search-offers"
            />
          </div>

          {/* If in detail view with hideHeaderBanner, provide quick New Offer button here */}
          {hideHeaderBanner && (
            <Button
              onClick={() => setShowNewModal(true)}
              size="sm"
              className="bg-[#2463D6] hover:bg-[#1d52b3] text-white text-xs h-9 shrink-0 gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Oferta</span>
            </Button>
          )}
        </div>
      </div>

      {/* Offers List Display */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-14 w-full" />
            </div>
          ))}
        </div>
      ) : filteredOffers.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-[#101F35]">
            {totalCount === 0 ? "No hay ofertas comerciales registradas" : "Sin resultados para la búsqueda"}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            {totalCount === 0
              ? "Da de alta la primera oferta comercial para esta institución. Se creará automáticamente en estado Borrador (v1)."
              : "Prueba modificando los filtros de estado o término de búsqueda."}
          </p>
          {totalCount === 0 ? (
            <Button
              onClick={() => setShowNewModal(true)}
              className="bg-[#2463D6] hover:bg-[#1d52b3] text-white text-xs h-8"
              data-testid="button-create-first-offer"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Crear Primera Oferta
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setTypeFilter("all");
              }}
              className="text-xs border-slate-200"
            >
              Limpiar Filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOffers.map((offer) => {
            const instName = institutionMap.get(offer.institutionId) || institutionName || "Financiera";
            const config = (offer.configuration || {}) as any;
            const targetProfiles = offer.targetProfiles || [];
            const typeLabel = PRODUCT_TYPE_LABELS[offer.productType || ""] || offer.productType || "Crédito Comercial";

            return (
              <div
                key={offer.id}
                className={cn(
                  "bg-white border rounded-xl p-5 shadow-xs transition-all flex flex-col justify-between space-y-4 hover:border-slate-300",
                  offer.status === "draft"
                    ? "border-amber-200/70 bg-gradient-to-br from-white to-amber-50/20"
                    : "border-slate-200/90"
                )}
                data-testid={`offer-card-${offer.id}`}
              >
                {/* Header of Card */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#2463D6] bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                          {typeLabel}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          v{offer.currentVersionNumber || 1}
                        </span>
                      </div>
                      <h3
                        className="text-sm sm:text-base font-bold text-[#101F35] leading-snug line-clamp-1"
                        title={offer.name || offer.customName || "Oferta Comercial"}
                      >
                        {offer.name || offer.customName || "Oferta Comercial"}
                      </h3>
                      {!institutionId && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span className="truncate">{instName}</span>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0">{getStatusBadge(offer.status || "draft")}</div>
                  </div>

                  {offer.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mt-1">
                      {offer.description}
                    </p>
                  )}
                </div>

                {/* Conditions Grid Highlight */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50/70 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Monto</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                      {config.minAmount ? formatCurrency(config.minAmount) : "N/D"} — {config.maxAmount ? formatCurrency(config.maxAmount) : "N/D"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Tasa Anual</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block">
                      {config.minInterestRate !== undefined ? `${config.minInterestRate}%` : "N/D"} — {config.maxInterestRate !== undefined ? `${config.maxInterestRate}%` : "N/D"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Plazo</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block">
                      {config.minTermMonths !== undefined ? `${config.minTermMonths}` : "N/D"} — {config.maxTermMonths !== undefined ? `${config.maxTermMonths}m` : "N/D"}
                    </span>
                  </div>
                </div>

                {/* Profiles & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                  {/* Target Profiles */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-slate-400 mr-1 font-medium">Perfiles:</span>
                    {targetProfiles.length > 0 ? (
                      targetProfiles.map((p: string) => (
                        <span
                          key={p}
                          className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200/80"
                        >
                          {PROFILE_SHORT_LABELS[p] || p}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Todos</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVersionModalOffer(offer)}
                      className="h-7 text-[11px] font-medium border-slate-200 text-slate-700 hover:bg-slate-50 gap-1 px-2.5"
                      data-testid={`button-versions-${offer.id}`}
                    >
                      <GitBranch className="w-3 h-3 text-[#2463D6]" />
                      <span>Versiones (v{offer.currentVersionNumber || 1})</span>
                    </Button>

                    {!institutionId && (
                      <Link href={`/financieras/${offer.institutionId}?tab=ofertas`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] text-[#2463D6] hover:bg-blue-50 px-2 gap-1"
                        >
                          <span>Financiera</span>
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <NewOfferModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        defaultInstitutionId={institutionId}
        defaultInstitutionName={institutionName}
      />

      <OfferVersionsModal
        isOpen={!!versionModalOffer}
        onClose={() => setVersionModalOffer(null)}
        offer={versionModalOffer}
        financieraName={
          versionModalOffer
            ? institutionMap.get(versionModalOffer.institutionId) || institutionName
            : institutionName
        }
      />
    </div>
  );
}
