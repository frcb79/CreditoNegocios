import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

interface ReportsChartProps {
  type: 'line' | 'bar' | 'pie';
  data: any[];
  xKey?: string;
  yKeys?: string[];
  colors?: string[];
  height?: number;
}

const DEFAULT_COLORS = ['#1E40AF', '#059669', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

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
          <i className="fas fa-chart-line text-4xl text-gray-300 mb-4"></i>
          <p className="text-neutral">No hay datos para mostrar</p>
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
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{label}</p>
          {payload.map((item: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: item.color }}>
              {item.name}: {typeof item.value === 'number' && item.dataKey?.includes('amount') 
                ? formatCurrency(item.value)
                : item.value
              }
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
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey={xKey} 
              stroke="#666"
              fontSize={12}
            />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {yKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name={key === 'credits' ? 'Créditos' : key === 'amount' ? 'Monto' : key}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={xKey} stroke="#666" fontSize={12} />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {yKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[index % colors.length]}
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
              outerRadius={80}
              fill="#8884d8"
              dataKey={yKeys[0] || 'value'}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      );

    default:
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-neutral">Tipo de gráfico no soportado</p>
        </div>
      );
  }
}
