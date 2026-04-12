import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InstitutionProductWithTemplate } from "@shared/schema";

export default function BrokerProducts() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<InstitutionProductWithTemplate | null>(null);

  const { data: institutionProducts = [], isLoading } = useQuery<InstitutionProductWithTemplate[]>({
    queryKey: ['/api/institution-products'],
  });

  // Filter only active products and search
  const filteredProducts = institutionProducts
    .filter(p => p.isActive)
    .filter(p => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        p.customName?.toLowerCase().includes(searchLower) ||
        p.template?.name?.toLowerCase().includes(searchLower) ||
        p.template?.description?.toLowerCase().includes(searchLower)
      );
    });

  const categoryColors: Record<string, string> = {
    persona_moral: 'bg-blue-100 text-blue-700',
    fisica_empresarial: 'bg-green-100 text-green-700',
    fisica: 'bg-orange-100 text-orange-700',
    sin_sat: 'bg-gray-100 text-gray-700',
  };

  const categoryNames: Record<string, string> = {
    persona_moral: 'Persona Moral',
    fisica_empresarial: 'PFAE',
    fisica: 'Persona Física',
    sin_sat: 'Sin SAT',
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">Productos Disponibles</h3>
        <p className="text-gray-600 mb-4">
          Explora los productos crediticios activos que puedes ofrecer a tus clientes
        </p>

        {/* Search */}
        <Input
          placeholder="Buscar productos por nombre o descripción..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
          data-testid="input-search-products"
        />
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <i className="fas fa-box-open text-6xl text-gray-300 mb-4"></i>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {institutionProducts.length === 0 
                  ? "No hay productos disponibles"
                  : "No se encontraron productos"
                }
              </h3>
              <p className="text-gray-600">
                {institutionProducts.length === 0 
                  ? "Los productos estarán disponibles una vez que los administradores configuren el catálogo."
                  : "Intenta con otros términos de búsqueda."
                }
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <Card 
              key={product.id} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedProduct(product)}
              data-testid={`product-card-${product.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">
                      {product.customName || product.template?.name || 'Producto'}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2">
                      {product.targetProfiles && product.targetProfiles.map((profile: string) => (
                        <Badge 
                          key={profile}
                          variant="outline" 
                          className={`text-xs ${categoryColors[profile] || 'bg-gray-100 text-gray-700'}`}
                        >
                          {categoryNames[profile] || profile}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <i className="fas fa-arrow-right text-gray-400 ml-2"></i>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                {product.template?.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {product.template.description}
                  </p>
                )}
                
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <i className="fas fa-info-circle"></i>
                  <span>Click para ver detalles</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                {selectedProduct.customName || selectedProduct.template?.name || 'Producto'}
              </DialogTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedProduct.targetProfiles && selectedProduct.targetProfiles.map((profile: string) => (
                  <Badge 
                    key={profile}
                    variant="outline" 
                    className={`text-xs ${categoryColors[profile] || 'bg-gray-100 text-gray-700'}`}
                  >
                    {categoryNames[profile] || profile}
                  </Badge>
                ))}
              </div>
            </DialogHeader>

            <Tabs defaultValue="caracteristicas" className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="caracteristicas" data-testid="tab-caracteristicas">
                  <i className="fas fa-list mr-2"></i>
                  Características
                </TabsTrigger>
                <TabsTrigger value="requisitos" data-testid="tab-requisitos">
                  <i className="fas fa-clipboard-check mr-2"></i>
                  Requisitos
                </TabsTrigger>
              </TabsList>

              <TabsContent value="caracteristicas" className="space-y-4 mt-4">
                {selectedProduct.template?.description && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Descripción</h4>
                    <p className="text-gray-700">{selectedProduct.template.description}</p>
                  </div>
                )}

                {selectedProduct.configuration && typeof selectedProduct.configuration === 'object' && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Configuración</h4>
                    <div className="space-y-2">
                      {Object.entries(selectedProduct.configuration as Record<string, any>).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-2 border-b">
                          <span className="text-gray-600 capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className="font-medium text-gray-900">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedProduct.activeVariables && typeof selectedProduct.activeVariables === 'object' && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Variables Activas</h4>
                    <div className="space-y-2">
                      {Object.entries(selectedProduct.activeVariables as Record<string, any>).map(([key, value]) => (
                        <div key={key} className="p-3 bg-gray-50 rounded-lg border">
                          <p className="text-sm font-medium text-gray-900 capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="requisitos" className="space-y-4 mt-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Requisitos del Producto</h4>
                  <p className="text-gray-600 mb-4">
                    Los requisitos específicos se configuran a nivel de institución financiera. 
                    Consulta la sección de Financieras para ver los requisitos detallados por institución.
                  </p>
                  
                  {selectedProduct.template?.targetProfiles && (
                    <div className="mt-4">
                      <h5 className="font-medium text-gray-900 mb-2">Perfiles Objetivo</h5>
                      <div className="flex flex-wrap gap-2">
                        {selectedProduct.template.targetProfiles.map((profile: string) => (
                          <Badge 
                            key={profile}
                            variant="outline" 
                            className={categoryColors[profile] || 'bg-gray-100 text-gray-700'}
                          >
                            {categoryNames[profile] || profile}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
