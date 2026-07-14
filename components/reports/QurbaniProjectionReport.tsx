import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useTheme } from '../../services/ThemeContext';
import { Cattle, CattleStatus } from '../../types';
import { TrendingUp, Banknote, Calendar, Calculator } from 'lucide-react';

interface QurbaniProjectionReportProps {
    cattle: Cattle[];
    tenant: any; // Using any or Tenant to avoid prop drilling issues in smaller files
}

export const QurbaniProjectionReport: React.FC<QurbaniProjectionReportProps> = ({ cattle, tenant }) => {
    const { isDarkMode } = useTheme();
    const currencySymbol = tenant?.currency === 'PKR' ? 'Rs.' :
        tenant?.currency === 'USD' ? '$' :
            tenant?.currency === 'EUR' ? '€' :
                tenant?.currency === 'GBP' ? '£' :
                    tenant?.currency === 'INR' ? '₹' : 'Rs.';
    const weightUnit = tenant?.weightUnit || 'kg';

    // Default target date is roughly 3 months from now (simulating Eid proximity)
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 3);

    const [targetDate, setTargetDate] = useState(futureDate.toISOString().split('T')[0]);
    const [pricePerKg, setPricePerKg] = useState<number>(1200); // Default market rate
    const [dailyFeedCost, setDailyFeedCost] = useState<number>(500); // Estimated daily cost per animal

    // Process Projections
    const projectionData = useMemo(() => {
        const today = new Date();
        const target = new Date(targetDate);

        let daysUntilTarget = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilTarget < 0) daysUntilTarget = 0; // Prevent reverse math

        const qurbaniAnimals = cattle.filter(c =>
            c.status !== CattleStatus.SOLD &&
            c.status !== CattleStatus.DEAD &&
            c.status !== CattleStatus.DECEASED &&
            (c.qurbaniDetails?.isBooked || c.status === CattleStatus.BOOKED_QURBANI) // Only analyze Qurbani stock
        );

        return qurbaniAnimals.map(c => {
            // Calculate historical ADG (Average Daily Gain)
            let adg = 0.8; // Fallback conservative ADG: 800 grams/day

            const daysOnFarm = Math.max(1, Math.floor((today.getTime() - new Date(c.entryDate).getTime()) / (1000 * 60 * 60 * 24)));
            const actualGain = c.currentWeight - c.entryWeight;

            if (actualGain > 0 && daysOnFarm > 0) {
                adg = actualGain / daysOnFarm;
            }

            // Cap absurdly high ADGs for realistic forecasting (max 2kg/day)
            adg = Math.min(adg, 2.0);

            const projectedWeightGain = adg * daysUntilTarget;
            const finalWeight = c.currentWeight + projectedWeightGain;

            // Financials
            const projectedFutureFeedCost = dailyFeedCost * daysUntilTarget;
            const sunkCost = c.purchasePrice + (c.feedCostHistory?.reduce((sum, h) => sum + h.feedCost, 0) || (daysOnFarm * 500));
            const totalEstimatedCost = sunkCost + projectedFutureFeedCost;

            // Expected Revenue
            const agreedSalePrice = c.qurbaniDetails?.agreedPrice || 0;
            const estimatedSaleValue = agreedSalePrice > 0 ? agreedSalePrice : (finalWeight * pricePerKg);

            const projectedProfit = estimatedSaleValue - totalEstimatedCost;
            const roiPercent = totalEstimatedCost > 0 ? (projectedProfit / totalEstimatedCost) * 100 : 0;

            return {
                id: c.id,
                tag: c.tagNumber,
                currentWeight: c.currentWeight,
                adg: Number(adg.toFixed(2)),
                projectedWeight: Number(finalWeight.toFixed(1)),
                estimatedValue: Number(estimatedSaleValue.toFixed(0)),
                totalCost: Number(totalEstimatedCost.toFixed(0)),
                projectedProfit: Number(projectedProfit.toFixed(0)),
                roi: Number(roiPercent.toFixed(1)),
                hasFixedPrice: agreedSalePrice > 0
            };
        }).sort((a, b) => b.projectedProfit - a.projectedProfit);

    }, [cattle, targetDate, pricePerKg, dailyFeedCost]);

    // Aggregate Totals
    const summary = useMemo(() => {
        return projectionData.reduce((acc, curr) => ({
            totalAnimals: acc.totalAnimals + 1,
            totalProjectedValue: acc.totalProjectedValue + curr.estimatedValue,
            totalEstimatedCost: acc.totalEstimatedCost + curr.totalCost,
            totalProjectedProfit: acc.totalProjectedProfit + curr.projectedProfit,
        }), { totalAnimals: 0, totalProjectedValue: 0, totalEstimatedCost: 0, totalProjectedProfit: 0 });
    }, [projectionData]);


    if (cattle.filter(c => c.qurbaniDetails?.isBooked || c.status === CattleStatus.BOOKED_QURBANI).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Calculator size={32} className="mb-2 opacity-50" />
                <p>No Qurbani stock found. Mark animals as Qurbani to forecast their growth.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Control Panel */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 lg:p-8 border border-white/20 dark:border-slate-700/50 shadow-lg flex flex-col md:flex-row gap-6 items-end relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="flex-1 w-full relative z-10">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Target Date (Eid)</label>
                    <div className="relative group/input">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-emerald-500 transition-colors" size={20} />
                        <input
                            type="date"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border-2 border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-medium shadow-sm hover:border-emerald-300 dark:hover:border-slate-600"
                        />
                    </div>
                </div>
                <div className="flex-1 w-full relative z-10">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Est. Live Rate ({currencySymbol}/{weightUnit})</label>
                    <input
                        type="number"
                        min="500"
                        value={pricePerKg}
                        onChange={(e) => setPricePerKg(Number(e.target.value))}
                        className="w-full px-5 py-3 border-2 border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-bold shadow-sm hover:border-emerald-300 dark:hover:border-slate-600"
                    />
                </div>
                <div className="flex-1 w-full relative z-10">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Avg. Daily Feed Cost ({currencySymbol})</label>
                    <input
                        type="number"
                        min="100"
                        value={dailyFeedCost}
                        onChange={(e) => setDailyFeedCost(Number(e.target.value))}
                        className="w-full px-5 py-3 border-2 border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-bold shadow-sm hover:border-emerald-300 dark:hover:border-slate-600"
                    />
                </div>
            </div>

            {/* Top Summaries */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-3xl p-6 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150"></div>
                    <div className="relative z-10">
                        <p className="text-emerald-100 font-bold uppercase tracking-wide text-sm mb-1">Projected Stock Value</p>
                        <h3 className="text-4xl lg:text-5xl font-black mb-1 drop-shadow-sm">{currencySymbol} {summary.totalProjectedValue.toLocaleString()}</h3>
                        <p className="text-sm font-medium text-emerald-100/90 bg-black/10 inline-block px-3 py-1 rounded-full mt-2 backdrop-blur-sm border border-white/10">Across {summary.totalAnimals} animals</p>
                    </div>
                </div>

                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex items-center justify-between group">
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide text-sm mb-2 group-hover:text-amber-500 transition-colors">Total Estimated Cost</p>
                        <h3 className="text-3xl font-black text-slate-800 dark:text-white">{currencySymbol} {summary.totalEstimatedCost.toLocaleString()}</h3>
                        <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-2 bg-amber-50 dark:bg-amber-500/10 inline-block px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-500/20">Sunk + Future up to target</p>
                    </div>
                </div>

                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex items-center justify-between group">
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide text-sm mb-2 group-hover:text-emerald-500 transition-colors">Est. Net Profit</p>
                        <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600 drop-shadow-sm">{currencySymbol} {summary.totalProjectedProfit.toLocaleString()}</h3>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-inner group-hover:scale-110 transition-transform">
                        <Banknote size={32} />
                    </div>
                </div>
            </div>

            {/* Projection Chart & Table */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Expected Value vs Cost Trajectory */}
                <div className="lg:col-span-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 lg:p-8 border border-white/20 dark:border-slate-700/50 shadow-lg">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-8 flex items-center gap-3">
                        <div className="w-2 h-6 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-full"></div>
                        Profitability Spread (per Animal)
                    </h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={projectionData.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                                <XAxis dataKey="tag" tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    formatter={(value: number) => `${currencySymbol} ${value.toLocaleString()}`}
                                    contentStyle={{
                                        backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                                        borderRadius: '16px',
                                        border: '1px solid ' + (isDarkMode ? '#334155' : '#e2e8f0'),
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                                    }}
                                    itemStyle={{ color: isDarkMode ? '#fff' : '#0f172a', fontWeight: 'bold' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Line type="monotone" name="Proj. Sale Value" dataKey="estimatedValue" stroke="#10b981" strokeWidth={4} dot={{ r: 5, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
                                <Line type="monotone" name="Total Cost" dataKey="totalCost" stroke="#ef4444" strokeWidth={4} dot={{ r: 5, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Growth Table */}
                <div className="lg:col-span-1 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 lg:p-8 border border-white/20 dark:border-slate-700/50 shadow-lg flex flex-col">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                        <div className="w-2 h-6 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full"></div>
                        Weight Projections
                    </h3>
                    <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                                    <th className="pb-4">Animal</th>
                                    <th className="pb-4 text-right">ADG</th>
                                    <th className="pb-4 text-right">Est. Weight</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {projectionData.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors group">
                                        <td className="py-4 font-bold text-slate-900 dark:text-white">
                                            {row.tag}
                                            {row.hasFixedPrice && <span className="block text-[10px] font-black uppercase text-emerald-500 mt-1">Locked Price</span>}
                                        </td>
                                        <td className="py-4 text-right text-slate-600 dark:text-slate-400 font-medium bg-slate-50/0 group-hover:bg-slate-100/50 dark:group-hover:bg-slate-700/50 transition-colors rounded-lg">{row.adg} {weightUnit}/d</td>
                                        <td className="py-4 text-right font-black text-lg text-slate-900 dark:text-white">
                                            {row.projectedWeight} <span className="text-xs text-slate-500 font-medium">{weightUnit}</span>
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
