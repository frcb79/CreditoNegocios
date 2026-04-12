import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Clock, TrendingUp, Users, CreditCard, DollarSign, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const sampleClients = [
  { name: "Grupo Industrial MX", type: "Persona Moral", amount: "$2,500,000", status: "Aprobado" },
  { name: "María González", type: "PFAE", amount: "$450,000", status: "En proceso" },
  { name: "Tech Solutions SA", type: "Persona Moral", amount: "$1,200,000", status: "Pendiente" },
];

function PaletteSection({ 
  title, 
  description, 
  colors 
}: { 
  title: string; 
  description: string; 
  colors: { primary: string; secondary: string; accent: string; success: string; bg: string; text: string; muted: string } 
}) {
  return (
    <div className="mb-12 p-6 rounded-xl border-2" style={{ backgroundColor: colors.bg, borderColor: colors.primary + '40' }}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2" style={{ color: colors.text }}>{title}</h2>
        <p style={{ color: colors.muted }}>{description}</p>
        
        <div className="flex gap-2 mt-4">
          {Object.entries(colors).slice(0, 5).map(([name, color]) => (
            <div key={name} className="text-center">
              <div 
                className="w-12 h-12 rounded-lg border shadow-sm mb-1" 
                style={{ backgroundColor: color, borderColor: colors.text + '20' }}
              />
              <span className="text-xs" style={{ color: colors.muted }}>{name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card style={{ backgroundColor: colors.bg, borderColor: colors.primary + '30' }}>
          <CardHeader>
            <CardTitle style={{ color: colors.text }}>Métricas del Dashboard</CardTitle>
            <CardDescription style={{ color: colors.muted }}>Resumen de actividad</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg" style={{ backgroundColor: colors.primary + '15' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Users style={{ color: colors.primary }} size={20} />
                  <span className="text-sm" style={{ color: colors.muted }}>Clientes</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: colors.text }}>156</p>
                <span className="text-xs" style={{ color: colors.success }}>+12% este mes</span>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: colors.secondary + '15' }}>
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard style={{ color: colors.secondary }} size={20} />
                  <span className="text-sm" style={{ color: colors.muted }}>Créditos</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: colors.text }}>48</p>
                <span className="text-xs" style={{ color: colors.success }}>+8% este mes</span>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: colors.success + '15' }}>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign style={{ color: colors.success }} size={20} />
                  <span className="text-sm" style={{ color: colors.muted }}>Dispersado</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: colors.text }}>$45M</p>
                <span className="text-xs" style={{ color: colors.success }}>+25% este mes</span>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: colors.accent + '15' }}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp style={{ color: colors.accent }} size={20} />
                  <span className="text-sm" style={{ color: colors.muted }}>Comisiones</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: colors.text }}>$890K</p>
                <span className="text-xs" style={{ color: colors.success }}>+15% este mes</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card style={{ backgroundColor: colors.bg, borderColor: colors.primary + '30' }}>
          <CardHeader>
            <CardTitle style={{ color: colors.text }}>Botones y Acciones</CardTitle>
            <CardDescription style={{ color: colors.muted }}>Diferentes estados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button 
                className="px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90"
                style={{ backgroundColor: colors.primary }}
              >
                Primario
              </button>
              <button 
                className="px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90"
                style={{ backgroundColor: colors.secondary }}
              >
                Secundario
              </button>
              <button 
                className="px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90"
                style={{ backgroundColor: colors.success }}
              >
                Éxito
              </button>
              <button 
                className="px-4 py-2 rounded-lg font-medium transition-all hover:opacity-90"
                style={{ backgroundColor: colors.accent, color: colors.text }}
              >
                Acento
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button 
                className="px-4 py-2 rounded-lg font-medium border-2 transition-all hover:opacity-80"
                style={{ borderColor: colors.primary, color: colors.primary, backgroundColor: 'transparent' }}
              >
                Outline Primario
              </button>
              <button 
                className="px-4 py-2 rounded-lg font-medium border-2 transition-all hover:opacity-80"
                style={{ borderColor: colors.secondary, color: colors.secondary, backgroundColor: 'transparent' }}
              >
                Outline Secundario
              </button>
            </div>

            <div className="pt-4">
              <label className="text-sm font-medium mb-2 block" style={{ color: colors.text }}>Campo de entrada</label>
              <input 
                type="text" 
                placeholder="Escribe aquí..."
                className="w-full px-4 py-2 rounded-lg border-2 transition-all focus:outline-none"
                style={{ 
                  borderColor: colors.primary + '40', 
                  backgroundColor: colors.bg,
                  color: colors.text
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" style={{ backgroundColor: colors.bg, borderColor: colors.primary + '30' }}>
          <CardHeader>
            <CardTitle style={{ color: colors.text }}>Tabla de Clientes</CardTitle>
            <CardDescription style={{ color: colors.muted }}>Ejemplo de visualización de datos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottomWidth: '2px', borderColor: colors.primary + '30' }}>
                    <th className="text-left py-3 px-4 font-semibold" style={{ color: colors.text }}>Cliente</th>
                    <th className="text-left py-3 px-4 font-semibold" style={{ color: colors.text }}>Tipo</th>
                    <th className="text-left py-3 px-4 font-semibold" style={{ color: colors.text }}>Monto</th>
                    <th className="text-left py-3 px-4 font-semibold" style={{ color: colors.text }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleClients.map((client, i) => (
                    <tr key={i} style={{ borderBottomWidth: '1px', borderColor: colors.primary + '20' }}>
                      <td className="py-3 px-4 font-medium" style={{ color: colors.text }}>{client.name}</td>
                      <td className="py-3 px-4">
                        <span 
                          className="px-2 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: colors.secondary + '20', color: colors.secondary }}
                        >
                          {client.type}
                        </span>
                      </td>
                      <td className="py-3 px-4" style={{ color: colors.text }}>{client.amount}</td>
                      <td className="py-3 px-4">
                        <span 
                          className="px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit"
                          style={{ 
                            backgroundColor: client.status === 'Aprobado' ? colors.success + '20' : 
                                           client.status === 'En proceso' ? colors.accent + '20' : colors.primary + '20',
                            color: client.status === 'Aprobado' ? colors.success : 
                                  client.status === 'En proceso' ? colors.accent : colors.primary
                          }}
                        >
                          {client.status === 'Aprobado' && <CheckCircle size={12} />}
                          {client.status === 'En proceso' && <Clock size={12} />}
                          {client.status === 'Pendiente' && <Clock size={12} />}
                          {client.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card style={{ backgroundColor: colors.bg, borderColor: colors.primary + '30' }}>
          <CardHeader>
            <CardTitle style={{ color: colors.text }}>Progreso y Badges</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm" style={{ color: colors.muted }}>Meta mensual</span>
                <span className="text-sm font-medium" style={{ color: colors.text }}>75%</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: colors.primary + '20' }}>
                <div className="h-full rounded-full" style={{ width: '75%', backgroundColor: colors.primary }} />
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 pt-4">
              <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: colors.primary, color: 'white' }}>
                Crédito Simple
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: colors.secondary, color: 'white' }}>
                Arrendamiento
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: colors.success, color: 'white' }}>
                Factoraje
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: colors.accent, color: colors.text }}>
                Hipotecario
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" style={{ backgroundColor: colors.bg, borderColor: colors.primary + '30' }}>
          <CardHeader>
            <CardTitle style={{ color: colors.text }}>Opciones de Sidebar</CardTitle>
            <CardDescription style={{ color: colors.muted }}>Compara 3 estilos de sidebar más ligeros</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium mb-2 text-center" style={{ color: colors.text }}>A: Fondo Blanco</p>
                <div className="rounded-lg p-4 border-2" style={{ backgroundColor: '#FFFFFF', borderColor: colors.primary + '20' }}>
                  <div className="font-bold text-lg mb-4" style={{ color: colors.primary }}>BrokerPro</div>
                  <nav className="space-y-1">
                    {['Dashboard', 'Clientes', 'Créditos', 'Comisiones'].map((item, i) => (
                      <div 
                        key={item}
                        className="px-3 py-2 rounded-lg text-sm transition-all cursor-pointer"
                        style={{ 
                          backgroundColor: i === 0 ? colors.primary : 'transparent',
                          color: i === 0 ? 'white' : colors.text
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </nav>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2 text-center" style={{ color: colors.text }}>B: Azul Muy Claro</p>
                <div className="rounded-lg p-4" style={{ backgroundColor: '#EBF4FF' }}>
                  <div className="font-bold text-lg mb-4" style={{ color: colors.primary }}>BrokerPro</div>
                  <nav className="space-y-1">
                    {['Dashboard', 'Clientes', 'Créditos', 'Comisiones'].map((item, i) => (
                      <div 
                        key={item}
                        className="px-3 py-2 rounded-lg text-sm transition-all cursor-pointer"
                        style={{ 
                          backgroundColor: i === 0 ? colors.primary : 'transparent',
                          color: i === 0 ? 'white' : '#1E3A5F'
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </nav>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2 text-center" style={{ color: colors.text }}>C: Gradiente Suave</p>
                <div className="rounded-lg p-4" style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #E8F0FE 100%)' }}>
                  <div className="font-bold text-lg mb-4" style={{ color: colors.primary }}>BrokerPro</div>
                  <nav className="space-y-1">
                    {['Dashboard', 'Clientes', 'Créditos', 'Comisiones'].map((item, i) => (
                      <div 
                        key={item}
                        className="px-3 py-2 rounded-lg text-sm transition-all cursor-pointer"
                        style={{ 
                          backgroundColor: i === 0 ? colors.primary : 'transparent',
                          color: i === 0 ? 'white' : colors.text
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </nav>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DesignPreview() {
  const palettes = {
    modern: {
      primary: '#6C5CE7',
      secondary: '#0984E3',
      accent: '#FDCB6E',
      success: '#00B894',
      bg: '#F7F8FC',
      text: '#2D3436',
      muted: '#636E72'
    },
    classic: {
      primary: '#05478a',
      secondary: '#048cfc',
      accent: '#5694de',
      success: '#10B981',
      bg: '#F8FAFC',
      text: '#1E293B',
      muted: '#64748B'
    },
    premium: {
      primary: '#000000',
      secondary: '#00D084',
      accent: '#C8FF00',
      success: '#00D084',
      bg: '#FFFFFF',
      text: '#1A1A1A',
      muted: '#6B7280'
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft size={20} />
            Volver al inicio
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Vista Previa de Diseño</h1>
          <p className="text-gray-600 mt-2">Compara las 3 paletas de colores para tu plataforma fintech</p>
        </div>

        <Tabs defaultValue="modern" className="w-full">
          <TabsList className="grid grid-cols-3 mb-8 bg-white">
            <TabsTrigger value="modern" data-testid="tab-modern">Moderno (Púrpura)</TabsTrigger>
            <TabsTrigger value="classic" data-testid="tab-classic">Clásico (Azul)</TabsTrigger>
            <TabsTrigger value="premium" data-testid="tab-premium">Premium (Negro)</TabsTrigger>
          </TabsList>
          
          <TabsContent value="modern">
            <PaletteSection 
              title="Opción 1: Moderno y Confiable" 
              description="Púrpura y azul eléctrico transmiten innovación y tecnología manteniendo la confianza"
              colors={palettes.modern}
            />
          </TabsContent>
          
          <TabsContent value="classic">
            <PaletteSection 
              title="Opción 2: Profesional Clásico" 
              description="Azul profundo tradicional que transmite seriedad, seguridad y experiencia bancaria"
              colors={palettes.classic}
            />
          </TabsContent>
          
          <TabsContent value="premium">
            <PaletteSection 
              title="Opción 3: Premium Moderno" 
              description="Negro con verde brillante estilo Wise/Robinhood - sofisticado, moderno y dinámico"
              colors={palettes.premium}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-8 p-6 bg-white rounded-xl border">
          <h2 className="text-xl font-bold mb-4">¿Cuál te gusta más?</h2>
          <p className="text-gray-600 mb-4">
            Una vez que elijas una paleta, la aplicaré a toda tu plataforma. Los cambios incluirán:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-1">
            <li>Sidebar y navegación principal</li>
            <li>Todos los botones y formularios</li>
            <li>Tarjetas, tablas y badges</li>
            <li>Modo claro y modo oscuro</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
