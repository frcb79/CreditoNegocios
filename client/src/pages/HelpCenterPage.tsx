import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import MainLayout from "@/components/MainLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  BookOpen,
  Scale,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  FileText,
  Clock,
  HelpCircle,
  ShieldCheck,
  History,
  Sparkles,
  Users,
  Target,
  DollarSign,
  Repeat,
  Network,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function HelpCenterPage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const isSuperAdmin = user?.role === "super_admin";
  const isMasterBroker = user?.role === "master_broker" || isSuperAdmin || user?.role === "admin";

  // Parsear query params de la URL (?articulo=slug o ?tab=reglas)
  const searchParams = new URLSearchParams(window.location.search);
  const initialArticleSlug = searchParams.get("articulo") || "";
  const initialTab = searchParams.get("tab") || (initialArticleSlug ? "manual" : "manual");

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedArticleSlug, setSelectedArticleSlug] = useState<string>(initialArticleSlug);

  // Modal para nueva versión (Super Admin)
  const [isNewVersionDialogOpen, setIsNewVersionDialogOpen] = useState(false);
  const [newVersionForm, setNewVersionForm] = useState({
    version: "",
    title: "",
    summary: "",
    contentMarkdown: "",
    effectiveDate: new Date().toISOString().split("T")[0],
    isCurrent: true,
    requiresAcknowledgment: true,
  });

  // Consultar versión vigente de Reglas de Operación
  const {
    data: currentRulesData,
    isLoading: isLoadingRules,
    refetch: refetchRules,
  } = useQuery<{
    version: {
      id: string;
      version: string;
      title: string;
      summary: string;
      contentMarkdown: string;
      effectiveDate: string;
      isCurrent: boolean;
      requiresAcknowledgment: boolean;
      createdAt: string;
    };
    hasAcknowledged: boolean;
    acknowledgedAt: string | null;
  }>({
    queryKey: ["/api/operational-rules/current"],
  });

  // Consultar historial de versiones
  const { data: rulesHistory } = useQuery<any[]>({
    queryKey: ["/api/operational-rules/history"],
  });

  // Consultar artículos del Centro de Ayuda
  const { data: articles = [], isLoading: isLoadingArticles } = useQuery<any[]>({
    queryKey: ["/api/help/articles", searchQuery, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (selectedCategory && selectedCategory !== "all") params.set("category", selectedCategory);
      const queryString = params.toString();
      const url = queryString ? `/api/help/articles?${queryString}` : "/api/help/articles";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error al consultar artículos");
      return res.json();
    },
  });

  // Consultar categorías
  const { data: categories = [] } = useQuery<{ id: string; label: string; count: number }[]>({
    queryKey: ["/api/help/categories"],
    queryFn: async () => {
      const res = await fetch("/api/help/categories", { credentials: "include" });
      if (!res.ok) throw new Error("Error al consultar categorías");
      return res.json();
    },
  });

  // Mutación para confirmar lectura y aceptación
  const acknowledgeMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await apiRequest("POST", "/api/operational-rules/acknowledge", {
        ruleVersionId: versionId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Reglas Aceptadas",
        description: "Se ha registrado correctamente tu confirmación de lectura y aceptación.",
      });
      refetchRules();
      queryClient.invalidateQueries({ queryKey: ["/api/operational-rules/current"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "No se pudo registrar la aceptación.",
        variant: "destructive",
      });
    },
  });

  // Mutación para crear nueva versión de reglas (Super Admin)
  const createVersionMutation = useMutation({
    mutationFn: async (payload: typeof newVersionForm) => {
      const res = await apiRequest("POST", "/api/admin/operational-rules", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Versión Creada",
        description: "La nueva versión de Reglas de Operación ha sido publicada con éxito.",
      });
      setIsNewVersionDialogOpen(false);
      refetchRules();
      queryClient.invalidateQueries({ queryKey: ["/api/operational-rules/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operational-rules/current"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error al crear versión",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Sincronizar slug seleccionado cuando cambia la URL
  useEffect(() => {
    const slug = searchParams.get("articulo");
    if (slug) {
      setSelectedArticleSlug(slug);
      setActiveTab("manual");
    }
  }, [window.location.search]);

  // Artículo actualmente abierto en la vista de detalle
  const currentArticle = useMemo(() => {
    if (!selectedArticleSlug || !articles) return null;
    return articles.find((a: any) => a.slug === selectedArticleSlug) || null;
  }, [selectedArticleSlug, articles]);

  const handleSelectArticle = (slug: string) => {
    setSelectedArticleSlug(slug);
    const newParams = new URLSearchParams(window.location.search);
    newParams.set("articulo", slug);
    window.history.replaceState(null, "", `${window.location.pathname}?${newParams.toString()}`);
  };

  const handleClearArticle = () => {
    setSelectedArticleSlug("");
    const newParams = new URLSearchParams(window.location.search);
    newParams.delete("articulo");
    const query = newParams.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  };

  return (
    <MainLayout>
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto pt-14 sm:pt-16 lg:pt-8">
        <div className="space-y-6 pb-12 max-w-6xl mx-auto">
        {/* Encabezado Principal */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider mb-1">
              <Sparkles className="h-4 w-4" />
              <span>Ayuda y Gobernanza Comercial</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Reglas de Operación y Manual de Ayuda
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Consulta las normas de asignación de cartera, vigencia de oportunidades y guías
              paso a paso para resolver trámites dentro de la plataforma.
            </p>
          </div>

          {isSuperAdmin && (
            <Dialog open={isNewVersionDialogOpen} onOpenChange={setIsNewVersionDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 shrink-0" data-testid="button-create-rules-version">
                  <Plus className="h-4 w-4" />
                  <span>Publicar Nueva Versión</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Publicar Nueva Versión de Reglas de Operación</DialogTitle>
                  <DialogDescription>
                    Esta acción creará una nueva versión oficial. Si marcas como versión vigente,
                    reemplazará la vigencia actual conservando el historial.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-foreground">Número de Versión</label>
                      <Input
                        placeholder="e.g. 1.1.0"
                        value={newVersionForm.version}
                        onChange={(e) => setNewVersionForm({ ...newVersionForm, version: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground">Fecha de Entrada en Vigor</label>
                      <Input
                        type="date"
                        value={newVersionForm.effectiveDate}
                        onChange={(e) => setNewVersionForm({ ...newVersionForm, effectiveDate: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-foreground">Título Oficial</label>
                    <Input
                      placeholder="e.g. Reglas de Operación y Protección Comercial de Crédito Negocios"
                      value={newVersionForm.title}
                      onChange={(e) => setNewVersionForm({ ...newVersionForm, title: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-foreground">Resumen de Cambios Principales</label>
                    <Input
                      placeholder="e.g. Se aclaran ventanas de renovación y formalización de tokens digitales."
                      value={newVersionForm.summary}
                      onChange={(e) => setNewVersionForm({ ...newVersionForm, summary: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-foreground">Contenido Completo (Markdown)</label>
                    <Textarea
                      rows={10}
                      placeholder="Escribe el articulado oficial de las reglas en markdown..."
                      value={newVersionForm.contentMarkdown}
                      onChange={(e) => setNewVersionForm({ ...newVersionForm, contentMarkdown: e.target.value })}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newVersionForm.isCurrent}
                        onChange={(e) => setNewVersionForm({ ...newVersionForm, isCurrent: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span>Establecer como versión vigente inmediatamente</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newVersionForm.requiresAcknowledgment}
                        onChange={(e) => setNewVersionForm({ ...newVersionForm, requiresAcknowledgment: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span>Requerir confirmación de lectura y aceptación</span>
                    </label>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsNewVersionDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => createVersionMutation.mutate(newVersionForm)}
                    disabled={
                      createVersionMutation.isPending ||
                      !newVersionForm.version ||
                      !newVersionForm.title ||
                      !newVersionForm.contentMarkdown
                    }
                  >
                    {createVersionMutation.isPending ? "Guardando..." : "Publicar Versión"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Banner de Estado de Aceptación de Reglas Vigentes */}
        {currentRulesData && (
          <div
            className={cn(
              "p-4 rounded-xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4",
              currentRulesData.hasAcknowledged
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-950 dark:text-emerald-100"
                : currentRulesData.version.requiresAcknowledgment
                ? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100"
                : "bg-primary/5 border-primary/20 text-foreground"
            )}
            data-testid="banner-operational-rules-status"
          >
            <div className="flex items-start gap-3">
              {currentRulesData.hasAcknowledged ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              ) : currentRulesData.version.requiresAcknowledgment ? (
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">
                    Reglas de Operación Vigentes: v{currentRulesData.version.version}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider">
                    Vigor: {currentRulesData.version.effectiveDate}
                  </Badge>
                  {currentRulesData.hasAcknowledged ? (
                    <Badge className="bg-emerald-600 text-white text-[10px]">
                      Lectura Aceptada
                    </Badge>
                  ) : currentRulesData.version.requiresAcknowledgment ? (
                    <Badge variant="destructive" className="text-[10px] animate-pulse">
                      Pendiente de Confirmación
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentRulesData.hasAcknowledged
                    ? `Confirmaste tu lectura y aceptación el ${new Date(
                        currentRulesData.acknowledgedAt || ""
                      ).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}.`
                    : currentRulesData.version.requiresAcknowledgment
                    ? "Esta versión oficial requiere tu confirmación de lectura para garantizar la transparencia comercial en la red."
                    : currentRulesData.version.summary}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch md:self-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveTab("reglas");
                  handleClearArticle();
                }}
                className="text-xs w-full md:w-auto"
                data-testid="button-view-rules-text"
              >
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                <span>Leer Reglas</span>
              </Button>

              {currentRulesData.version.requiresAcknowledgment && !currentRulesData.hasAcknowledged && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => acknowledgeMutation.mutate(currentRulesData.version.id)}
                  disabled={acknowledgeMutation.isPending}
                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white w-full md:w-auto font-medium"
                  data-testid="button-acknowledge-rules"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  <span>{acknowledgeMutation.isPending ? "Registrando..." : "Aceptar Reglas"}</span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Pestañas de Navegación del Centro de Ayuda */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 max-w-md w-full">
            <TabsTrigger value="manual" className="gap-2 text-xs" data-testid="tab-manual-uso">
              <BookOpen className="h-4 w-4" />
              <span>Manual de Uso y FAQ</span>
            </TabsTrigger>
            <TabsTrigger value="reglas" className="gap-2 text-xs" data-testid="tab-reglas-operacion">
              <Scale className="h-4 w-4" />
              <span>Reglas de Operación</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: MANUAL DE USO Y FAQ */}
          <TabsContent value="manual" className="space-y-6">
            {/* Si hay un artículo específico seleccionado: Mostrar vista de detalle */}
            {currentArticle ? (
              <Card className="border-border shadow-xs">
                <CardHeader className="pb-4 border-b">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearArticle}
                      className="text-xs gap-1 -ml-2 text-muted-foreground hover:text-foreground"
                      data-testid="button-back-to-articles"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Volver al listado de temas</span>
                    </Button>
                    <Badge variant="secondary" className="text-xs">
                      {currentArticle.categoryLabel}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl sm:text-2xl font-bold mt-2 text-foreground">
                    {currentArticle.title}
                  </CardTitle>
                  {currentArticle.summary && (
                    <CardDescription className="text-sm text-muted-foreground mt-1">
                      {currentArticle.summary}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-line">
                    {currentArticle.contentMarkdown}
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-4 flex justify-between items-center bg-muted/20">
                  <div className="text-xs text-muted-foreground">
                    ¿Tienes dudas adicionales sobre este tema? Contacta a Mesa de Control.
                  </div>
                  <Button variant="outline" size="sm" onClick={handleClearArticle} className="text-xs">
                    Cerrar Artículo
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              <>
                {/* Buscador inteligente en tiempo real */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Escribe tu duda, e.g. cliente ya existe, oportunidad protegida, comisiones..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 text-sm bg-card border-border shadow-xs"
                    data-testid="input-help-search"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {/* Filtro por Categorías */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <Button
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory("all")}
                    className="h-8 text-xs shrink-0 rounded-full"
                    data-testid="filter-category-all"
                  >
                    Todos los temas
                  </Button>
                  {categories?.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={selectedCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(cat.id)}
                      className="h-8 text-xs shrink-0 rounded-full gap-1.5"
                      data-testid={`filter-category-${cat.id}`}
                    >
                      <span>{cat.label}</span>
                      <span className="text-[10px] opacity-70">({cat.count})</span>
                    </Button>
                  ))}
                </div>

                {/* Resultados de Artículos */}
                {isLoadingArticles ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-28 bg-muted/40 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : articles && articles.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {articles.map((article: any) => (
                      <Card
                        key={article.id}
                        onClick={() => handleSelectArticle(article.slug)}
                        data-testid={`card-article-${article.slug}`}
                        className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all group border-border flex flex-col justify-between"
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                              {article.categoryLabel}
                            </Badge>
                            {article.isFaq && (
                              <Badge className="bg-primary/10 text-primary text-[10px] hover:bg-primary/20">
                                FAQ
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-2">
                            {article.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {article.summary}
                          </p>
                        </CardContent>
                        <CardFooter className="p-4 pt-0 flex items-center justify-between text-xs text-primary font-medium">
                          <span>Leer guía</span>
                          <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="text-center py-12 border-dashed">
                    <CardContent className="space-y-3">
                      <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto stroke-1" />
                      <div className="text-sm font-semibold">No se encontraron artículos</div>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        No encontramos coincidencias para "{searchQuery}". Intenta con otros términos
                        como "cliente", "reserva", "oportunidad", "renovación" o "comisiones".
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchQuery("");
                          setSelectedCategory("all");
                        }}
                        className="text-xs mt-2"
                      >
                        Ver todos los temas
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* TAB 2: REGLAS DE OPERACIÓN VIGENTES E HISTORIAL */}
          <TabsContent value="reglas" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Contenido Principal de la Versión Vigente */}
              <div className="lg:col-span-2 space-y-6">
                {isLoadingRules ? (
                  <div className="h-96 bg-muted/40 rounded-xl animate-pulse" />
                ) : currentRulesData ? (
                  <Card className="border-border shadow-xs" data-testid="card-operational-rules-content">
                    <CardHeader className="border-b pb-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 font-semibold text-xs">
                          Versión Oficial {currentRulesData.version.version}
                        </Badge>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Entrada en vigor: {currentRulesData.version.effectiveDate}</span>
                        </div>
                      </div>
                      <CardTitle className="text-xl sm:text-2xl font-extrabold text-foreground mt-2">
                        {currentRulesData.version.title}
                      </CardTitle>
                      <CardDescription className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        {currentRulesData.version.summary}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-line space-y-4">
                        {currentRulesData.version.contentMarkdown}
                      </div>
                    </CardContent>
                    {currentRulesData.version.requiresAcknowledgment && !currentRulesData.hasAcknowledged && (
                      <CardFooter className="border-t pt-4 bg-amber-500/5 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="text-xs text-amber-900 dark:text-amber-200">
                          Se requiere tu confirmación para mantener constancia formal en tu cuenta.
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => acknowledgeMutation.mutate(currentRulesData.version.id)}
                          disabled={acknowledgeMutation.isPending}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs w-full sm:w-auto"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          <span>{acknowledgeMutation.isPending ? "Confirmando..." : "Confirmar Aceptación"}</span>
                        </Button>
                      </CardFooter>
                    )}
                  </Card>
                ) : null}
              </div>

              {/* Barra Lateral: Historial de Versiones */}
              <div className="space-y-4">
                <Card className="border-border shadow-xs">
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-bold">Historial de Versiones</CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                      Consulta versiones previas y registro de cambios normativos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 divide-y">
                    {rulesHistory?.map((ver: any) => (
                      <div
                        key={ver.id}
                        className={cn(
                          "p-3.5 text-xs transition-colors",
                          ver.isCurrent ? "bg-primary/5 font-medium" : "hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-foreground">v{ver.version}</span>
                          {ver.isCurrent ? (
                            <Badge className="bg-primary text-primary-foreground text-[10px] h-4">
                              Vigente
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">{ver.effectiveDate}</span>
                          )}
                        </div>
                        <div className="text-muted-foreground line-clamp-2 leading-relaxed">
                          {ver.summary}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Tarjeta Informativa sobre Mesa de Control */}
                <Card className="border-border shadow-xs bg-muted/20">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                      <Scale className="h-3.5 w-3.5 text-primary" />
                      <span>Resolución y Soporte</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-xs text-muted-foreground leading-relaxed space-y-2">
                    <p>
                      Mesa de Control opera como árbitro neutral en apego a estas reglas publicadas.
                    </p>
                    <p>
                      Cualquier situación especial no contemplada puede ser presentada mediante solicitud formal con evidencia documental verificable.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </main>
    </MainLayout>
  );
}
