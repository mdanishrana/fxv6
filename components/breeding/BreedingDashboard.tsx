import React from 'react';
import { Activity, Baby, Calendar, Info, Droplet, TrendingUp, Clock, ShieldAlert } from 'lucide-react';
import { BreedingStats } from '../../types';
import { useTheme } from '../../services/ThemeContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';

interface BreedingDashboardProps {
    stats: BreedingStats;
    upcomingCalvings: any[];
    milkStats?: {
        productionTrend: { date: string; yield: number }[];
        breedYields: { breed: string; yield: number }[];
        lactationStages: { name: string; value: number }[];
    } | null;
    gestationStats?: {
        expectedSchedule: {
            cycle_id: string;
            animal_id: string;
            mother_tag: string;
            breed: string;
            service_date: string;
            expected_calving_date: string;
            days_remaining: number;
            sire_code: string | null;
        }[];
        calvingIntervals: {
            animalId: string;
            tagNumber: string;
            avgIntervalDays: number;
            calvingsCount: number;
        }[];
        herdAverageInterval: number | null;
    } | null;
}

const COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#64748b'];

export function BreedingDashboard({ stats, upcomingCalvings, milkStats, gestationStats }: BreedingDashboardProps) {
    const { t, isDarkMode } = useTheme();

    const productionTrend = milkStats?.productionTrend || [];
    const breedYields = milkStats?.breedYields || [];
    const lactationStages = milkStats?.lactationStages || [];

    const expectedSchedule = gestationStats?.expectedSchedule || [];
    const calvingIntervals = gestationStats?.calvingIntervals || [];
    const herdAverageInterval = gestationStats?.herdAverageInterval;

    // Local Translation Helper
    const translateStage = (name: string) => {
        if (name === 'Early (0-90d)') return t('early_lactation') || 'Early Lactation (0-90d)';
        if (name === 'Mid (91-200d)') return t('mid_lactation') || 'Mid Lactation (91-200d)';
        if (name === 'Late (201-305d)') return t('late_lactation') || 'Late Lactation (201-305d)';
        if (name === 'Extended (305d+)') return t('extended_lactation') || 'Extended Lactation (305d+)';
        if (name === 'Dry Period') return t('dry_period') || 'Dry Period';
        return name;
    };

    // Calculate herd interval benchmark rating
    const getIntervalRating = (days: number) => {
        if (days >= 340 && days <= 410) return { label: 'Optimal (12-13 mo)', color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-800/30' };
        if (days > 410) return { label: 'Extended (>13.5 mo)', color: 'text-amber-700 bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-800/30' };
        return { label: 'Short (<11 mo)', color: 'text-blue-700 bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-800/30' };
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Open Cows */}
                <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.15)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <Activity className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Open</span>
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">{t('open_cows') || 'Open Cows'}</p>
                        <h3 className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{stats?.open_cycles || 0}</h3>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-2">Ready for breeding service</p>
                    </div>
                </div>

                {/* Pregnant Cows */}
                <div className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <Baby className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Gestation</span>
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">{t('confirmed_pregnant') || 'Pregnant'}</p>
                        <h3 className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{stats?.pregnant_cows || 0}</h3>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-2">Active gestation period</p>
                    </div>
                </div>

                {/* Recent Calvings */}
                <div className="group bg-gradient-to-br from-purple-50 via-fuchsia-50 to-purple-50 dark:from-purple-950/40 dark:to-fuchsia-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(168,85,247,0.15)] hover:shadow-[0_8px_30px_rgb(168,85,247,0.3)] border border-purple-100 dark:border-purple-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-purple-100 dark:border-purple-900/50 text-purple-600 dark:text-purple-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Records</span>
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">{t('recent_calvings') || 'Recent Calvings'}</p>
                        <h3 className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{stats?.recent_calvings || 0}</h3>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-2">Total calving events logged</p>
                    </div>
                </div>

                {/* Avg Calving Interval */}
                <div className="group bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(251,191,36,0.15)] hover:shadow-[0_8px_30px_rgb(251,191,36,0.3)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-amber-100 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <Clock className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Interval</span>
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Avg Calving Interval</p>
                        <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                            {herdAverageInterval ? `${herdAverageInterval} days` : 'N/A'}
                        </h3>
                        {herdAverageInterval ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-bold mt-2 ${getIntervalRating(herdAverageInterval).color}`}>
                                {getIntervalRating(herdAverageInterval).label}
                            </span>
                        ) : (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-2">Needs multiple births</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Milk Production Trend Curve */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <TrendingUp className="text-blue-500" size={20} />
                            Total Farm Milk Production Trend
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Daily sum of morning and evening yields over the last 30 days.</p>
                    </div>
                </div>

                <div className="h-72 w-full">
                    {productionTrend.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <Droplet size={32} className="text-slate-300 mb-2" />
                            <p className="font-medium text-sm">No milking data logged yet.</p>
                            <p className="text-xs">Milking records will generate this curve automatically.</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={productionTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="milkYield" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                                        borderColor: isDarkMode ? '#475569' : '#e2e8f0',
                                        borderRadius: '12px',
                                        color: isDarkMode ? '#f8fafc' : '#1e293b'
                                    }}
                                    formatter={(value: any) => [`${value} Liters`, 'Total Production']}
                                />
                                <Area type="monotone" dataKey="yield" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#milkYield)" dot={{ r: 4, strokeWidth: 2 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Lactation Stages & Breed Productivity Graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lactation Stage breakdown */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Info className="text-emerald-500" size={20} />
                            Lactation Cycles & Dry Period
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Breakdown of the active milking herd by stage of lactation.</p>
                    </div>

                    <div className="h-64 w-full flex items-center justify-center mt-6">
                        {lactationStages.length === 0 ? (
                            <div className="text-slate-400 text-center">
                                <p className="font-medium text-sm">No lactation data available.</p>
                                <p className="text-xs">Start lactations via Calving events to view stages.</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={lactationStages}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {lactationStages.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                                            borderColor: isDarkMode ? '#475569' : '#e2e8f0',
                                            borderRadius: '12px'
                                        }}
                                        formatter={(value: any, name: any) => [value, translateStage(name)]}
                                    />
                                    <Legend
                                        verticalAlign="bottom"
                                        height={36}
                                        iconType="circle"
                                        formatter={(value) => <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{translateStage(value)}</span>}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Breed Productivity comparison */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Droplet className="text-indigo-500" size={20} />
                            Milk Yield by Breed
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Average daily yield comparison (Liters/day) by breed.</p>
                    </div>

                    <div className="h-64 w-full mt-6">
                        {breedYields.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-400 text-center">
                                <p className="font-medium text-sm">No breed metrics available.</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={breedYields} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                                    <XAxis dataKey="breed" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                                            borderColor: isDarkMode ? '#475569' : '#e2e8f0',
                                            borderRadius: '12px'
                                        }}
                                        formatter={(value: any) => [`${value} L/day`, 'Avg. Yield']}
                                    />
                                    <Bar dataKey="yield" fill="#6366f1" radius={[8, 8, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Expected Calving & Gestation Schedule */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Clock className="text-emerald-500" size={20} />
                        Gestation & Expected Calving Schedule
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    {expectedSchedule.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <ShieldAlert className="mx-auto h-12 w-12 text-slate-200 dark:text-slate-700 mb-3" />
                            <p className="font-medium text-slate-500 dark:text-slate-400">No active gestation cycles tracked.</p>
                            <p className="text-sm">Expectant mothers with confirmed pregnancy will appear here.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-700/30 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-700 uppercase tracking-wider text-xs">
                                <tr>
                                    <th className="px-6 py-3.5">Mother Tag</th>
                                    <th className="px-6 py-3.5">Breed</th>
                                    <th className="px-6 py-3.5">Service Date</th>
                                    <th className="px-6 py-3.5">Sire (Bull/Straw)</th>
                                    <th className="px-6 py-3.5">Expected Due Date</th>
                                    <th className="px-6 py-3.5 text-right">Days Remaining</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {expectedSchedule.map((cycle, idx) => {
                                    const days = cycle.days_remaining;
                                    const isOverdue = days < 0;
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                                            <td className="px-6 py-3.5 font-bold text-slate-800 dark:text-slate-100">
                                                {cycle.mother_tag}
                                            </td>
                                            <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">
                                                {cycle.breed}
                                            </td>
                                            <td className="px-6 py-3.5 text-slate-600 dark:text-slate-300 font-mono">
                                                {new Date(cycle.service_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td className="px-6 py-3.5">
                                                {cycle.sire_code ? (
                                                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg text-xs font-semibold font-mono border border-slate-200 dark:border-slate-600">
                                                        {cycle.sire_code}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 text-xs italic">Not Specified</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3.5 text-slate-800 dark:text-slate-200 font-bold">
                                                {new Date(cycle.expected_calving_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td className="px-6 py-3.5 text-right">
                                                {isOverdue ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1 rounded-lg border border-rose-100 dark:border-rose-900/30">
                                                        Overdue by {Math.abs(days)} days
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                                        {days} days left
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Calving Intervals Listing */}
            {calvingIntervals.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/50">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Clock className="text-blue-500" size={20} />
                            Individual Cow Calving Intervals
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Detailed history of days between successive births for multi-calving cows.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-700/30 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-700 uppercase tracking-wider text-xs">
                                <tr>
                                    <th className="px-6 py-3.5">Animal Tag</th>
                                    <th className="px-6 py-3.5">Calvings Recorded</th>
                                    <th className="px-6 py-3.5 text-right">Average Calving Interval (Days)</th>
                                    <th className="px-6 py-3.5 text-right">Rating</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {calvingIntervals.map((interval, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                                        <td className="px-6 py-3.5 font-bold text-slate-800 dark:text-slate-100">
                                            {interval.tagNumber}
                                        </td>
                                        <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 font-semibold">
                                            {interval.calvingsCount} births
                                        </td>
                                        <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                                            {interval.avgIntervalDays} days
                                        </td>
                                        <td className="px-6 py-3.5 text-right">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-lg ${getIntervalRating(interval.avgIntervalDays).color}`}>
                                                {getIntervalRating(interval.avgIntervalDays).label}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Upcoming Calvings List */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Calendar className="text-orange-500" size={20} />
                        {t('upcoming_calvings') || 'Upcoming Calvings'} <span className="text-slate-400 font-normal text-sm ml-2">(Next 30 Days)</span>
                    </h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {upcomingCalvings.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Calendar className="mx-auto h-12 w-12 text-slate-200 dark:text-slate-700 mb-3" />
                            <p className="font-medium text-slate-500 dark:text-slate-400">No upcoming calvings.</p>
                            <p className="text-sm">Expectant mothers will appear here.</p>
                        </div>
                    ) : (
                        upcomingCalvings.map((calving, idx) => (
                            <div key={idx} className="p-4 sm:p-5 hover:bg-white dark:hover:bg-slate-700/30 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between group gap-4">
                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                    <div className="h-10 w-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-sm shrink-0">
                                        {calving.tag_number.substring(0, 2)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-slate-800 dark:text-slate-100 text-lg flex flex-wrap items-center gap-2">
                                            {calving.tag_number}
                                            <span className="text-[10px] bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded-full uppercase tracking-wide border border-slate-200 dark:border-slate-600 whitespace-nowrap">{calving.breed}</span>
                                        </p>
                                        <p className="text-xs text-slate-400 mt-0.5 truncate">Expected Due Date</p>
                                    </div>
                                </div>
                                <div className="text-left sm:text-right w-full sm:w-auto pl-14 sm:pl-0">
                                    <div className="font-bold text-slate-700 dark:text-slate-200 text-lg">{new Date(calving.expected_calving_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-lg border border-orange-100 dark:border-orange-800/30 mt-1">
                                        Due Soon
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
