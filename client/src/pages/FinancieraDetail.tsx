import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Package, CheckCircle, ArrowLeft, Settings, DollarSign } from "lucide-react";
import { FinancialInstitution, InstitutionProductWithTemplate } from "@shared/schema";
import ProductConfigurationModal from "@/components/Modals/ProductConfigurationModal";

export default function FinancieraDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [configModal, setConfigModal] = useState(false);
  const [activeTab, setActiveTab] = useState("proceso");
  
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isBroker = user?.role === 'broker';
  const isMasterBroker = user?.role === 'master_broker';
  const isBrokerOrMaster = isBroker || isMasterBroker;

  const { data: institution, isLoading } = useQuery<FinancialInstitution>({
    queryKey: [`/api/financial-institutions/${id}`],
    enabled: !!id,
  });

  const { data: institutionProducts = [] } = useQuery<InstitutionProductWithTemplate[]>({
    queryKey: [`/api/institution-products`, { institutionId: id }],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header title="Cargando..." subtitle="Institución Financiera" />
          <main className="flex-1 p-8">
            <Skeleton className="h-64 w-full" />
          </main>
        </div>
      </div>
    );
  }

  if (!institution) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header title="No Encontrada" subtitle="Institución Financiera" />
          <main className="flex-1 p-8">
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-600 mb-4">La financiera no fue encontrada</p>
                <Link href="/financieras">
                  <Button>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver a Financieras
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  const applicationProcess = Array.isArray(institution.applicationProcess) 
    ? institution.applicationProcess 
    : [];
  const estimatedTimeframes = institution.estimatedTimeframes || {};
  const approvalTips = Array.isArray(institution.approvalTips) ? institution.approvalTips : [];
  const requiredDocuments = Array.isArray(institution.requiredDocuments) ? institution.requiredDocuments : [];
  
  const profileLabels: Record<string, string> = {
    'persona_moral': 'Persona Moral',
    'fisica_empresarial': 'PFAE',
    'fisica': 'Persona Física',
    'sin_sat': 'Sin SAT'
  };
  
  const profileColors: Record<string, string> = {
    'persona_moral': 'bg-blue-100 text-blue-700 border-blue-300',
    'fisica_empresarial': 'bg-green-100 text-green-700 border-green-300',
    'fisica': 'bg-orange-100 text-orange-700 border-orange-300',
    'sin_sat': 'bg-gray-100 text-gray-700 border-gray-300'
  };
  
  const acceptedProfiles = Array.isArray(institution.acceptedProfiles) ? institution.acceptedProfiles : [];
  const commissionRates = institution.commissionRates || null;

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title={institution.name}
          subtitle="Detalle de Institución Financiera"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Header Section */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-building text-primary text-2xl"></i>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{institution.name}</h2>
                    <div className="flex items-center space-x-3 mt-2">
                      <Badge 
                        variant={institution.isActive ? "default" : "secondary"}
                        className={institution.isActive 
                          ? "bg-green-100 text-green-700 border-green-200" 
                          : "bg-red-100 text-red-700 border-red-200"
                        }
                      >
                        <i className={`fas ${institution.isActive ? 'fa-check-circle' : 'fa-pause-circle'} mr-1 text-xs`}></i>
                        {institution.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Link href="/financieras">
                    <Button variant="outline">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Volver
                    </Button>
                  </Link>
                  {isAdmin && (
                    <Button 
                      onClick={() => setConfigModal(true)}
                      className="bg-primary text-white hover:bg-primary-dark"
                      data-testid="button-edit-institution"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Configurar
                    </Button>
                  )}
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t">
                <div>
                  <p className="text-sm text-neutral mb-1">Contacto</p>
                  <p className="font-medium">{institution.contactPerson || 'No asignado'}</p>
                </div>
                <div>
                  <p className="text-sm text-neutral mb-1">Email</p>
                  <p className="font-medium text-sm">{institution.email || 'No proporcionado'}</p>
                </div>
                <div>
                  <p className="text-sm text-neutral mb-1">Teléfono</p>
                  <p className="font-medium">{institution.phone || 'No proporcionado'}</p>
                </div>
              </div>

              {/* Accepted Profiles */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-neutral mb-2">Perfiles de Cliente Aceptados</p>
                {acceptedProfiles.length > 0 ? (
                  <div className="flex flex-wrap gap-2" data-testid="accepted-profiles-container">
                    {acceptedProfiles.map((profile: string) => (
                      <Badge 
                        key={profile}
                        variant="outline"
                        className={`${profileColors[profile] || 'bg-gray-100 text-gray-700 border-gray-300'}`}
                        data-testid={`badge-profile-${profile}`}
                      >
                        {profileLabels[profile] || profile}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic" data-testid="text-no-profiles">
                    No hay perfiles configurados
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Card>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 gap-1">
                  <TabsTrigger 
                    value="proceso" 
                    data-testid="tab-proceso"
                    className="data-[state=active]:bg-blue-500 data-[state=active]:text-white hover:bg-blue-100"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Proceso
                  </TabsTrigger>
                  <TabsTrigger 
                    value="productos" 
                    data-testid="tab-productos"
                    className="data-[state=active]:bg-green-500 data-[state=active]:text-white hover:bg-green-100"
                  >
                    <Package className="w-4 h-4 mr-2" />
                    Productos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="requisitos" 
                    data-testid="tab-requisitos"
                    className="data-[state=active]:bg-purple-500 data-[state=active]:text-white hover:bg-purple-100"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Requisitos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="comisiones" 
                    data-testid="tab-comisiones"
                    className="data-[state=active]:bg-orange-500 data-[state=active]:text-white hover:bg-orange-100"
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Comisiones
                  </TabsTrigger>
                </TabsList>

                {/* Proceso Tab */}
                <TabsContent value="proceso" className="space-y-6 mt-6">
                  {/* Application Process */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <i className="fas fa-route text-primary mr-2"></i>
                      Proceso de Solicitud
                    </h3>
                    {applicationProcess.length > 0 ? (
                      <div className="space-y-3">
                        {applicationProcess.map((step: any, index: number) => (
                          <div 
                            key={index} 
                            className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg"
                          >
                            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-semibold text-sm">
                                {step.step || index + 1}
                              </span>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900 mb-1">
                                {step.title || `Paso ${index + 1}`}
                              </h4>
                              <p className="text-sm text-gray-600">
                                {step.description || 'Sin descripción'}
                              </p>
                              {step.estimatedTime && (
                                <p className="text-xs text-primary mt-2">
                                  <i className="fas fa-clock mr-1"></i>
                                  Tiempo estimado: {step.estimatedTime}
                                </p>
                              )}
                            </div>
                            {step.isCheckpoint && (
                              <i className="fas fa-flag text-warning"></i>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">No hay pasos de proceso configurados</p>
                    )}
                  </div>

                  {/* Estimated Timeframes */}
                  {Object.keys(estimatedTimeframes).length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <i className="fas fa-stopwatch text-primary mr-2"></i>
                        Tiempos Estimados
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {Object.entries(estimatedTimeframes).map(([key, value]) => (
                          <div key={key} className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-sm text-gray-600 mb-1 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </p>
                            <p className="font-semibold text-gray-900">{value as string}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Approval Tips */}
                  {approvalTips.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <i className="fas fa-lightbulb text-primary mr-2"></i>
                        Tips de Aprobación
                      </h3>
                      <div className="space-y-2">
                        {approvalTips.map((tip, index) => (
                          <div key={index} className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg border border-green-200">
                            <i className="fas fa-check-circle text-green-600 mt-1"></i>
                            <p className="text-sm text-gray-700">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Required Documents */}
                  {requiredDocuments.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <i className="fas fa-file-alt text-primary mr-2"></i>
                        Documentos Requeridos
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {requiredDocuments.map((doc, index) => (
                          <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border">
                            <i className="fas fa-file-pdf text-red-500"></i>
                            <span className="text-sm text-gray-700">{doc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Productos Tab */}
                <TabsContent value="productos" className="mt-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
                      <span>
                        <i className="fas fa-layer-group text-primary mr-2"></i>
                        Productos Configurados
                      </span>
                      <Badge variant="outline" className="text-sm">
                        {institutionProducts.length} producto(s)
                      </Badge>
                    </h3>
                    {institutionProducts.length > 0 ? (
                      <div className="space-y-3">
                        {institutionProducts.filter(p => p.isActive).map((product) => {
                          const categoryColors: Record<string, string> = {
                            persona_moral: 'bg-blue-100 text-blue-700',
                            fisica_empresarial: 'bg-green-100 text-green-700',
                            fisica: 'bg-orange-100 text-orange-700',
                            sin_sat: 'bg-gray-100 text-gray-700',
                          };
                          
                          return (
                            <div key={product.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold text-gray-900">
                                  {product.customName || product.template?.name || 'Producto'}
                                </h4>
                                <div className="flex gap-2">
                                  {product.targetProfiles && product.targetProfiles.map((profile: string) => {
                                    const profileNames: Record<string, string> = {
                                      persona_moral: 'PM',
                                      fisica_empresarial: 'PFAE',
                                      fisica: 'PF',
                                      sin_sat: 'Sin SAT',
                                    };
                                    return (
                                      <Badge 
                                        key={profile}
                                        variant="outline" 
                                        className={`text-xs ${categoryColors[profile] || 'bg-gray-100 text-gray-700'}`}
                                      >
                                        {profileNames[profile] || profile}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                              {product.template?.description && (
                                <p className="text-sm text-gray-600 mb-2">{product.template.description}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <i className="fas fa-box-open text-6xl text-gray-300 mb-4"></i>
                        <p className="text-gray-500">No hay productos configurados para esta financiera</p>
                        {isAdmin && (
                          <Button 
                            onClick={() => setConfigModal(true)}
                            className="mt-4 bg-primary text-white hover:bg-primary-dark"
                          >
                            <i className="fas fa-plus mr-2"></i>
                            Configurar Productos
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Requisitos Tab */}
                <TabsContent value="requisitos" className="mt-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <i className="fas fa-clipboard-check text-primary mr-2"></i>
                      Requisitos por Tipo de Cliente
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Los requisitos específicos se configuran en la pestaña de Requisitos del modal de configuración.
                    </p>
                    {isAdmin && (
                      <Button 
                        onClick={() => setConfigModal(true)}
                        variant="outline"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Ver/Editar Requisitos
                      </Button>
                    )}
                  </div>
                </TabsContent>

                {/* Comisiones Tab */}
                <TabsContent value="comisiones" className="mt-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <i className="fas fa-percentage text-primary mr-2"></i>
                      Estructura de Comisiones
                    </h3>
                    {commissionRates ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Financiera - Solo visible para admin/super_admin */}
                        {isAdmin && (commissionRates as any).financiera && (
                          <Card data-testid="card-commission-financiera" className="bg-primary/5 border-primary/20">
                            <CardHeader>
                              <CardTitle className="text-lg flex items-center">
                                <i className="fas fa-building text-primary mr-2"></i>
                                Financiera
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600" data-testid="text-commission-financiera-total">Total:</span>
                                <span className="font-semibold">{(commissionRates as any).financiera.total}%</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600" data-testid="text-commission-financiera-apertura">Apertura:</span>
                                <span className="font-semibold">{(commissionRates as any).financiera.apertura}%</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600" data-testid="text-commission-financiera-sobretasa">Sobretasa:</span>
                                <span className="font-semibold">{(commissionRates as any).financiera.sobretasa}%</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600" data-testid="text-commission-financiera-renovacion">Renovación:</span>
                                <span className="font-semibold">{(commissionRates as any).financiera.renovacion}%</span>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Master Broker - Hidden for broker role */}
                        {!isBroker && (commissionRates as any).masterBroker && (
                          <Card data-testid="card-commission-masterbroker" className="bg-green-50 border-green-200">
                            <CardHeader>
                              <CardTitle className="text-lg flex items-center">
                                <i className="fas fa-users text-green-600 mr-2"></i>
                                Master Broker
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              {/* Total y Sobretasa solo visibles para admin */}
                              {isAdmin && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600" data-testid="text-commission-masterbroker-total">Total:</span>
                                  <span className="font-semibold">{(commissionRates as any).masterBroker.total}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600" data-testid="text-commission-masterbroker-apertura">Apertura:</span>
                                <span className="font-semibold">{(commissionRates as any).masterBroker.apertura}%</span>
                              </div>
                              {isAdmin && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600" data-testid="text-commission-masterbroker-sobretasa">Sobretasa:</span>
                                  <span className="font-semibold">{(commissionRates as any).masterBroker.sobretasa}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600" data-testid="text-commission-masterbroker-renovacion">Renovación:</span>
                                <span className="font-semibold">{(commissionRates as any).masterBroker.renovacion}%</span>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Broker */}
                        {(commissionRates as any).broker && (
                          <Card data-testid="card-commission-broker" className="bg-blue-50 border-blue-200">
                            <CardHeader>
                              <CardTitle className="text-lg flex items-center">
                                <i className="fas fa-user text-blue-600 mr-2"></i>
                                Broker
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              {/* Total y Sobretasa solo visibles para admin */}
                              {isAdmin && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600" data-testid="text-commission-broker-total">Total:</span>
                                  <span className="font-semibold">{(commissionRates as any).broker.total}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600" data-testid="text-commission-broker-apertura">Apertura:</span>
                                <span className="font-semibold">{(commissionRates as any).broker.apertura}%</span>
                              </div>
                              {isAdmin && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600" data-testid="text-commission-broker-sobretasa">Sobretasa:</span>
                                  <span className="font-semibold">{(commissionRates as any).broker.sobretasa}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600" data-testid="text-commission-broker-renovacion">Renovación:</span>
                                <span className="font-semibold">{(commissionRates as any).broker.renovacion}%</span>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <i className="fas fa-percent text-6xl text-gray-300 mb-4"></i>
                        <p className="text-gray-500 mb-4">No hay comisiones configuradas para esta financiera</p>
                        {isAdmin && (
                          <Button 
                            onClick={() => setConfigModal(true)}
                            className="bg-primary text-white hover:bg-primary-dark"
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Configurar Comisiones
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </main>

        {/* Configuration Modal (Admin Only) */}
        {isAdmin && configModal && institution && (
          <ProductConfigurationModal 
            isOpen={configModal}
            onClose={() => setConfigModal(false)}
            financiera={institution}
          />
        )}
      </div>
    </div>
  );
}
