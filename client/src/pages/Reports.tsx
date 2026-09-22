import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import ReportsChart from "@/components/Reports/ReportsChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Credit, Client, Commission } from "@shared/schema";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";
import { utils as xlsxUtils, writeFile } from "xlsx";
import { jsPDF } from "jspdf";
import { CreditCard, DollarSign, TrendingUp, Coins, FileText, FileSpreadsheet, BarChart2 } from "lucide-react";

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

  const exportToExcel = () => {
    const data = {
      "Resumen": [
        ["Métrica", "Valor"],
        ["Créditos Otorgados", reportData.totalCredits],
        ["Monto Total", `$${reportData.totalAmount.toFixed(2)}`],
        ["Promedio por Crédito", `$${reportData.avgCreditAmount.toFixed(2)}`],
        ["Tasa de Conversión", `${reportData.conversionRate.toFixed(2)}%`],
      ],
      "Distribución por Estado": reportData.statusDistribution.map(s => [s.status, s.count]),
      "Clientes Top 10": [
        ["Nombre", "Monto Total", "Cantidad de Créditos"],
        ...reportData.topClients.map(c => [c.name, `$${c.totalAmount.toFixed(2)}`, c.creditsCount]),
      ],
      "Tendencia Mensual": [
        ["Mes", "Créditos", "Monto"],
        ...reportData.monthlyTrend.map(m => [m.month, m.credits, `$${m.amount.toFixed(2)}`]),
      ],
    };

    const wb = xlsxUtils.book_new();
    Object.entries(data).forEach(([sheetName, sheetData]: [string, any[]]) => {
      const ws = xlsxUtils.aoa_to_sheet(sheetData);
      xlsxUtils.book_append_sheet(wb, ws, sheetName);
    });

    writeFile(wb, `reporte-creditos-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const fileName = `reporte-creditos-${new Date().toISOString().split("T")[0]}.pdf`;

      let y = 50;
      const lineHeight = 18;

      const writeLine = (text: string, options?: { bold?: boolean; size?: number }) => {
        const size = options?.size ?? 11;
        const bold = options?.bold ?? false;
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);

        const maxWidth = 500;
        const lines = doc.splitTextToSize(text, maxWidth);

        lines.forEach((line: string) => {
          if (y > 790) {
            doc.addPage();
            y = 50;
          }
          doc.text(line, 50, y);
          y += lineHeight;
        });
      };

      writeLine("Reporte de Creditos", { bold: true, size: 18 });
      writeLine(`Generado: ${new Date().toLocaleDateString("es-MX")}`);
      y += 8;

      writeLine("Resumen", { bold: true, size: 14 });
      writeLine(`Creditos Otorgados: ${reportData.totalCredits}`);
      writeLine(`Monto Total: $${reportData.totalAmount.toFixed(2)}`);
      writeLine(`Promedio por Credito: $${reportData.avgCreditAmount.toFixed(2)}`);
      writeLine(`Tasa de Conversion: ${reportData.conversionRate.toFixed(2)}%`);
      writeLine(`Comisiones Totales: $${totalCommissions.toFixed(2)}`);
      y += 8;

      if (reportData.statusDistribution.length > 0) {
        writeLine("Distribucion por Estado", { bold: true, size: 14 });
        reportData.statusDistribution.forEach((item) => {
          writeLine(`- ${item.status}: ${item.count}`);
        });
        y += 8;
      }

      if (reportData.topClients.length > 0) {
        writeLine("Clientes Top 10", { bold: true, size: 14 });
        reportData.topClients.slice(0, 10).forEach((client, idx) => {
          writeLine(
            `${idx + 1}. ${client.name}: $${client.totalAmount.toFixed(2)} (${client.creditsCount} creditos)`
          );
        });
        y += 8;
      }

      if (reportData.monthlyTrend.length > 0) {
        writeLine("Tendencia Mensual", { bold: true, size: 14 });
        reportData.monthlyTrend.forEach((item) => {
          writeLine(`${item.month}: ${item.credits} creditos, $${item.amount.toFixed(2)}`);
        });
      }

      doc.save(fileName);
    } catch (error) {
      console.error("Error al generar PDF:", error);
      alert("Error al generar el PDF. Por favor intente nuevamente.");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <Header 
          title="Reportes"
          subtitle="Análisis y métricas de tu operación"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-4">
            <Skeleton className="h-14 w-full rounded-lg" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Skeleton className="h-80 w-full rounded-lg" />
              <Skeleton className="h-80 w-full rounded-lg" />
            </div>
          </div>
        </main>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Reportes y Analytics"
        subtitle="Análisis detallado del desempeño de tu operación"
      />
        
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-4" data-testid="reports-main-content">
        {/* Compact Controls Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card border border-border/70 rounded-lg shadow-2xs">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-40 sm:w-44 h-8 text-xs bg-background border-border/70" data-testid="select-date-range">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month" className="text-xs">Este mes</SelectItem>
                <SelectItem value="last_month" className="text-xs">Mes anterior</SelectItem>
                <SelectItem value="last_6_months" className="text-xs">Últimos 6 meses</SelectItem>
                <SelectItem value="current_year" className="text-xs">Este año</SelectItem>
              </SelectContent>
            </Select>

            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="w-40 sm:w-44 h-8 text-xs bg-background border-border/70" data-testid="select-report-type">
                <SelectValue placeholder="Tipo de reporte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overview" className="text-xs">Vista General</SelectItem>
                <SelectItem value="commissions" className="text-xs">Comisiones</SelectItem>
                <SelectItem value="clients" className="text-xs">Análisis de Clientes</SelectItem>
                <SelectItem value="performance" className="text-xs">Rendimiento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-border/70 hover:bg-muted"
              data-testid="button-export-pdf"
              onClick={exportToPDF}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5 text-rose-600 dark:text-rose-400" />
              Exportar PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-border/70 hover:bg-muted"
              data-testid="button-export-excel"
              onClick={exportToExcel}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Compact Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Métricas 1: Créditos Otorgados */}
          <div className="p-3.5 rounded-lg border border-border/70 bg-card shadow-2xs flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Créditos Otorgados
              </span>
              <p className="text-xl font-bold font-mono text-foreground" data-testid="metric-total-credits">
                {reportData.totalCredits}
              </p>
              <span className="text-[11px] text-muted-foreground block">
                En el período
              </span>
            </div>
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
              <CreditCard className="h-4 w-4 text-primary" />
            </div>
          </div>

          {/* Métricas 2: Volumen Total */}
          <div className="p-3.5 rounded-lg border border-border/70 bg-card shadow-2xs flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Volumen Total
              </span>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400" data-testid="metric-total-amount">
                ${reportData.totalAmount.toLocaleString('es-MX')}
              </p>
              <span className="text-[11px] text-muted-foreground block">
                MXN colocados
              </span>
            </div>
            <div className="w-8 h-8 rounded-md bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>

          {/* Métricas 3: Ticket Promedio */}
          <div className="p-3.5 rounded-lg border border-border/70 bg-card shadow-2xs flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Ticket Promedio
              </span>
              <p className="text-xl font-bold font-mono text-foreground" data-testid="metric-avg-amount">
                ${reportData.avgCreditAmount.toLocaleString('es-MX')}
              </p>
              <span className="text-[11px] text-muted-foreground block">
                Por crédito
              </span>
            </div>
            <div className="w-8 h-8 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0 border border-amber-500/20">
              <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </div>

          {/* Métricas 4: Comisiones Generadas */}
          <div className="p-3.5 rounded-lg border border-border/70 bg-card shadow-2xs flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Comisiones Generadas
              </span>
              <p className="text-xl font-bold font-mono text-primary" data-testid="metric-total-commissions">
                ${totalCommissions.toLocaleString('es-MX')}
              </p>
              <span className="text-[11px] text-muted-foreground block">
                Total del período
              </span>
            </div>
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
              <Coins className="h-4 w-4 text-primary" />
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly Trend Chart */}
          <Card className="border border-border/70 bg-card shadow-2xs">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <CardTitle className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" />
                Tendencia Mensual
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-3">
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
          <Card className="border border-border/70 bg-card shadow-2xs">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <CardTitle className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-emerald-600" />
                Distribución por Estado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-3">
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
        <Card className="border border-border/70 bg-card shadow-2xs">
          <CardHeader className="p-4 pb-2 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
                Top 10 Clientes por Volumen
              </CardTitle>
              <span className="text-[11px] text-muted-foreground font-mono">
                {reportData.topClients.length} registrados
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {reportData.topClients.length === 0 ? (
              <div className="text-center py-8">
                <BarChart2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No hay datos de clientes en el período seleccionado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground">
                      <th className="text-left py-2.5 px-3.5 font-semibold uppercase tracking-wider text-[10px]">Cliente</th>
                      <th className="text-right py-2.5 px-3.5 font-semibold uppercase tracking-wider text-[10px]">Créditos</th>
                      <th className="text-right py-2.5 px-3.5 font-semibold uppercase tracking-wider text-[10px]">Volumen Total</th>
                      <th className="text-right py-2.5 px-3.5 font-semibold uppercase tracking-wider text-[10px]">Promedio por Crédito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {reportData.topClients.map((client, index) => (
                      <tr 
                        key={index} 
                        className="hover:bg-muted/30 transition-colors"
                        data-testid={`top-client-${index}`}
                      >
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-primary font-bold text-[10px]">
                                {client.name.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-xs">{client.name}</span>
                          </div>
                        </td>
                        <td className="text-right py-2.5 px-3.5 font-mono font-medium text-foreground">
                          {client.creditsCount}
                        </td>
                        <td className="text-right py-2.5 px-3.5 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          ${client.totalAmount.toLocaleString('es-MX')}
                        </td>
                        <td className="text-right py-2.5 px-3.5 font-mono text-muted-foreground">
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
    </MainLayout>
  );
}

