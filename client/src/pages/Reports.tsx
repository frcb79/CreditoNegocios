import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { confirmedReportEvents,inReportPeriod,reportCommissionTotal } from "@shared/operationalReportMetrics";
import { getCreditStatusLabel } from "@/lib/statusConfig";
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
  clientsWithConfirmedDisbursement: number;
  monthlyTrend: Array<{ month: string; credits: number; amount: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  topClients: Array<{ name: string; totalAmount: number; creditsCount: number }>;
}

export default function Reports() {
  const [dateRange, setDateRange] = useState<string>("current_month");
  const {user}=useAuth();

  const { data: credits, isLoading: creditsLoading, isError: creditsError } = useQuery<Credit[]>({
    queryKey: ["/api/credits"],
  });

  const { data: clients, isLoading: clientsLoading, isError: clientsError } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: commissions, isLoading: commissionsLoading, isError: commissionsError } = useQuery<Array<Commission & {payoutAmount?:number}>>({
    queryKey: ["/api/commissions"],
  });

  const isLoading = creditsLoading || commissionsLoading || clientsLoading;

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

  const period=getDateRangeFilter();
  const events=confirmedReportEvents(credits||[],period);
  const generateReportData=():ReportData=>{
    const creditIds=new Set(events.map(e=>e.creditId));
    const totalAmount=events.reduce((sum,e)=>sum+e.amount,0);
    const clientTotals=new Map<string,{totalAmount:number;ids:Set<string>}>();
    const statuses=new Map<string,number>();
    for(const credit of credits||[]){
      if(credit.status==="historical_recorded" || (credit.finalProposal as any)?.historicalRecord || !inReportPeriod(credit.createdAt,period))continue;
      const status=getCreditStatusLabel(credit.status);
      statuses.set(status,(statuses.get(status)||0)+1);
    }
    for(const e of events){
      const c=clientTotals.get(e.clientId)||{totalAmount:0,ids:new Set<string>()};
      c.totalAmount+=e.amount;c.ids.add(e.creditId);clientTotals.set(e.clientId,c);
    }
    const topClients=Array.from(clientTotals.entries()).map(([id,c])=>{
      const client=clients?.find(x=>x.id===id);
      const name=client?(client.type==="persona_moral"?client.businessName:[client.firstName,client.lastName].filter(Boolean).join(" ")):null;
      return {name:name||"Cliente "+id.slice(-8),totalAmount:c.totalAmount,creditsCount:c.ids.size};
    }).sort((a,b)=>b.totalAmount-a.totalAmount).slice(0,10);
    const monthKey=(d:Date)=>d.toLocaleDateString("es-MX",{month:"short",year:"numeric"});
    const monthly=new Map<string,{ids:Set<string>;amount:number}>();
    const cursor=startOfMonth(period.start);
    while(cursor<=period.end){monthly.set(monthKey(cursor),{ids:new Set<string>(),amount:0});cursor.setMonth(cursor.getMonth()+1);}
    for(const e of events){const month=monthly.get(monthKey(e.date));if(month){month.ids.add(e.creditId);month.amount+=e.amount;}}
    return {totalCredits:creditIds.size,totalAmount,avgCreditAmount:creditIds.size?totalAmount/creditIds.size:0,clientsWithConfirmedDisbursement:clientTotals.size,monthlyTrend:Array.from(monthly.entries()).map(([month,d])=>({month,credits:d.ids.size,amount:d.amount})),statusDistribution:Array.from(statuses.entries()).map(([status,count])=>({status,count})),topClients};
  };
  const reportData=generateReportData();
  const totalCommissions=reportCommissionTotal(commissions||[],period,user);

  const exportToExcel = () => {
    const data = {
      "Resumen": [
        ["Métrica", "Valor"],
        ["Créditos con dispersión confirmada", reportData.totalCredits],
        ["Monto Total", `$${reportData.totalAmount.toFixed(2)}`],
        ["Promedio por Crédito", `$${reportData.avgCreditAmount.toFixed(2)}`],
        ["Clientes con dispersión confirmada", reportData.clientsWithConfirmedDisbursement],
        ["Comisiones generadas (alcance autorizado)", totalCommissions],
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
      writeLine(`Creditos con dispersion confirmada: ${reportData.totalCredits}`);
      writeLine(`Monto Total: $${reportData.totalAmount.toFixed(2)}`);
      writeLine(`Promedio por Credito: $${reportData.avgCreditAmount.toFixed(2)}`);
      writeLine(`Clientes con dispersion confirmada: ${reportData.clientsWithConfirmedDisbursement}`);
      writeLine(`Comisiones generadas (alcance autorizado): $${totalCommissions.toFixed(2)}`);
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
            <div className="cn-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

  if(creditsError||clientsError||commissionsError)return <MainLayout><Header title="Reportes y Analytics"/><main className="p-6"><p role="alert" className="text-sm text-destructive">No fue posible consultar todos los datos autorizados. Actualiza la página antes de exportar.</p></main></MainLayout>;

  return (
    <MainLayout>
      <Header 
        title="Reportes y Analytics"
        subtitle="Análisis detallado del desempeño de tu operación"
      />
        
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6" data-testid="reports-main-content">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Compact Controls Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-40 sm:w-44 h-8 text-xs bg-background border-border rounded-lg text-foreground font-medium" data-testid="select-date-range">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month" className="text-xs">Este mes</SelectItem>
                  <SelectItem value="last_month" className="text-xs">Mes anterior</SelectItem>
                  <SelectItem value="last_6_months" className="text-xs">Últimos 6 meses</SelectItem>
                  <SelectItem value="current_year" className="text-xs">Este año</SelectItem>
                </SelectContent>
              </Select>


            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold border-border hover:bg-muted text-foreground rounded-lg"
                data-testid="button-export-pdf"
                onClick={exportToPDF}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5 text-rose-600 dark:text-rose-400" />
                Exportar PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold border-border hover:bg-muted text-foreground rounded-lg"
                data-testid="button-export-excel"
                onClick={exportToExcel}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                Exportar Excel
              </Button>
            </div>
          </div>

          {/* Compact Key Metrics Grid */}
          <div className="cn-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Métricas 1: Créditos con dispersión confirmada */}
            <Card className="border border-border shadow-sm bg-card">
              <CardContent className="p-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Créditos con dispersión confirmada
                  </p>
                  <p className="cn-kpi-value text-2xl font-bold font-mono text-foreground mt-1" data-testid="metric-total-credits">
                    {reportData.totalCredits}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    En el período seleccionado
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            {/* Métricas 2: Volumen Total */}
            <Card className="border border-border shadow-sm bg-card">
              <CardContent className="p-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Volumen Total
                  </p>
                  <p className="cn-kpi-value text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1" data-testid="metric-total-amount">
                    ${reportData.totalAmount.toLocaleString('es-MX')}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    MXN confirmados en el período
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            {/* Métricas 3: Ticket Promedio */}
            <Card className="border border-border shadow-sm bg-card">
              <CardContent className="p-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Ticket Promedio
                  </p>
                  <p className="cn-kpi-value text-2xl font-bold font-mono text-foreground mt-1" data-testid="metric-avg-amount">
                    ${reportData.avgCreditAmount.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Por crédito con dispersión confirmada
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            {/* Métricas 4: Comisiones Generadas */}
            <Card className="border border-border shadow-sm bg-card">
              <CardContent className="p-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Comisiones Generadas
                  </p>
                  <p className="cn-kpi-value text-2xl font-bold font-mono text-purple-700 dark:text-purple-300 mt-1" data-testid="metric-total-commissions">
                    ${totalCommissions.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {user?.role==="admin"||user?.role==="super_admin"?"Importe generado para la red":"Comisión correspondiente al asesor"} · período
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 flex items-center justify-center flex-shrink-0">
                  <Coins className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly Trend Chart */}
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader className="p-4 pb-2 border-b border-border">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Tendencia Mensual
                </CardTitle>
                <p className="text-xs text-muted-foreground">Dispersiones confirmadas por mes del período seleccionado</p>
              </CardHeader>
              <CardContent className="p-4 pt-3">
                <ReportsChart
                  type="line"
                  data={reportData.monthlyTrend}
                  xKey="month"
                  yKeys={["credits", "amount"]}
                  colors={["#0f172a", "#059669"]}
                />
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader className="p-4 pb-2 border-b border-border">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Distribución por Estado
                </CardTitle>
                <p className="text-xs text-muted-foreground">Créditos registrados en el período según estado actual (sin históricos de seguimiento)</p>
              </CardHeader>
              <CardContent className="p-4 pt-3">
                <ReportsChart
                  type="pie"
                  data={reportData.statusDistribution}
                  xKey="status"
                  yKeys={["count"]}
                  colors={["#0f172a", "#059669", "#2563eb", "#d97706", "#7c3aed"]}
                />
              </CardContent>
            </Card>
          </div>

          {/* Top Clients Table */}
          <Card className="border border-border bg-card shadow-sm overflow-hidden">
            <CardHeader className="p-4 pb-3 border-b border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Top 10 Clientes por Volumen
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Empresas y personas con mayor colocación crediticia</p>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border font-mono">
                  {reportData.topClients.length} registrados
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {reportData.topClients.length === 0 ? (
                <div className="text-center py-10 px-4 bg-muted/20">
                  <BarChart2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-foreground">No hay datos de clientes</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">No se encontraron créditos registrados en el período seleccionado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <th className="py-2.5 px-4">Cliente</th>
                        <th className="text-right py-2.5 px-4">Créditos</th>
                        <th className="text-right py-2.5 px-4">Volumen Total</th>
                        <th className="text-right py-2.5 px-4">Promedio por Crédito</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.topClients.map((client, index) => (
                        <tr 
                          key={index} 
                          className="hover:bg-muted/30 transition-colors"
                          data-testid={`top-client-${index}`}
                        >
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 bg-muted border border-border rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-foreground font-bold text-[10px]">
                                  {client.name.slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">{client.name}</span>
                            </div>
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono font-medium text-foreground">
                            {client.creditsCount}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            ${client.totalAmount.toLocaleString('es-MX')}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-muted-foreground">
                            ${(client.totalAmount / client.creditsCount).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </MainLayout>
  );
}

