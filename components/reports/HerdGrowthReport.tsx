import React, { useState, useEffect } from 'react';
import { useTheme } from '../../services/ThemeContext';
import { api } from '../../services/api';
import { Loader2, TrendingUp, Scale, AlertCircle, ArrowUpRight, ArrowDownRight, Trophy } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface GrowthReportProps {
    tenantId: string;
    startDate: string;
    endDate: string;
}

interface GrowthOverview {
    totalAnimals: number;
    avgWeight: string;
    avgADG: number | string;
    totalHerdWeight: number;
}

interface Performer {
    tag_number: string;
    adg: number;
    current_weight: number;
}

export const HerdGrowthReport: React.FC<GrowthReportProps> = ({ tenantId, startDate, endDate }) => {
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<GrowthOverview | null>(null);
    const [topPerformers, setTopPerformers] = useState<Performer[]>([]);
    const [bottomPerformers, setBottomPerformers] = useState<Performer[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const response = await api.reports.getGrowth(tenantId, startDate, endDate);
                setOverview(response.overview);
                setTopPerformers(response.topPerformers);
                setBottomPerformers(response.bottomPerformers);
            } catch (err: any) {
                console.error('Failed to load growth report:', err);
                setError('Failed to load data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [startDate, endDate]);

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center h-64 text-red-500">
            <AlertCircle size={32} className="mb-2" />
            <p>{error}</p>
        </div>
    );

    if (!overview) return null;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                            <TrendingUp size={20} />
                        </div>
                        <span className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Avg Daily Gain</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white">{Number(overview.avgADG).toFixed(2)}</h3>
                        <span className="text-sm font-medium text-slate-400">kg/day</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-emerald-600 dark:text-blue-400">
                            <Scale size={20} />
                        </div>
                        <span className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Avg Herd Weight</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white">{Number(overview.avgWeight).toFixed(1)}</h3>
                        <span className="text-sm font-medium text-slate-400">kg</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-violet-600 dark:text-violet-400">
                            <Scale size={20} />
                        </div>
                        <span className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Biomass</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white">{(overview.totalHerdWeight / 1000).toFixed(1)}</h3>
                        <span className="text-sm font-medium text-slate-400">Tons</span>
                    </div>
                </div>
            </div>

            {/* Performance Lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Performers */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <Trophy size={18} className="text-yellow-500" />
                        Top Gainers
                    </h3>
                    <div className="space-y-3">
                        {topPerformers.map((animal, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-slate-700/30 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="font-bold text-slate-700 dark:text-slate-200 w-8 text-center">{idx + 1}</div>
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white">{animal.tag_number}</p>
                                        <p className="text-xs text-slate-500">{Number(animal.current_weight).toFixed(0)} kg</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                        <ArrowUpRight size={14} />
                                        {Number(animal.adg).toFixed(2)}
                                    </p>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">kg/day</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Performers */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <AlertCircle size={18} className="text-rose-500" />
                        Low Gainers (Check Health)
                    </h3>
                    <div className="space-y-3">
                        {bottomPerformers.map((animal, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-slate-700/30 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="font-bold text-slate-700 dark:text-slate-200 w-8 text-center">{idx + 1}</div>
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white">{animal.tag_number}</p>
                                        <p className="text-xs text-slate-500">{Number(animal.current_weight).toFixed(0)} kg</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                                        <ArrowDownRight size={14} />
                                        {Number(animal.adg).toFixed(2)}
                                    </p>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">kg/day</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
