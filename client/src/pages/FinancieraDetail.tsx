import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Building2, 
  FileText, 
  Package, 
  CheckCircle, 
  ArrowLeft, 
  Settings, 
  DollarSign, 
  Mail, 
  Phone, 
  User, 
  Clock, 
  Lightbulb, 
  Route, 
  Layers, 
  ClipboardCheck, 
  Percent, 
  Users, 
  Info, 
  Check, 
  PauseCircle,
  FileCheck
} from "lucide-react";
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
      <MainLayout>
        <Header title="Cargando..." subtitle="Institución Financiera" />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs animate-pulse space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-slate-200 rounded-xl"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-6 bg-slate-200 rounded w-1/3"></div>
                  <div className="h-4 bg-slate-200 rounded w-1/5"></div>
                </div>
              </div>
              <div className="h-10 bg-slate-100 rounded-lg w-full mt-4"></div>
            </div>
            <div className="h-64 bg-slate-100 border border-slate-200/80 rounded-xl animate-pulse"></div>
          </div>
        </main>
      </MainLayout>
    );
  }

  if (!institution) {
    return (
      <MainLayout>
        <Header title="No Encontrada" subtitle="Institución Financiera" />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-xl mx-auto mt-12 bg-white border border-slate-200/80 rounded-xl p-10 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">Institución no encontrada</h3>
            <p className="text-xs text-slate-500 mt-1 mb-6">La financiera solicitada no existe o fue dada de baja del catálogo institucional.</p>
            <Link href="/financieras">
              <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-white">
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Volver al Catálogo de Financieras
              </Button>
            </Link>
          </div>
        </main>
      </MainLayout>
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
    'persona_moral': 'bg-blue-50 text-blue-700 border-blue-200',
    'fisica_empresarial': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'fisica': 'bg-amber-50 text-amber-700 border-amber-200',
    'sin_sat': 'bg-slate-50 text-slate-700 border-slate-200'
  };
  
  const acceptedProfiles = Array.isArray(institution.acceptedProfiles) ? institution.acceptedProfiles : [];
  const commissionRates = institution.commissionRates || null;

  return (
    <MainLayout>
      <Header 
        title={institution.name}
        subtitle="Detalle de Institución Financiera"
      />
        
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header Section */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-100/90 border border-slate-200/60 rounded-xl flex items-center justify-center shrink-0 text-slate-700">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">{institution.name}</h2>
                    <Badge 
                      variant="outline"
                      className={`text-xs font-semibold px-2 py-0.5 ${
                        institution.isActive 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {institution.isActive ? (
                        <>
                          <Check className="w-3 h-3 mr-1 text-emerald-600" />
                          Activa
                        </>
                      ) : (
                        <>
                          <PauseCircle className="w-3 h-3 mr-1 text-slate-400" />
                          Inactiva
                        </>
                      )}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Institución asociada al catálogo comercial de CreditoNegocios</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link href="/financieras">
                  <Button variant="outline" size="sm" className="h-8 text-xs border-slate-200 text-slate-700 hover:bg-slate-50">
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                    Volver
                  </Button>
                </Link>
                {isAdmin && (
                  <Button 
                    size="sm"
                    onClick={() => setConfigModal(true)}
                    className="h-8 text-xs bg-primary hover:bg-primary/90 text-white shadow-xs"
                    data-testid="button-edit-institution"
                  >
                    <Settings className="w-3.5 h-3.5 mr-1.5" />
                    Configurar
                  </Button>
                )}
              </div>
            </div>

            {/* Contact Info - Solo visible para administradores */}
            {isAdmin && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5 pt-5 border-t border-slate-100 text-xs">
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50/70 border border-slate-100">
                  <User className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Contacto Principal</span>
                    <span className="font-semibold text-slate-800">{institution.contactPerson || 'No asignado'}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50/70 border border-slate-100">
                  <Mail className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="truncate">
                    <span className="text-[11px] text-slate-500 font-medium block">Correo Electrónico</span>
                    <span className="font-semibold text-slate-800 truncate block">{institution.email || 'No proporcionado'}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50/70 border border-slate-100">
                  <Phone className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Teléfono de Enlace</span>
                    <span className="font-semibold text-slate-800">{institution.phone || 'No proporcionado'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Accepted Profiles */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-700 block mb-2">Perfiles de Cliente Aceptados:</span>
              {acceptedProfiles.length > 0 ? (
                <div className="flex flex-wrap gap-2" data-testid="accepted-profiles-container">
                  {acceptedProfiles.map((profile: string) => (
                    <Badge 
                      key={profile}
                      variant="outline"
                      className={`text-xs font-medium px-2.5 py-0.5 ${profileColors[profile] || 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      data-testid={`badge-profile-${profile}`}
                    >
                      {profileLabels[profile] || profile}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic" data-testid="text-no-profiles">
                  No hay perfiles configurados
                </p>
              )}
            </div>
          </div>

          {/* Tabs Content */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 sm:p-6 shadow-xs">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 gap-1 bg-slate-100/80 p-1 rounded-lg border border-slate-200/60">
                <TabsTrigger 
                  value="proceso" 
                  data-testid="tab-proceso"
                  className="text-xs font-medium py-1.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  Proceso
                </TabsTrigger>
                <TabsTrigger 
                  value="productos" 
                  data-testid="tab-productos"
                  className="text-xs font-medium py-1.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <Package className="w-3.5 h-3.5 mr-1.5" />
                  Productos
                </TabsTrigger>
                <TabsTrigger 
                  value="requisitos" 
                  data-testid="tab-requisitos"
                  className="text-xs font-medium py-1.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Requisitos
                </TabsTrigger>
                <TabsTrigger 
                  value="comisiones" 
                  data-testid="tab-comisiones"
                  className="text-xs font-medium py-1.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <DollarSign className="w-3.5 h-3.5 mr-1.5" />
                  Comisiones
                </TabsTrigger>
              </TabsList>

              {/* Proceso Tab */}
              <TabsContent value="proceso" className="space-y-6 mt-6">
                {/* Application Process */}
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Route className="w-4 h-4 text-primary" />
                    <span>Proceso de Solicitud</span>
                  </h3>
                  {applicationProcess.length > 0 ? (
                    <div className="space-y-2.5">
                      {applicationProcess.map((step: any, index: number) => (
                        <div 
                          key={index} 
                          className="flex items-start gap-3 p-3.5 bg-slate-50/70 border border-slate-200/70 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 shadow-2xs">
                            {step.step || index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs sm:text-sm font-semibold text-slate-900 mb-0.5">
                              {step.title || `Paso ${index + 1}`}
                            </h4>
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {step.description || 'Sin descripción'}
                            </p>
                            {step.estimatedTime && (
                              <p className="text-[11px] font-medium text-primary mt-1.5 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>Tiempo estimado: {step.estimatedTime}</span>
                              </p>
                            )}
                          </div>
                          {step.isCheckpoint && (
                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 rounded px-1.5 py-0.5 shrink-0">
                              Hito Clave
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 text-center">
                      <p className="text-xs text-slate-500 italic">No hay pasos de proceso configurados para esta institución.</p>
                    </div>
                  )}
                </div>

                {/* Estimated Timeframes */}
                {Object.keys(estimatedTimeframes).length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span>Tiempos Estimados de Respuesta</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {Object.entries(estimatedTimeframes).map(([key, value]) => {
                        const labelMap: Record<string, string> = {
                          analysis: "Análisis",
                          initialanalysis: "Análisis Inicial",
                          creditanalysis: "Análisis Crediticio",
                          analisis: "Análisis",
                          approval: "Aprobación",
                          disbursement: "Dispersión",
                          processing: "Procesamiento",
                          review: "Revisión",
                          documentation: "Documentación",
                          evaluation: "Evaluación",
                          response: "Respuesta",
                          total: "Total",
                          aprobacion: "Aprobación",
                          dispersion: "Dispersión",
                          procesamiento: "Procesamiento",
                          revision: "Revisión",
                          documentacion: "Documentación",
                          evaluacion: "Evaluación",
                          respuesta: "Respuesta",
                        };
                        const normalizedKey = key.toLowerCase().trim();
                        const label = labelMap[key] || labelMap[normalizedKey] || key.replace(/([A-Z])/g, ' $1').trim();
                        return (
                          <div key={key} className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-2xs">
                            <span className="text-[11px] text-slate-500 font-medium block capitalize">
                              {label}
                            </span>
                            <span className="text-sm font-bold text-slate-900 mt-0.5 block">{value as string}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Approval Tips */}
                {approvalTips.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <span>Tips y Criterios de Aprobación</span>
                    </h3>
                    <div className="space-y-2">
                      {approvalTips.map((tip, index) => (
                        <div key={index} className="flex items-start gap-2.5 p-3 bg-emerald-50/50 rounded-lg border border-emerald-200/60">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                          <p className="text-xs text-slate-700 leading-relaxed">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required Documents */}
                {requiredDocuments.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-primary" />
                      <span>Documentos Base Requeridos</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {requiredDocuments.map((doc, index) => (
                        <div key={index} className="flex items-center gap-2.5 p-2.5 bg-slate-50/70 rounded-lg border border-slate-200/70">
                          <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-xs text-slate-700 font-medium">{doc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Productos Tab */}
              <TabsContent value="productos" className="mt-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      <span>Productos Financieros Asignados</span>
                    </h3>
                    <Badge variant="outline" className="text-xs font-semibold bg-slate-50 border-slate-200 text-slate-700">
                      {institutionProducts.length} producto{institutionProducts.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>

                  {institutionProducts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {institutionProducts.filter(p => p.isActive).map((product) => {
                        const categoryColors: Record<string, string> = {
                          persona_moral: 'bg-blue-50 text-blue-700 border-blue-200',
                          fisica_empresarial: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          fisica: 'bg-amber-50 text-amber-700 border-amber-200',
                          sin_sat: 'bg-slate-50 text-slate-700 border-slate-200',
                        };
                        
                        return (
                          <div key={product.id} className="p-4 bg-white border border-slate-200/80 rounded-xl hover:border-slate-300 shadow-2xs transition-all space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
                                  <Package className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                                  {product.customName || product.template?.name || 'Producto'}
                                </h4>
                              </div>
                              <div className="flex flex-wrap gap-1 justify-end">
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
                                      className={`text-[10px] font-semibold px-1.5 py-0.5 ${categoryColors[profile] || 'bg-slate-50 text-slate-700 border-slate-200'}`}
                                    >
                                      {profileNames[profile] || profile}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                            {product.template?.description && (
                              <p className="text-xs text-slate-600 leading-relaxed">{product.template.description}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                        <Package className="w-6 h-6" />
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-800">Sin productos configurados</p>
                      <p className="text-xs text-slate-500 mt-1 mb-4">No hay productos financieros vinculados a esta entidad financiera.</p>
                      {isAdmin && (
                        <Button 
                          size="sm"
                          onClick={() => setConfigModal(true)}
                          className="h-8 text-xs bg-primary hover:bg-primary/90 text-white"
                        >
                          <Settings className="w-3.5 h-3.5 mr-1.5" />
                          Configurar Productos
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Requisitos Tab */}
              <TabsContent value="requisitos" className="mt-6">
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <ClipboardCheck className="w-4 h-4 text-primary" />
                        <span>Requisitos por Tipo de Cliente</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Requisitos y condiciones de perfilamiento requeridos por {institution.name}.
                      </p>
                    </div>
                    {isAdmin && (
                      <Button 
                        size="sm"
                        onClick={() => setConfigModal(true)}
                        className="h-8 text-xs bg-primary hover:bg-primary/90 text-white shadow-xs w-fit"
                      >
                        <Settings className="w-3.5 h-3.5 mr-1.5" />
                        Configurar Requisitos
                      </Button>
                    )}
                  </div>

                  {institution.requirements && typeof institution.requirements === 'object' && Object.keys(institution.requirements).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(institution.requirements).map(([clientType, reqs]: [string, any]) => {
                        const reqList = Array.isArray(reqs) ? reqs : [];
                        const typeLabels: Record<string, string> = {
                          persona_moral: 'Persona Moral',
                          fisica_empresarial: 'Persona Física con Actividad Empresarial (PFAE)',
                          fisica: 'Persona Física',
                          sin_sat: 'Sin SAT'
                        };

                        return (
                          <div key={clientType} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs flex flex-col justify-between">
                            <div className="p-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                              <span className="text-xs sm:text-sm font-bold text-slate-900">{typeLabels[clientType] || clientType}</span>
                              <Badge variant="outline" className="bg-white text-[11px] font-semibold text-slate-700 border-slate-200">
                                {reqList.length} requisito{reqList.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <div className="p-4 flex-1">
                              {reqList.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No hay requisitos configurados para este tipo de cliente.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {reqList.map((reqItem: any, idx: number) => {
                                    const label = typeof reqItem === 'string' ? reqItem.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) : (reqItem?.label || reqItem?.id || JSON.stringify(reqItem));
                                    return (
                                      <li key={idx} className="flex items-center text-xs text-slate-700 bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-100">
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mr-2 shrink-0" />
                                        <span className="capitalize">{label}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 border rounded-xl bg-slate-50/50 border-dashed border-slate-200">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                        <ClipboardCheck className="w-6 h-6" />
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-800">No hay requisitos configurados para esta financiera</p>
                      <p className="text-xs text-slate-500 mt-1 mb-4">Haz clic en Configurar Requisitos para definir los campos requeridos y rangos de aceptación.</p>
                      {isAdmin && (
                        <Button 
                          size="sm"
                          onClick={() => setConfigModal(true)}
                          className="h-8 text-xs bg-primary hover:bg-primary/90 text-white"
                        >
                          <Settings className="w-3.5 h-3.5 mr-1.5" />
                          Configurar Requisitos
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Comisiones Tab */}
              <TabsContent value="comisiones" className="mt-6">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Percent className="w-4 h-4 text-primary" />
                    <span>Estructura de Comisiones</span>
                  </h3>
                  {commissionRates ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Financiera - Solo visible para admin/super_admin */}
                        {isAdmin && (commissionRates as any).financiera && (
                          <div data-testid="card-commission-financiera" className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                              <Building2 className="w-4 h-4 text-primary" />
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Financiera</h4>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between items-center p-1.5 bg-slate-50 rounded">
                                <span className="text-slate-600" data-testid="text-commission-financiera-total">Total:</span>
                                <span className="font-bold text-slate-900">{(commissionRates as any).financiera.total}%</span>
                              </div>
                              <div className="flex justify-between items-center px-1.5">
                                <span className="text-slate-500" data-testid="text-commission-financiera-apertura">Apertura:</span>
                                <span className="font-semibold text-slate-800">{(commissionRates as any).financiera.apertura}%</span>
                              </div>
                              <div className="flex justify-between items-center px-1.5">
                                <span className="text-slate-500" data-testid="text-commission-financiera-sobretasa">Sobretasa:</span>
                                <span className="font-semibold text-slate-800">{(commissionRates as any).financiera.sobretasa}%</span>
                              </div>
                              <div className="flex justify-between items-center px-1.5">
                                <span className="text-slate-500" data-testid="text-commission-financiera-renovacion">Renovación:</span>
                                <span className="font-semibold text-slate-800">{(commissionRates as any).financiera.renovacion}%</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Master Broker - Hidden for broker role */}
                        {!isBroker && (commissionRates as any).masterBroker && (
                          <div data-testid="card-commission-masterbroker" className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                              <Users className="w-4 h-4 text-emerald-600" />
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Master Broker (Techo de Red)</h4>
                            </div>
                            <div className="space-y-2 text-xs">
                              {/* Total y Sobretasa solo visibles para admin */}
                              {isAdmin && (
                                <div className="flex justify-between items-center p-1.5 bg-emerald-50/60 rounded border border-emerald-100/60">
                                  <span className="text-emerald-800 font-medium" data-testid="text-commission-masterbroker-total">Total:</span>
                                  <span className="font-bold text-emerald-700">{(commissionRates as any).masterBroker.total}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center px-1.5">
                                <span className="text-slate-500" data-testid="text-commission-masterbroker-apertura">Apertura:</span>
                                <span className="font-semibold text-slate-800">{(commissionRates as any).masterBroker.apertura}%</span>
                              </div>
                              {isAdmin && (
                                <div className="flex justify-between items-center px-1.5">
                                  <span className="text-slate-500" data-testid="text-commission-masterbroker-sobretasa">Sobretasa:</span>
                                  <span className="font-semibold text-slate-800">{(commissionRates as any).masterBroker.sobretasa}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center px-1.5">
                                <span className="text-slate-500" data-testid="text-commission-masterbroker-renovacion">Renovación:</span>
                                <span className="font-semibold text-slate-800">{(commissionRates as any).masterBroker.renovacion}%</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Broker */}
                        {(commissionRates as any).broker && (
                          <div data-testid="card-commission-broker" className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                              <User className="w-4 h-4 text-blue-600" />
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Bróker Directo (Sin Master)</h4>
                            </div>
                            <div className="space-y-2 text-xs">
                              {/* Total y Sobretasa solo visibles para admin */}
                              {isAdmin && (
                                <div className="flex justify-between items-center p-1.5 bg-blue-50/60 rounded border border-blue-100/60">
                                  <span className="text-blue-800 font-medium" data-testid="text-commission-broker-total">Total:</span>
                                  <span className="font-bold text-blue-700">{(commissionRates as any).broker.total}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center px-1.5">
                                <span className="text-slate-500" data-testid="text-commission-broker-apertura">Apertura:</span>
                                <span className="font-semibold text-slate-800">{(commissionRates as any).broker.apertura}%</span>
                              </div>
                              {isAdmin && (
                                <div className="flex justify-between items-center px-1.5">
                                  <span className="text-slate-500" data-testid="text-commission-broker-sobretasa">Sobretasa:</span>
                                  <span className="font-semibold text-slate-800">{(commissionRates as any).broker.sobretasa}%</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center px-1.5">
                                <span className="text-slate-500" data-testid="text-commission-broker-renovacion">Renovación:</span>
                                <span className="font-semibold text-slate-800">{(commissionRates as any).broker.renovacion}%</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-4 italic bg-slate-50/90 p-3 rounded-lg border border-slate-200/80 flex items-start gap-2">
                        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span><strong>Autonomía de Red:</strong> Los Master Brokers configuran de forma autónoma desde la sección de <em>Red de Brokers</em> el porcentaje que asignan a su equipo a partir de su techo otorgado.</span>
                      </p>
                    </>
                  ) : (
                    <div className="text-center py-12 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                        <Percent className="w-6 h-6" />
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-800 mb-1">No hay comisiones configuradas para esta financiera</p>
                      <p className="text-xs text-slate-500 mb-4">No se ha establecido el esquema de comisiones por apertura, sobretasa y renovación.</p>
                      {isAdmin && (
                        <Button 
                          size="sm"
                          onClick={() => setConfigModal(true)}
                          className="h-8 text-xs bg-primary hover:bg-primary/90 text-white"
                        >
                          <Settings className="w-3.5 h-3.5 mr-1.5" />
                          Configurar Comisiones
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Configuration Modal (Admin Only) */}
      {isAdmin && configModal && institution && (
        <ProductConfigurationModal 
          isOpen={configModal}
          onClose={() => setConfigModal(false)}
          financiera={institution}
        />
      )}
    </MainLayout>
  );
}
