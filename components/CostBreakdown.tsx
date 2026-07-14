import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { DollarSign, Plus, Trash2, Loader2, TrendingUp, ShoppingCart, Stethoscope, Syringe, Users, MoreHorizontal, Calendar, FileText, X, Package } from 'lucide-react';
import { useTheme } from '../services/ThemeContext';

const API_URL = '/api';

const getAuthHeaders = (tenantId: string) => {
    const token = localStorage.getItem('farmxpert_token');
    return {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

interface CostSummary {
    purchaseCost: number;
    feedCost: number;
    medicalCost: number;
    vaccinationCost: number;
    laborCost: number;
    otherCost: number;
    grandTotal: number;
    daysOnFarm: number;
    feedCostPerDay: number;
    packageName: string | null;
}

interface CostItem {
    id: string;
    costType: 'MEDICAL' | 'VACCINATION' | 'LABOR' | 'OTHER';
    amount: number;
    description: string;
    date: string;
    createdAt: string;
}

interface CostBreakdownProps {
    cattleId: string;
    tagNumber: string;
    tenantId: string;
    isRTL?: boolean;
}

const COST_COLORS = {
    purchase: '#059669',
    feed: '#0891b2',
    medical: '#dc2626',
    vaccination: '#8b5cf6',
    labor: '#f59e0b',
    other: '#6b7280'
};

const COST_TYPES = [
    { value: 'MEDICAL', label: 'Medical', labelUrdu: 'طبی', icon: Stethoscope, color: COST_COLORS.medical },
    { value: 'VACCINATION', label: 'Vaccination', labelUrdu: 'ویکسینیشن', icon: Syringe, color: COST_COLORS.vaccination },
    { value: 'LABOR', label: 'Labor', labelUrdu: 'مزدوری', icon: Users, color: COST_COLORS.labor },
    { value: 'OTHER', label: 'Other', labelUrdu: 'دیگر', icon: MoreHorizontal, color: COST_COLORS.other }
];

export const CostBreakdown: React.FC<CostBreakdownProps> = ({ cattleId, tagNumber, tenantId, isRTL = false }) => {
    const { isDarkMode } = useTheme();
    const [summary, setSummary] = useState<CostSummary | null>(null);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');

    const [newCost, setNewCost] = useState({
        costType: 'MEDICAL' as CostItem['costType'],
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0]
    });

    const fetchCosts = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch(`${API_URL}/cattle/${cattleId}/costs`, {
                headers: getAuthHeaders(tenantId)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to load costs');
            setSummary(data.summary);
            setCostItems(data.costItems);
        } catch (err: any) {
            setError(err.message || 'Failed to load cost breakdown');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCosts();
    }, [cattleId]);

    const handleAddCost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCost.amount || parseFloat(newCost.amount) <= 0) return;

        try {
            setSubmitting(true);
            const response = await fetch(`${API_URL}/cattle/${cattleId}/costs`, {
                method: 'POST',
                headers: getAuthHeaders(tenantId),
                body: JSON.stringify({
                    costType: newCost.costType,
                    amount: parseFloat(newCost.amount),
                    description: newCost.description,
                    date: newCost.date
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to add cost');
            setNewCost({
                costType: 'MEDICAL',
                amount: '',
                description: '',
                date: new Date().toISOString().split('T')[0]
            });
            setShowAddForm(false);
            fetchCosts();
        } catch (err: any) {
            alert(err.message || 'Failed to add cost');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteCost = async (costId: string) => {
        if (!confirm(isRTL ? 'کیا آپ واقعی اس اخراجات کو حذف کرنا چاہتے ہیں؟' : 'Are you sure you want to delete this cost entry?')) return;

        try {
            const response = await fetch(`${API_URL}/cattle/${cattleId}/costs/${costId}`, {
                method: 'DELETE',
                headers: getAuthHeaders(tenantId)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to delete cost');
            fetchCosts();
        } catch (err: any) {
            alert(err.message || 'Failed to delete cost');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-emerald-600" size={32} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl backdrop-blur-sm">
                {error}
            </div>
        );
    }

    if (!summary) return null;

    const pieData = [
        { name: isRTL ? 'خریداری' : 'Purchase', value: summary.purchaseCost, color: COST_COLORS.purchase },
        { name: isRTL ? 'چارہ' : 'Feed', value: summary.feedCost, color: COST_COLORS.feed },
        { name: isRTL ? 'طبی' : 'Medical', value: summary.medicalCost, color: COST_COLORS.medical },
        { name: isRTL ? 'ویکسینیشن' : 'Vaccination', value: summary.vaccinationCost, color: COST_COLORS.vaccination },
        { name: isRTL ? 'مزدوری' : 'Labor', value: summary.laborCost, color: COST_COLORS.labor },
        { name: isRTL ? 'دیگر' : 'Other', value: summary.otherCost, color: COST_COLORS.other }
    ].filter(item => item.value > 0);

    const barData = pieData.map(item => ({
        name: item.name,
        amount: item.value,
        fill: item.color
    }));

    const formatCurrency = (amount: number) => `Rs. ${Math.round(amount).toLocaleString()}`;

    return (
        <div className="space-y-6 animate-fade-in pb-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="h-8 w-1 bg-emerald-500 rounded-full"></div>
                <h3 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                    {isRTL ? 'مالیاتی تفصیلات' : 'Financial Breakdown'}
                </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-emerald-500/10 backdrop-blur-sm p-4 rounded-xl border border-emerald-500/20 hover:bg-emerald-500/15 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <ShoppingCart size={16} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{isRTL ? 'خریداری' : 'Purchase'}</span>
                    </div>
                    <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">{formatCurrency(summary.purchaseCost)}</p>
                </div>

                <div className="bg-cyan-500/10 backdrop-blur-sm p-4 rounded-xl border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp size={16} className="text-cyan-600 dark:text-cyan-400" />
                        <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">{isRTL ? 'چارہ' : 'Feed'}</span>
                    </div>
                    <p className="text-lg font-bold text-cyan-800 dark:text-cyan-200">{formatCurrency(summary.feedCost)}</p>
                    <p className="text-[10px] text-cyan-600 dark:text-cyan-300 mt-1 flex items-center gap-1 opacity-80">
                        <Calendar size={10} /> {summary.daysOnFarm} {isRTL ? 'دن' : 'days'}
                    </p>
                </div>

                <div className="bg-red-500/10 backdrop-blur-sm p-4 rounded-xl border border-red-500/20 hover:bg-red-500/15 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <Stethoscope size={16} className="text-red-600 dark:text-red-400" />
                        <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">{isRTL ? 'طبی' : 'Medical'}</span>
                    </div>
                    <p className="text-lg font-bold text-red-800 dark:text-red-200">{formatCurrency(summary.medicalCost)}</p>
                </div>

                <div className="bg-violet-500/10 backdrop-blur-sm p-4 rounded-xl border border-violet-500/20 hover:bg-violet-500/15 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <Syringe size={16} className="text-violet-600 dark:text-violet-400" />
                        <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">{isRTL ? 'ویکسینیشن' : 'Vaccination'}</span>
                    </div>
                    <p className="text-lg font-bold text-violet-800 dark:text-violet-200">{formatCurrency(summary.vaccinationCost)}</p>
                </div>

                <div className="bg-amber-500/10 backdrop-blur-sm p-4 rounded-xl border border-amber-500/20 hover:bg-amber-500/15 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <Users size={16} className="text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">{isRTL ? 'مزدوری' : 'Labor'}</span>
                    </div>
                    <p className="text-lg font-bold text-amber-800 dark:text-amber-200">{formatCurrency(summary.laborCost)}</p>
                </div>

                <div className="bg-emerald-500/10 backdrop-blur-sm p-4 rounded-xl border border-blue-500/20 hover:bg-emerald-500/15 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <DollarSign size={16} className="text-emerald-600 dark:text-blue-400" />
                        <span className="text-xs font-bold text-emerald-600 dark:text-blue-400 uppercase tracking-wider">{isRTL ? 'کل لاگت' : 'TOTAL'}</span>
                    </div>
                    <p className="text-xl font-bold text-blue-800 dark:text-blue-200">{formatCurrency(summary.grandTotal)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <TrendingUp size={18} className="text-slate-500" />
                            {isRTL ? 'لاگت کی تقسیم' : 'Cost Distribution'}
                        </h4>
                        <div className="flex gap-1 bg-white dark:bg-slate-700/50 p-1 rounded-lg">
                            <button
                                onClick={() => setChartType('pie')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${chartType === 'pie' ? 'bg-white dark:bg-slate-600 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                            >
                                {isRTL ? 'پائی' : 'Pie'}
                            </button>
                            <button
                                onClick={() => setChartType('bar')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${chartType === 'bar' ? 'bg-white dark:bg-slate-600 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                            >
                                {isRTL ? 'بار' : 'Bar'}
                            </button>
                        </div>
                    </div>

                    {pieData.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                            <DollarSign size={32} className="mb-2 opacity-50" />
                            <p>{isRTL ? 'کوئی لاگت درج نہیں' : 'No costs recorded yet'}</p>
                        </div>
                    ) : chartType === 'pie' ? (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none"
                                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number) => formatCurrency(value)}
                                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(8px)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 30 }} barSize={20}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.3} />
                                    <XAxis type="number" tickFormatter={(val) => `Rs.${(val / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value: number) => formatCurrency(value)}
                                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(8px)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                                    />
                                    <Bar dataKey="amount" radius={[0, 4, 4, 0]} animationDuration={1000} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <FileText size={18} className="text-slate-500" />
                            {isRTL ? 'اخراجات کی تفصیل' : 'Cost Entries'}
                        </h4>
                        <button
                            onClick={() => setShowAddForm(!showAddForm)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all ${showAddForm ? 'bg-slate-100 text-slate-600' : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20 shadow-lg'}`}
                        >
                            {showAddForm ? <X size={16} /> : <Plus size={16} />}
                            {showAddForm ? (isRTL ? 'منسوخ' : 'Cancel') : (isRTL ? 'نئی لاگت' : 'Add Cost')}
                        </button>
                    </div>

                    {showAddForm ? (
                        <form onSubmit={handleAddCost} className="bg-white dark:bg-slate-700/30 p-5 rounded-xl border border-slate-100 dark:border-slate-700 animate-fade-in mb-4">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{isRTL ? 'قسم' : 'Type'}</label>
                                    <select
                                        value={newCost.costType}
                                        onChange={(e) => setNewCost({ ...newCost, costType: e.target.value as CostItem['costType'] })}
                                        className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    >
                                        {COST_TYPES.map(type => (
                                            <option key={type.value} value={type.value}>
                                                {isRTL ? type.labelUrdu : type.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{isRTL ? 'رقم (Rs.)' : 'Amount (Rs.)'}</label>
                                    <input
                                        type="number"
                                        value={newCost.amount}
                                        onChange={(e) => setNewCost({ ...newCost, amount: e.target.value })}
                                        placeholder="0"
                                        className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{isRTL ? 'تاریخ' : 'Date'}</label>
                                <input
                                    type="date"
                                    value={newCost.date}
                                    onChange={(e) => setNewCost({ ...newCost, date: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{isRTL ? 'تفصیل' : 'Description'}</label>
                                <input
                                    type="text"
                                    value={newCost.description}
                                    onChange={(e) => setNewCost({ ...newCost, description: e.target.value })}
                                    placeholder={isRTL ? 'اختیاری' : 'Optional details...'}
                                    className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-600/20"
                            >
                                {submitting && <Loader2 size={16} className="animate-spin" />}
                                {isRTL ? 'محفوظ کریں' : 'Save Record'}
                            </button>
                        </form>
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-64">
                            {costItems.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 italic text-sm">
                                    <p>{isRTL ? 'کوئی اخراجات درج نہیں۔' : 'No cost entries found.'}</p>
                                </div>
                            ) : (
                                costItems.map((item) => {
                                    const typeInfo = COST_TYPES.find(t => t.value === item.costType);
                                    const IconComponent = typeInfo?.icon || FileText;
                                    return (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 rounded-lg" style={{ backgroundColor: `${typeInfo?.color}15`, color: typeInfo?.color }}>
                                                    <IconComponent size={18} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                                                        {isRTL ? typeInfo?.labelUrdu : typeInfo?.label}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                        <span>{item.date}</span>
                                                        {item.description && <span className="truncate max-w-[120px] opacity-70 border-l border-slate-300 pl-2 ml-1">{item.description}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-slate-800 dark:text-slate-100 font-mono text-sm">{formatCurrency(item.amount)}</span>
                                                <button
                                                    onClick={() => handleDeleteCost(item.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>

            {summary.packageName && (
                <div className="bg-cyan-500/5 border border-cyan-500/10 p-4 rounded-xl text-sm text-cyan-800 dark:text-cyan-300 flex flex-wrap gap-4 items-center justify-center backdrop-blur-sm">
                    <span className="flex items-center gap-1.5"><Package size={14} /> <strong>{isRTL ? 'فیڈ پیکیج:' : 'Feed Package:'}</strong> {summary.packageName}</span>
                    <span className="w-1 h-1 bg-cyan-400 rounded-full"></span>
                    <span className="flex items-center gap-1.5"><DollarSign size={14} /> <strong> {isRTL ? 'روزانہ لاگت:' : 'Daily Cost:'}</strong> {formatCurrency(summary.feedCostPerDay)}</span>
                    <span className="w-1 h-1 bg-cyan-400 rounded-full"></span>
                    <span className="flex items-center gap-1.5"><Calendar size={14} /> <strong> {isRTL ? 'فارم پر دن:' : 'Days on Farm:'}</strong> {summary.daysOnFarm}</span>
                </div>
            )}
        </div>
    );
};
