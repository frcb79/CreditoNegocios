import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Sliders } from "lucide-react";
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
        title="Productos"
        subtitle="Administra el catálogo completo de productos crediticios y su asignación a financieras"
      />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                    <i className="fas fa-building text-lg"></i>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Financieras Activas</p>
                    <p className="text-2xl font-black text-gray-900" data-testid="text-institutions-count">
                      {activeInstitutionsCount}
                    </p>
                    <p className="text-[11px] text-gray-400">Registradas en sistema</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                    <i className="fas fa-layer-group text-lg"></i>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Plantillas Producto</p>
                    <p className="text-2xl font-black text-gray-900" data-testid="text-templates-count">
                      {templates ? templates.length : '-'}
                    </p>
                    <p className="text-[11px] text-gray-400">Productos base</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-purple-100 text-purple-700 rounded-xl">
                    <i className="fas fa-link text-lg"></i>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Asignaciones</p>
                    <p className="text-2xl font-black text-gray-900" data-testid="text-institution-products-count">
                      {institutionProducts ? institutionProducts.length : '-'}
                    </p>
                    <p className="text-[11px] text-gray-400">Productos vinculados</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-orange-100 text-orange-700 rounded-xl">
                    <i className="fas fa-users text-lg"></i>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Catálogo Red</p>
                    <p className="text-2xl font-black text-gray-900" data-testid="text-tenant-products-count">
                      {tenantProducts ? tenantProducts.length : (isAdmin ? 'Todos' : '-')}
                    </p>
                    <p className="text-[11px] text-gray-400">Disponibles para brókers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs for different product levels */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="w-full">
                <div className="border-b border-border bg-card px-6 py-4">
                  <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {isAdmin && (
                      <TabsTrigger value="templates" data-testid="tab-templates" className="font-semibold">
                        <i className="fas fa-layer-group mr-2"></i>
                        Plantillas de Producto
                      </TabsTrigger>
                    )}
                    {isAdmin && (
                      <TabsTrigger value="institution" data-testid="tab-institution" className="font-semibold">
                        <i className="fas fa-building mr-2"></i>
                        Asignación a Financieras
                      </TabsTrigger>
                    )}
                    {!isAdmin && (
                      <TabsTrigger value="tenant" data-testid="tab-tenant" className="font-semibold">
                        <i className="fas fa-users mr-2"></i>
                        Mi Catálogo
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                {isAdmin && (
                  <TabsContent value="templates" className="p-6">
                    <ProductTemplates />
                  </TabsContent>
                )}

                {isAdmin && (
                  <TabsContent value="institution" className="p-6">
                    <InstitutionProducts />
                  </TabsContent>
                )}

                {!isAdmin && (
                  <TabsContent value="tenant" className="p-6">
                    <BrokerProducts />
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>

          {/* Optional Advanced Variables Section for Admins */}
          {isAdmin && (
            <Collapsible
              open={showAdvancedVariables}
              onOpenChange={setShowAdvancedVariables}
              className="border border-dashed border-gray-300 rounded-xl bg-gray-50/50 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700">
                    Configuración Técnica: Variables de Producto (Catálogo Base)
                  </span>
                  <span className="text-[10px] text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                    Avanzado / No requerido para el matching
                  </span>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs text-gray-500 h-7 px-2">
                    {showAdvancedVariables ? (
                      <>
                        Ocultar <ChevronUp className="w-3.5 h-3.5 ml-1" />
                      </>
                    ) : (
                      <>
                        Mostrar <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="pt-4 border-t border-gray-200 mt-3">
                <p className="text-xs text-gray-500 mb-4">
                  Nota: Las reglas principales de matching y ponderación del score se definen directamente en los parámetros de la plantilla y financiera. Las variables a continuación corresponden al catálogo de metadatos general.
                </p>
                <ProductVariables />
              </CollapsibleContent>
            </Collapsible>
          )}
        </main>
    </MainLayout>
  );
}