import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { BarChart2 } from 'lucide-react';

interface ReportsChartProps {
  type: 'line' | 'bar' | 'pie';
  data: any[];
  xKey?: string;
  yKeys?: string[];
  colors?: string[];
  height?: number;
}

const DEFAULT_COLORS = ['#0f172a', '#059669', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#475569'];

export default function ReportsChart({ 
  type, 
  data, 
  xKey, 
  yKeys = [], 
  colors = DEFAULT_COLORS, 
  height = 300 
}: ReportsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <BarChart2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs font-semibold text-foreground">No hay datos para mostrar</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Selecciona otro período de tiempo</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('es-MX')}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover/95 backdrop-blur-sm p-3 border border-border rounded-xl shadow-sm text-xs">
          <p className="font-bold text-popover-foreground mb-1">{label}</p>
          {payload.map((item: any, index: number) => (
            <p key={index} className="flex items-center gap-1.5 py-0.5 text-xs">
              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground font-medium">{item.name}:</span>
              <span className="font-bold font-mono text-popover-foreground">
                {typeof item.value === 'number' && item.dataKey?.includes('amount') 
                  ? formatCurrency(item.value)
                  : item.value
                }
              </span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  switch (type) {
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis 
              dataKey={xKey} 
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            {yKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 3, fill: colors[index % colors.length] }}
                activeDot={{ r: 5 }}
                name={key === 'credits' ? 'Créditos' : key === 'amount' ? 'Monto' : key}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey={xKey} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            {yKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[index % colors.length]}
                radius={[4, 4, 0, 0]}
                name={key === 'credits' ? 'Créditos' : key === 'amount' ? 'Monto' : key}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case 'pie':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={85}
              fill="#0f172a"
              dataKey={yKeys[0] || 'value'}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="hsl(var(--background))" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      );

    default:
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-xs text-muted-foreground">Tipo de gráfico no soportado</p>
        </div>
      );
  }
}
