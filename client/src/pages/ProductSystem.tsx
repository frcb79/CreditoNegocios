import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductVariables from "@/components/ProductSystem/ProductVariables";
import ProductTemplates from "@/components/ProductSystem/ProductTemplates";
import InstitutionProducts from "@/components/ProductSystem/InstitutionProducts";
import BrokerProducts from "@/components/ProductSystem/BrokerProducts";

type TabValue = "variables" | "templates" | "institution" | "tenant";

export default function ProductSystem() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabValue>("tenant");

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const isTenantUser = user?.role === 'master_broker' || user?.role === 'broker';

  // Fetch product templates count for overview
  const { data: templates } = useQuery<any[]>({
    queryKey: ['/api/product-templates'],
    enabled: isAdmin,
  });

  // Set initial tab based on role
  useEffect(() => {
    if (isAdmin) {
      setActiveTab("variables");
    }
  }, [isAdmin]);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Productos"
          subtitle="Administra el catálogo completo de productos crediticios"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <i className="fas fa-cogs text-blue-600"></i>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Variables</p>
                    <p className="text-2xl font-bold" data-testid="text-variables-count">8</p>
                    <p className="text-xs text-gray-500">Catálogo base</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <i className="fas fa-layer-group text-green-600"></i>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Plantilla Producto</p>
                    <p className="text-2xl font-bold" data-testid="text-templates-count">
                      {templates ? templates.length : '-'}
                    </p>
                    <p className="text-xs text-gray-500">Productos base</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <i className="fas fa-building text-purple-600"></i>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Asignación</p>
                    <p className="text-2xl font-bold" data-testid="text-institution-products-count">-</p>
                    <p className="text-xs text-gray-500">Productos asignados</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <i className="fas fa-users text-orange-600"></i>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tenant</p>
                    <p className="text-2xl font-bold" data-testid="text-tenant-products-count">-</p>
                    <p className="text-xs text-gray-500">Personalizados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>


          {/* Tabs for different product levels */}
          <Card>
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="w-full">
                <div className="border-b bg-white px-6 py-4">
                  <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-3' : 'grid-cols-1'}`}>
                    {isAdmin && (
                      <TabsTrigger value="variables" data-testid="tab-variables">
                        <i className="fas fa-cogs mr-2"></i>
                        Variables
                      </TabsTrigger>
                    )}
                    {isAdmin && (
                      <TabsTrigger value="templates" data-testid="tab-templates">
                        <i className="fas fa-layer-group mr-2"></i>
                        Plantilla Producto
                      </TabsTrigger>
                    )}
                    {isAdmin && (
                      <TabsTrigger value="institution" data-testid="tab-institution">
                        <i className="fas fa-building mr-2"></i>
                        Asignación
                      </TabsTrigger>
                    )}
                    {!isAdmin && (
                      <TabsTrigger value="tenant" data-testid="tab-tenant">
                        <i className="fas fa-users mr-2"></i>
                        Mi Catálogo
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                {isAdmin && (
                  <TabsContent value="variables" className="p-6">
                    <ProductVariables />
                  </TabsContent>
                )}

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
        </main>
      </div>
    </div>
  );
}