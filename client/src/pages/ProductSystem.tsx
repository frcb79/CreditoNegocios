import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ChevronUp, 
  Sliders, 
  Building2, 
  Layers, 
  Link2, 
  Users 
} from "lucide-react";
import ProductVariables from "@/components/ProductSystem/ProductVariables";
import ProductTemplates from "@/components/ProductSystem/ProductTemplates";
import InstitutionProducts from "@/components/ProductSystem/InstitutionProducts";
import BrokerProducts from "@/components/ProductSystem/BrokerProducts";

type TabValue = "templates" | "institution" | "tenant" | "variables";

export default function ProductSystem() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabValue>("tenant");
  const [showAdvancedVariables, setShowAdvancedVariables] = useState(false);

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  // Fetch metrics for overview
  const { data: templates } = useQuery<any[]>({
    queryKey: ['/api/product-templates'],
    enabled: isAdmin,
  });

  const { data: institutions } = useQuery<any[]>({
    queryKey: ['/api/financial-institutions'],
    enabled: isAdmin,
  });

  const { data: institutionProducts } = useQuery<any[]>({
    queryKey: ['/api/institution-products'],
    enabled: isAdmin,
  });

  const { data: tenantProducts } = useQuery<any[]>({
    queryKey: ['/api/tenant-products'],
  });

  // Set initial tab based on role: admins default to templates
  useEffect(() => {
    if (isAdmin) {
      setActiveTab("templates");
    }
  }, [isAdmin]);

  const activeInstitutionsCount = institutions?.filter((i: any) => i.isActive !== false).length ?? '-';

  return (
    <MainLayout>
      <Header 
        title="Catálogo de Productos"
        subtitle={isAdmin 
          ? "Administra el catálogo de productos crediticios y su asignación a financieras"
          : "Explora las opciones de financiamiento por categoría y consulta las condiciones de las financieras"}
      />
        
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Overview Cards (Platform Admins only) */}
          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-slate-200/80 shadow-xs bg-white">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Financieras Activas</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="text-institutions-count">
                      {activeInstitutionsCount}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Registradas en sistema</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200/80 shadow-xs bg-white">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plantillas Base</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="text-templates-count">
                      {templates ? templates.length : '-'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Esquemas crediticios</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200/80 shadow-xs bg-white">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Asignaciones</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="text-institution-products-count">
                      {institutionProducts ? institutionProducts.length : '-'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Productos vinculados</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center flex-shrink-0">
                    <Link2 className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200/80 shadow-xs bg-white">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Catálogo Red</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="text-tenant-products-count">
                      {tenantProducts ? tenantProducts.length : (isAdmin ? 'Todos' : '-')}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Visibles para brókers</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Admin Management Tabs vs Broker Commercial Experience */}
          {isAdmin ? (
            <Card className="border border-slate-200/80 shadow-xs bg-white overflow-hidden">
              <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="w-full">
                  <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-3">
                    <TabsList className="bg-slate-100 p-1 rounded-xl h-10 inline-flex w-auto border border-slate-200/60">
                      <TabsTrigger 
                        value="templates" 
                        data-testid="tab-templates" 
                        className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs rounded-lg px-4 py-1.5 text-slate-600 transition-all"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Plantillas de Producto
                      </TabsTrigger>
                      <TabsTrigger 
                        value="institution" 
                        data-testid="tab-institution" 
                        className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs rounded-lg px-4 py-1.5 text-slate-600 transition-all"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        Asignación a Financieras
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="templates" className="p-6 mt-0">
                    <ProductTemplates />
                  </TabsContent>

                  <TabsContent value="institution" className="p-6 mt-0">
                    <InstitutionProducts />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <BrokerProducts />
            </div>
          )}

          {/* Optional Advanced Variables Section for Admins */}
          {isAdmin && (
            <Collapsible
              open={showAdvancedVariables}
              onOpenChange={setShowAdvancedVariables}
              className="border border-slate-200/80 rounded-xl bg-white p-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-900 block">
                      Configuración Técnica: Variables de Producto (Catálogo Base)
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Metadatos avanzados • No requerido para matching automático
                    </span>
                  </div>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs text-slate-600 hover:text-slate-900 h-8 px-2.5 gap-1">
                    {showAdvancedVariables ? (
                      <>
                        Ocultar <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        Mostrar <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="pt-4 border-t border-slate-100 mt-3">
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Nota: Las reglas principales de matching y ponderación del score se definen directamente en los parámetros de la plantilla y financiera. Las variables a continuación corresponden al catálogo de metadatos general.
                </p>
                <ProductVariables />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </main>
    </MainLayout>
  );
}