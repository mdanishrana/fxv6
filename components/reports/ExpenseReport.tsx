import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { useTheme } from '../../services/ThemeContext';
import { api } from '../../services/api';
import { Loader2, DollarSign, AlertCircle } from 'lucide-react';

interface ExpenseReportProps {
    tenantId: string;
    startDate: string;
    endDate: string;
}

export const ExpenseReport: React.FC<ExpenseReportProps> = ({ tenantId, startDate, endDate }) => {
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ name: string; value: number }[]>([]);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const response = await api.reports.getExpenses(tenantId, startDate, endDate);
                setData(response.breakdown);
                setTotal(response.total);
            } catch (err: any) {
                console.error('Failed to load expense report:', err);
                setError('Failed to load data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [startDate, endDate]);

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-violet-500" size={32} />
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center h-64 text-red-500">
            <AlertCircle size={32} className="mb-2" />
            <p>{error}</p>
        </div>
    );

    if (data.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <DollarSign size={32} className="mb-2 opacity-50" />
            <p>No expense data found for this period.</p>
        </div>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Overview Card */}
            <div className="col-span-1 lg:col-span-2 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-violet-500/20">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                        <DollarSign size={32} />
                    </div>
                    <div>
                        <p className="text-violet-100 font-medium">Total Expenses</p>
                        <h2 className="text-4xl font-bold">Rs. {total.toLocaleString()}</h2>
                    </div>
                </div>
            </div>

            {/* Distribution Chart (Pie) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Cost Distribution</h3>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={120}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(value: number) => `Rs. ${value.toLocaleString()}`}
                                contentStyle={{
                                    backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                }}
                                itemStyle={{ color: isDarkMode ? '#fff' : '#0f172a' }}
                            />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Breakdown Chart (Bar) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Category Breakdown</h3>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                            <XAxis type="number" hide />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={100}
                                tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12, fontWeight: 500 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                formatter={(value: number) => `Rs. ${value.toLocaleString()}`}
                                contentStyle={{
                                    backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                }}
                                itemStyle={{ color: isDarkMode ? '#fff' : '#0f172a' }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
