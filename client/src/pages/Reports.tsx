import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ReportsChart from "@/components/Reports/ReportsChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Credit, Client, Commission } from "@shared/schema";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";

interface ReportData {
  totalCredits: number;
  totalAmount: number;
  avgCreditAmount: number;
  conversionRate: number;
  monthlyTrend: Array<{ month: string; credits: number; amount: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  topClients: Array<{ name: string; totalAmount: number; creditsCount: number }>;
}

export default function Reports() {
  const [dateRange, setDateRange] = useState<string>("current_month");
  const [reportType, setReportType] = useState<string>("overview");

  const { data: credits, isLoading: creditsLoading } = useQuery<Credit[]>({
    queryKey: ["/api/credits"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: commissions, isLoading: commissionsLoading } = useQuery<Commission[]>({
    queryKey: ["/api/commissions"],
  });

  const isLoading = creditsLoading || commissionsLoading;

  const getDateRangeFilter = () => {
    const now = new Date();
    switch (dateRange) {
      case "current_month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month":
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case "current_year":
        return { start: startOfYear(now), end: endOfYear(now) };
      case "last_6_months":
        return { start: subMonths(now, 6), end: now };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const generateReportData = (): ReportData => {
    if (!credits || !clients) {
      return {
        totalCredits: 0,
        totalAmount: 0,
        avgCreditAmount: 0,
        conversionRate: 0,
        monthlyTrend: [],
        statusDistribution: [],
        topClients: [],
      };
    }

    const { start, end } = getDateRangeFilter();
    const filteredCredits = credits.filter(credit => {
      const creditDate = new Date(credit.createdAt!);
      return creditDate >= start && creditDate <= end;
    });

    const totalAmount = filteredCredits.reduce((sum, credit) => sum + parseFloat(credit.amount), 0);
    
    // Status distribution
    const statusCounts: Record<string, number> = {};
    filteredCredits.forEach(credit => {
      statusCounts[credit.status] = (statusCounts[credit.status] || 0) + 1;
    });
    
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));

    // Top clients by total amount
    const clientTotals: Record<string, { totalAmount: number; creditsCount: number }> = {};
    filteredCredits.forEach(credit => {
      if (!clientTotals[credit.clientId]) {
        clientTotals[credit.clientId] = { totalAmount: 0, creditsCount: 0 };
      }
      clientTotals[credit.clientId].totalAmount += parseFloat(credit.amount);
      clientTotals[credit.clientId].creditsCount += 1;
    });

    const topClients = Object.entries(clientTotals)
      .map(([clientId, data]) => {
        const client = clients.find(c => c.id === clientId);
        const name = client 
          ? (client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName}`)
          : `Cliente ${clientId.slice(-8)}`;
        return {
          name: name || 'Cliente sin nombre',
          ...data,
        };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);

    // Monthly trend (last 6 months)
    const monthlyData: Record<string, { credits: number; amount: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthKey = date.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
      monthlyData[monthKey] = { credits: 0, amount: 0 };
    }

    filteredCredits.forEach(credit => {
      const creditDate = new Date(credit.createdAt!);
      const monthKey = creditDate.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].credits += 1;
        monthlyData[monthKey].amount += parseFloat(credit.amount);
      }
    });

    const monthlyTrend = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      ...data,
    }));

    return {
      totalCredits: filteredCredits.length,
      totalAmount,
      avgCreditAmount: filteredCredits.length > 0 ? totalAmount / filteredCredits.length : 0,
      conversionRate: clients.length > 0 ? (filteredCredits.length / clients.length) * 100 : 0,
      monthlyTrend,
      statusDistribution,
      topClients,
    };
  };

  const reportData = generateReportData();
  const totalCommissions = commissions?.reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Reportes"
            subtitle="Análisis y métricas de tu operación"
          />
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-96 w-full" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Reportes y Analytics"
          subtitle="Análisis detallado del desempeño de tu operación"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Controls */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
                <div className="flex space-x-4">
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="w-48" data-testid="select-date-range">
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current_month">Este mes</SelectItem>
                      <SelectItem value="last_month">Mes anterior</SelectItem>
                      <SelectItem value="last_6_months">Últimos 6 meses</SelectItem>
                      <SelectItem value="current_year">Este año</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger className="w-48" data-testid="select-report-type">
                      <SelectValue placeholder="Tipo de reporte" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overview">Vista General</SelectItem>
                      <SelectItem value="commissions">Comisiones</SelectItem>
                      <SelectItem value="clients">Análisis de Clientes</SelectItem>
                      <SelectItem value="performance">Rendimiento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex space-x-2">
                  <Button variant="outline" data-testid="button-export-pdf">
                    <i className="fas fa-file-pdf mr-2"></i>
                    Exportar PDF
                  </Button>
                  <Button variant="outline" data-testid="button-export-excel">
                    <i className="fas fa-file-excel mr-2"></i>
                    Exportar Excel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Créditos Otorgados</p>
                    <p className="text-2xl font-bold text-gray-900" data-testid="metric-total-credits">
                      {reportData.totalCredits}
                    </p>
                    <p className="text-xs text-neutral mt-1">En el período</p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-credit-card text-primary text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Volumen Total</p>
                    <p className="text-2xl font-bold text-success" data-testid="metric-total-amount">
                      ${reportData.totalAmount.toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-neutral mt-1">MXN colocados</p>
                  </div>
                  <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-dollar-sign text-success text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Ticket Promedio</p>
                    <p className="text-2xl font-bold text-warning" data-testid="metric-avg-amount">
                      ${reportData.avgCreditAmount.toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-neutral mt-1">Por crédito</p>
                  </div>
                  <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-chart-line text-warning text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Comisiones Generadas</p>
                    <p className="text-2xl font-bold text-secondary" data-testid="metric-total-commissions">
                      ${totalCommissions.toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-neutral mt-1">Total del período</p>
                  </div>
                  <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-coins text-secondary text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Monthly Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Tendencia Mensual</CardTitle>
              </CardHeader>
              <CardContent>
                <ReportsChart
                  type="line"
                  data={reportData.monthlyTrend}
                  xKey="month"
                  yKeys={["credits", "amount"]}
                  colors={["#1E40AF", "#059669"]}
                />
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <ReportsChart
                  type="pie"
                  data={reportData.statusDistribution}
                  xKey="status"
                  yKeys={["count"]}
                  colors={["#1E40AF", "#059669", "#F59E0B", "#EF4444", "#8B5CF6"]}
                />
              </CardContent>
            </Card>
          </div>

          {/* Top Clients Table */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Clientes por Volumen</CardTitle>
            </CardHeader>
            <CardContent>
              {reportData.topClients.length === 0 ? (
                <div className="text-center py-8">
                  <i className="fas fa-chart-bar text-4xl text-gray-300 mb-4"></i>
                  <p className="text-neutral">No hay datos de clientes en el período seleccionado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold">Cliente</th>
                        <th className="text-right py-3 px-4 font-semibold">Créditos</th>
                        <th className="text-right py-3 px-4 font-semibold">Volumen Total</th>
                        <th className="text-right py-3 px-4 font-semibold">Promedio por Crédito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topClients.map((client, index) => (
                        <tr 
                          key={index} 
                          className="border-b border-gray-100 hover:bg-gray-50"
                          data-testid={`top-client-${index}`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                                <span className="text-white font-semibold text-xs">
                                  {client.name.slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="font-medium">{client.name}</span>
                            </div>
                          </td>
                          <td className="text-right py-3 px-4 font-semibold">
                            {client.creditsCount}
                          </td>
                          <td className="text-right py-3 px-4 font-semibold text-success">
                            ${client.totalAmount.toLocaleString('es-MX')}
                          </td>
                          <td className="text-right py-3 px-4 text-neutral">
                            ${(client.totalAmount / client.creditsCount).toLocaleString('es-MX')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
