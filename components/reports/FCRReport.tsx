import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, LineChart, Line } from 'recharts';
import { useTheme } from '../../services/ThemeContext';
import { Cattle, CattleStatus } from '../../types';
import { Scale, TrendingUp, AlertTriangle } from 'lucide-react';

interface FCRReportProps {
    cattle: Cattle[];
}

export const FCRReport: React.FC<FCRReportProps> = ({ cattle }) => {
    const { isDarkMode } = useTheme();

    // Calculate FCR data
    const fcrData = useMemo(() => {
        return cattle
            .filter(c => c.status !== CattleStatus.SOLD && c.status !== CattleStatus.DEAD && c.status !== CattleStatus.DECEASED)
            .map(c => {
                // Approximate total weight gained
                const weightGained = c.currentWeight - c.entryWeight;

                // Approximate total feed consumed (simplified based on history)
                // In a perfect system, we'd have exact Kg of feed. Here we use feedCostHistory or an estimation if missing.
                let totalFeedConsumedKg = 0;

                if (c.feedCostHistory && c.feedCostHistory.length > 0) {
                    // Assuming average 120 PKR per kg of feed if we only have cost history
                    const totalCost = c.feedCostHistory.reduce((sum, h) => sum + h.feedCost, 0);
                    totalFeedConsumedKg = totalCost / 120; // Estimated Conversion
                } else {
                    // Fallback estimation: Cattle eat ~3% of body weight daily.
                    // This is a rough estimation if actual logs are missing.
                    const daysOnFarm = Math.max(1, Math.floor((new Date().getTime() - new Date(c.entryDate).getTime()) / (1000 * 60 * 60 * 24)));
                    const avgWeight = (c.entryWeight + c.currentWeight) / 2;
                    totalFeedConsumedKg = (avgWeight * 0.03) * daysOnFarm;
                }

                // FCR = Feed Intake / Weight Gain
                // A lower FCR is better (e.g., 6:1 means 6kg feed for 1kg gain)
                const fcr = weightGained > 0 ? (totalFeedConsumedKg / weightGained) : 0;

                return {
                    id: c.id,
                    tag: c.tagNumber,
                    breed: c.breed,
                    weightGained: Number(weightGained.toFixed(2)),
                    feedConsumed: Number(totalFeedConsumedKg.toFixed(2)),
                    fcr: Number(fcr.toFixed(2)),
                    isWarning: fcr > 10 || fcr <= 0 // High FCR or negative gain is bad
                };
            })
            .filter(d => d.fcr > 0 && d.fcr < 20) // Filter out absurd outliers for graphing
            .sort((a, b) => a.fcr - b.fcr); // Sort best to worst
    }, [cattle]);

    const averageFCR = useMemo(() => {
        if (fcrData.length === 0) return 0;
        const totalFCR = fcrData.reduce((sum, item) => sum + item.fcr, 0);
        return Number((totalFCR / fcrData.length).toFixed(2));
    }, [fcrData]);

    const bestPerformers = fcrData.slice(0, 5);
    const worstPerformers = [...fcrData].reverse().slice(0, 5);

    if (cattle.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Scale size={32} className="mb-2 opacity-50" />
                <p>No cattle data available for FCR calculation.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150"></div>
                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <p className="text-indigo-100 font-medium mb-1 tracking-wide text-sm uppercase">Herd Average FCR</p>
                            <h3 className="text-5xl font-black mb-1">{averageFCR}</h3>
                            <p className="text-sm text-indigo-200 font-medium">Kg feed per Kg gain</p>
                        </div>
                        <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner">
                            <Scale size={28} className="text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative z-10 p-4 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-sm">
                        <TrendingUp size={28} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold tracking-wide uppercase mb-1">Best Performer</p>
                        <h4 className="text-2xl font-black text-slate-800 dark:text-white">
                            {bestPerformers[0] ? `Tag ${bestPerformers[0].tag}` : 'N/A'}
                        </h4>
                        <p className="text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center gap-1">
                            {bestPerformers[0] ? `${bestPerformers[0].fcr} FCR` : '-'}
                        </p>
                    </div>
                </div>

                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative z-10 p-4 bg-gradient-to-br from-rose-100 to-pink-100 dark:from-rose-900/40 dark:to-pink-900/40 text-rose-600 dark:text-rose-400 rounded-2xl shadow-sm">
                        <AlertTriangle size={28} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold tracking-wide uppercase mb-1">Needs Attention</p>
                        <h4 className="text-2xl font-black text-slate-800 dark:text-white">
                            {worstPerformers[0] ? `Tag ${worstPerformers[0].tag}` : 'N/A'}
                        </h4>
                        <p className="text-rose-600 dark:text-rose-400 text-sm font-bold flex items-center gap-1">
                            {worstPerformers[0] ? `${worstPerformers[0].fcr} FCR` : '-'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Distribution Chart */}
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 lg:p-8 border border-white/20 dark:border-slate-700/50 shadow-lg">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-8 flex items-center gap-3">
                        <div className="w-2 h-6 bg-gradient-to-b from-indigo-500 to-violet-500 rounded-full"></div>
                        FCR Distribution (Top 15)
                    </h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={fcrData.slice(0, 15)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                                <XAxis dataKey="tag" tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: isDarkMode ? '#1e293b' : '#f1f5f9' }}
                                    contentStyle={{
                                        backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                    }}
                                    itemStyle={{ color: isDarkMode ? '#fff' : '#0f172a' }}
                                />
                                <Bar dataKey="fcr" radius={[4, 4, 0, 0]}>
                                    {fcrData.slice(0, 15).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.isWarning ? '#ef4444' : (entry.fcr < averageFCR ? '#10b981' : '#3b82f6')} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Efficiency Table */}
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 lg:p-8 border border-white/20 dark:border-slate-700/50 shadow-lg overflow-hidden flex flex-col">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                        <div className="w-2 h-6 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
                        Detailed Breakdown
                    </h3>
                    <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm uppercase tracking-wider">
                                    <th className="pb-4 font-bold">Tag</th>
                                    <th className="pb-4 font-bold text-right">Feed Consumed</th>
                                    <th className="pb-4 font-bold text-right">Weight Gained</th>
                                    <th className="pb-4 font-bold text-right">FCR</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {fcrData.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors group">
                                        <td className="py-4 font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                                            {row.isWarning && (
                                                <div className="p-1.5 bg-rose-100 dark:bg-rose-900/30 text-rose-500 rounded-lg">
                                                    <AlertTriangle size={14} />
                                                </div>
                                            )}
                                            {row.tag}
                                        </td>
                                        <td className="py-4 text-right text-slate-600 dark:text-slate-300 font-medium">{row.feedConsumed} kg</td>
                                        <td className="py-4 text-right text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50/0 group-hover:bg-emerald-50/50 dark:group-hover:bg-emerald-900/10 transition-colors rounded-lg">+{row.weightGained} kg</td>
                                        <td className={`py-4 text-right font-black text-lg ${row.isWarning ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
                                            {row.fcr}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
