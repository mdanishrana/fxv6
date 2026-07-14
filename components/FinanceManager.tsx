import React, { useState, useEffect, useMemo } from 'react';
import { Tenant, UserRole, SupplierPurchase, WagePayment, Cattle, Transaction, Supplier, SupplierCategory } from '../types';
import { api } from '../services/api';
import { useTheme } from '../services/ThemeContext';
import { DollarSign, TrendingUp, TrendingDown, PieChart, Activity, Calendar, Download, Filter, ArrowUpRight, ArrowDownRight, Wallet, CreditCard, Banknote, Plus, X, Search, Check, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { appEvents } from '../utils/events';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, PieChart as RePieChart, Pie, Cell } from 'recharts';

interface FinanceManagerProps {
    tenant: Tenant;
    userRole: UserRole;
}

export const FinanceManager: React.FC<FinanceManagerProps> = ({ tenant, userRole }) => {
    const { isDarkMode, t } = useTheme();
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year' | 'all'>('month');

    // Data States
    const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
    const [wages, setWages] = useState<WagePayment[]>([]);
    const [cattle, setCattle] = useState<Cattle[]>([]);
    const [payments, setPayments] = useState<any[]>([]); // Income from investors
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [generalTransactions, setGeneralTransactions] = useState<any[]>([]);

    // Modal States
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showAllTransactions, setShowAllTransactions] = useState(false);
    const [transactionType, setTransactionType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
    const [expenseType, setExpenseType] = useState<'SUPPLIER' | 'ANIMAL' | 'MISC'>('SUPPLIER');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [expenseForm, setExpenseForm] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        source: '', // For misc income
        // Supplier
        supplierId: '',
        category: 'Other' as SupplierCategory,
        // Animal
        cattleId: '',
        costType: 'MEDICAL' as 'MEDICAL' | 'VACCINATION' | 'LABOR' | 'OTHER'
    });

    useEffect(() => {
        fetchData();

        // Listen for updates from SupplierManager, CattleManager, PaymentManager, etc.
        const handleDataUpdated = () => fetchData();
        appEvents.on('SUPPLIERS_UPDATED', handleDataUpdated);
        appEvents.on('CATTLE_UPDATED', handleDataUpdated);
        appEvents.on('PAYMENTS_UPDATED', handleDataUpdated);
        appEvents.on('WAGES_UPDATED', handleDataUpdated);

        return () => {
            appEvents.off('SUPPLIERS_UPDATED', handleDataUpdated);
            appEvents.off('CATTLE_UPDATED', handleDataUpdated);
            appEvents.off('PAYMENTS_UPDATED', handleDataUpdated);
            appEvents.off('WAGES_UPDATED', handleDataUpdated);
        };
    }, [tenant.id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [purchasesData, wagesData, cattleData, paymentsData, suppliersData, transactionsData] = await Promise.all([
                api.suppliers.listPurchases(tenant.id),
                api.labour.listWages(tenant.id),
                api.cattle.list(tenant.id),
                api.payments.list(tenant.id),
                api.suppliers.list(tenant.id),
                api.finance.listTransactions(tenant.id)
            ]);
            setPurchases(purchasesData);
            setWages(wagesData);
            setCattle(cattleData);
            setPayments(paymentsData);
            setSuppliers(suppliersData);
            setGeneralTransactions(transactionsData);
        } catch (error) {
            console.error("Failed to fetch financial data:", error);
        } finally {
            setLoading(false);
        }
    };

    // --- Aggregation Logic ---

    const financialData = useMemo(() => {
        let income = 0;
        let expense = 0;
        const history: { id?: string; source?: string; sourceId?: string; cattleId?: string; date: string; type: 'income' | 'expense'; amount: number; category: string }[] = [];

        // 1. Supplier Purchases (Expenses)
        purchases.forEach(p => {
            const amount = Number(p.totalAmount);
            if (amount > 0) {
                expense += amount;
                history.push({
                    id: p.id,
                    source: 'SUPPLIER_PURCHASE',
                    sourceId: p.supplierId,
                    date: p.purchaseDate,
                    type: 'expense',
                    amount: amount,
                    category: p.items[0]?.name || 'Supplier Purchase' // Simplification
                });
            }
        });

        // 2. Labor Wages (Expenses)
        wages.forEach(w => {
            const amount = Number(w.totalAmount);
            if (amount > 0) {
                expense += amount;
                history.push({
                    date: w.paymentDate || w.periodEnd,
                    type: 'expense',
                    amount: amount,
                    category: 'Labor'
                });
            }
        });

        // 3. Cattle Transactions (Income/Expense)
        cattle.forEach(c => {
            // Purchase Cost is intentionally EXCLUDED from general farm operational expenses 
            // per user request, as the farm primarily manages boarding animals.

            // Other Transactions
            c.transactions.forEach(t => {
                if (t.type === 'PURCHASE') return; // Skip PURCHASE type as c.purchasePrice handles it above.

                const amount = Number(t.amount);
                if (t.type === 'SALE' || (t.type as any) === 'INCOME' || (t as any).costType === 'INCOME') {
                    income += Math.abs(amount);
                    history.push({
                        id: t.id,
                        source: 'CATTLE_COST',
                        sourceId: t.id,
                        cattleId: c.id,
                        date: t.date,
                        type: 'income',
                        amount: Math.abs(amount),
                        category: (t as any).costType === 'INCOME' ? 'Animal Income' : 'Cattle Sale'
                    });
                } else {
                    expense += Math.abs(amount);
                    history.push({
                        id: t.id,
                        source: 'CATTLE_COST',
                        sourceId: t.id,
                        cattleId: c.id,
                        date: t.date,
                        type: 'expense',
                        amount: Math.abs(amount),
                        category: (t as any).costType === 'MEDICAL' ? 'Medical' : 'Other'
                    });
                }
            });
        });

        // 4. Investor Payments (Income)
        // Assuming PaymentRecord amount is income for the farm service
        payments.forEach(p => {
            const amount = Number(p.amount);
            if (p.status === 'PAID') {
                income += amount;
                history.push({
                    date: p.paidDate || p.dueDate,
                    type: 'income',
                    amount: amount,
                    category: 'Service Fee'
                });
            }
        });

        // 5. General / Misc Transactions
        generalTransactions.forEach(t => {
            const amount = Number(t.amount);
            if (t.type === 'INCOME') {
                income += amount;
            } else {
                expense += amount;
            }
            history.push({
                id: t.id,
                source: 'GENERAL_TRANSACTION',
                sourceId: t.id,
                date: t.date,
                type: t.type.toLowerCase() as 'income' | 'expense',
                amount: amount,
                category: t.category
            });
        });

        // Sort history by date descending
        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return { income, expense, history };
    }, [purchases, wages, cattle, payments, generalTransactions]);

    const handleExpenseSubmit = async () => {
        setIsSubmitting(true);
        try {
            if (transactionType === 'INCOME') {
                if (expenseType === 'ANIMAL') {
                    if (!expenseForm.cattleId) {
                        alert('Please select an animal');
                        setIsSubmitting(false);
                        return;
                    }
                    if (!expenseForm.amount) {
                        alert('Please provide amount for income.');
                        setIsSubmitting(false);
                        return;
                    }
                    const costData = {
                        costType: 'INCOME',
                        amount: Number(expenseForm.amount),
                        description: expenseForm.description || 'Income',
                        date: expenseForm.date,
                        createdAt: new Date().toISOString()
                    };
                    await api.cattle.addCost(tenant.id, expenseForm.cattleId, costData);
                } else {
                    // General / Misc Income
                    if (!expenseForm.amount || !expenseForm.source) {
                        alert('Please provide amount and source for income.');
                        setIsSubmitting(false);
                        return;
                    }
                    const incomeData = {
                        type: 'INCOME',
                        category: expenseForm.category || 'General',
                        amount: Number(expenseForm.amount),
                        date: expenseForm.date,
                        source: expenseForm.source,
                        description: expenseForm.description
                    };
                    await api.finance.createTransaction(tenant.id, incomeData);
                }
            } else {
                // Handling EXPENSE scenarios
                if (expenseType === 'SUPPLIER') {
                    if (!expenseForm.supplierId) {
                        alert('Please select a supplier');
                        setIsSubmitting(false);
                        return;
                    }
                    const supplier = suppliers.find(s => s.id === expenseForm.supplierId);
                    const purchaseData: Partial<SupplierPurchase> = {
                        supplierId: expenseForm.supplierId,
                        supplierName: supplier?.name,
                        purchaseDate: expenseForm.date,
                        items: [{
                            name: `${expenseForm.category} - ${expenseForm.description || 'Expense'}`,
                            quantity: 1,
                            unit: 'Unit',
                            unitPrice: Number(expenseForm.amount),
                            total: Number(expenseForm.amount)
                        }],
                        subtotal: Number(expenseForm.amount),
                        taxAmount: 0,
                        totalAmount: Number(expenseForm.amount),
                        paymentStatus: 'PAID',
                        paidAmount: Number(expenseForm.amount),
                        paymentDate: expenseForm.date,
                        paymentMethod: 'Cash',
                        notes: expenseForm.description
                    };
                    await api.suppliers.createPurchase(tenant.id, purchaseData);
                } else if (expenseType === 'ANIMAL') {
                    if (!expenseForm.cattleId) {
                        alert('Please select an animal');
                        setIsSubmitting(false);
                        return;
                    }
                    const costData = {
                        costType: expenseForm.costType,
                        amount: Number(expenseForm.amount),
                        description: expenseForm.description,
                        date: expenseForm.date,
                        createdAt: new Date().toISOString()
                    };
                    await api.cattle.addCost(tenant.id, expenseForm.cattleId, costData);
                } else {
                    // MISC / General Expense
                    if (!expenseForm.amount) {
                        alert('Please provide amount for the expense.');
                        setIsSubmitting(false);
                        return;
                    }
                    const expData = {
                        type: 'EXPENSE',
                        category: expenseForm.category || 'General',
                        amount: Number(expenseForm.amount),
                        date: expenseForm.date,
                        source: expenseForm.source,
                        description: expenseForm.description
                    };
                    await api.finance.createTransaction(tenant.id, expData);
                }
            }
            appEvents.emit('FINANCE_UPDATED');
            setShowExpenseModal(false);
            setExpenseForm({
                amount: '',
                date: new Date().toISOString().split('T')[0],
                description: '',
                source: '',
                supplierId: '',
                category: 'Other' as SupplierCategory,
                cattleId: '',
                costType: 'MEDICAL'
            });
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Failed to record transaction');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTransaction = async (item: any) => {
        if (!confirm('Are you sure you want to delete this expense record?')) return;

        try {
            if (item.source === 'SUPPLIER_PURCHASE' && item.id) {
                await api.suppliers.deletePurchase(tenant.id, item.id);
                fetchData();
            } else if (item.source === 'CATTLE_COST' && item.cattleId && item.id) {
                await api.cattle.deleteCost(tenant.id, item.cattleId, item.id);
                fetchData();
            } else if (item.source === 'GENERAL_TRANSACTION' && item.id) {
                await api.finance.deleteTransaction(tenant.id, item.id);
                fetchData();
            } else {
                alert('This transaction type cannot be deleted directly from here.');
            }
            appEvents.emit('FINANCE_UPDATED');
        } catch (error) {
            console.error('Failed to delete transaction:', error);
            alert('Failed to delete transaction.');
        }
    };

    const stats = [
        { title: 'Total Revenue', value: financialData.income, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { title: 'Total Expenses', value: financialData.expense, icon: TrendingDown, color: 'text-rose-500', bg: 'bg-rose-500/10' },
        { title: 'Net Profit', value: financialData.income - financialData.expense, icon: Wallet, color: (financialData.income - financialData.expense) >= 0 ? 'text-emerald-500' : 'text-orange-500', bg: (financialData.income - financialData.expense) >= 0 ? 'bg-emerald-500/10' : 'bg-orange-500/10' },
    ];

    return (
        <div className="space-y-6">
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                <div className="w-full lg:w-auto">
                    <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent flex items-center gap-3">Financial Overview</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 text-sm">Track farm revenue, expenses, and profitability.</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
                    <button
                        onClick={() => {
                            setTransactionType('EXPENSE');
                            setExpenseType('SUPPLIER');
                            setShowExpenseModal(true);
                        }}
                        className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-3 rounded-2xl flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 font-bold hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                    >
                        <Plus size={18} />
                        Record Transaction
                    </button>
                    <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-sm w-full sm:w-auto overflow-x-auto no-scrollbar">
                        {['month', 'quarter', 'year', 'all'].map((range) => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range as any)}
                                className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${dateRange === range
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 scale-100'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700/50'
                                    }`}
                            >
                                {range.charAt(0).toUpperCase() + range.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Revenue */}
                <div className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-6 relative">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Revenue</span>
                    </div>
                    <div className="relative">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Revenue</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Rs. {financialData.income.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">All income sources combined</p>
                    </div>
                </div>

                {/* Total Expenses */}
                <div className="group bg-gradient-to-br from-rose-50 via-red-50 to-rose-50 dark:from-rose-950/40 dark:to-red-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(244,63,94,0.15)] hover:shadow-[0_8px_30px_rgb(244,63,94,0.3)] border border-rose-100 dark:border-rose-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-rose-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-6 relative">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-rose-100 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <TrendingDown className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Expenses</span>
                    </div>
                    <div className="relative">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Expenses</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Rs. {financialData.expense.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">All outgoing costs combined</p>
                    </div>
                </div>

                {/* Net Profit */}
                <div className={`group p-6 rounded-3xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden border ${(financialData.income - financialData.expense) >= 0 ? 'bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.3)] border-emerald-100 dark:border-emerald-900/50' : 'bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/40 dark:to-amber-950/30 shadow-[0_8px_30px_rgb(249,115,22,0.15)] hover:shadow-[0_8px_30px_rgb(249,115,22,0.3)] border-orange-100 dark:border-orange-900/50'}`}>
                    <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl ${(financialData.income - financialData.expense) >= 0 ? 'from-emerald-400/20' : 'from-orange-400/20'}`}></div>
                    <div className="flex items-start justify-between mb-6 relative">
                        <div className={`p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300 border ${(financialData.income - financialData.expense) >= 0 ? 'border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400' : 'border-orange-100 dark:border-orange-900/50 text-orange-600 dark:text-orange-400'}`}>
                            <Wallet className="w-6 h-6" />
                        </div>
                        <span className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm ${(financialData.income - financialData.expense) >= 0 ? 'bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-white/60 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'}`}>{(financialData.income - financialData.expense) >= 0 ? 'Profit' : 'Loss'}</span>
                    </div>
                    <div className="relative">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Net Profit</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Rs. {Math.abs(financialData.income - financialData.expense).toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">{(financialData.income - financialData.expense) >= 0 ? 'Revenue exceeds expenses' : 'Expenses exceed revenue'}</p>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Cash Flow Chart */}
                <div className="lg:col-span-2 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Activity size={20} className="text-indigo-500" />
                            Cash Flow Analysis
                        </h3>
                    </div>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={financialData.history /* Needs proper grouping by date for chart */}>
                                <defs>
                                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748B' }}
                                    tickFormatter={(str) => {
                                        if (!str) return '';
                                        const d = new Date(str);
                                        return isNaN(d.getTime()) ? str : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                    }}
                                />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelFormatter={(label) => {
                                        if (!label) return '';
                                        const d = new Date(label);
                                        return isNaN(d.getTime()) ? label : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
                                    }}
                                />
                                <Area type="monotone" dataKey="amount" stroke="#10B981" fillOpacity={1} fill="url(#colorIncome)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Expense Breakdown */}
                <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <PieChart size={20} className="text-violet-500" />
                        Expense Breakdown
                    </h3>
                    <div className="h-64 flex items-center justify-center">
                        <div className="text-center text-slate-400">
                            Chart Placeholder
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Transactions List */}
            <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-white/20 dark:border-slate-700/50 flex justify-between items-center bg-white/30 dark:bg-slate-800/30">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Recent Transactions</h3>
                    <button
                        onClick={() => setShowAllTransactions(true)}
                        className="text-sm text-emerald-500 font-medium hover:text-emerald-600"
                    >
                        View All
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/20 dark:bg-slate-900/30">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/20 dark:divide-slate-700/50">
                            {financialData.history.slice(0, 5).map((item, idx) => (
                                <tr key={idx} className="hover:bg-white dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300 font-medium">
                                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{item.category}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.type === 'income'
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                                            }`}>
                                            {item.type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 text-sm font-bold text-right ${item.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                                        }`}>
                                        {item.type === 'income' ? '+' : '-'} Rs. {item.amount.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Expense Modal */}
            {showExpenseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl shadow-2xl border border-white/50 dark:border-slate-800/50 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800/50">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Record New Transaction</h3>
                            <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
                            {/* Income / Expense Toggle */}
                            <div className="flex p-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl mb-4">
                                <button
                                    onClick={() => setTransactionType('INCOME')}
                                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${transactionType === 'INCOME'
                                        ? 'bg-emerald-500 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-emerald-600'}`}
                                >
                                    Income
                                </button>
                                <button
                                    onClick={() => setTransactionType('EXPENSE')}
                                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${transactionType === 'EXPENSE'
                                        ? 'bg-rose-500 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-rose-600'}`}
                                >
                                    Expense
                                </button>
                            </div>

                            {transactionType === 'INCOME' && (
                                <div className="flex flex-wrap p-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl">
                                    <button
                                        onClick={() => setExpenseType('MISC')}
                                        className={`flex-1 min-w-[100px] py-1.5 text-xs font-medium rounded-lg transition-all ${expenseType === 'MISC'
                                            ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        General Income
                                    </button>
                                    <button
                                        onClick={() => setExpenseType('ANIMAL')}
                                        className={`flex-1 min-w-[100px] py-1.5 text-xs font-medium rounded-lg transition-all ${expenseType === 'ANIMAL'
                                            ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Animal Specific
                                    </button>
                                </div>
                            )}

                            {transactionType === 'EXPENSE' && (
                                <div className="flex flex-wrap p-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl">
                                    <button
                                        onClick={() => setExpenseType('SUPPLIER')}
                                        className={`flex-1 min-w-[100px] py-1.5 text-xs font-medium rounded-lg transition-all ${expenseType === 'SUPPLIER'
                                            ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Supplier Purchase
                                    </button>
                                    <button
                                        onClick={() => setExpenseType('ANIMAL')}
                                        className={`flex-1 min-w-[100px] py-1.5 text-xs font-medium rounded-lg transition-all ${expenseType === 'ANIMAL'
                                            ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Animal Specific
                                    </button>
                                    <button
                                        onClick={() => setExpenseType('MISC')}
                                        className={`flex-1 min-w-[100px] py-1.5 text-xs font-medium rounded-lg transition-all ${expenseType === 'MISC'
                                            ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Miscellaneous
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Amount (Rs)</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                            <DollarSign size={16} />
                                        </div>
                                        <input
                                            type="number"
                                            value={expenseForm.amount}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Date</label>
                                    <input
                                        type="date"
                                        value={expenseForm.date}
                                        onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {transactionType === 'INCOME' || (transactionType === 'EXPENSE' && expenseType === 'MISC') ? (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Source / Label</label>
                                        <input
                                            type="text"
                                            value={expenseForm.source}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, source: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                            placeholder={transactionType === 'INCOME' ? "e.g., Manure Sale, Subsidies" : "e.g., Office Supplies"}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
                                        <select
                                            value={expenseForm.category}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as any })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all appearance-none"
                                        >
                                            <option value="Other">Other</option>
                                            <option value="Sales">Sales</option>
                                            <option value="Services">Services</option>
                                            <option value="Rent">Rent</option>
                                            <option value="Electricity">Electricity</option>
                                            <option value="Maintenance">Maintenance</option>
                                        </select>
                                    </div>
                                </>
                            ) : null}

                            {transactionType === 'EXPENSE' && expenseType === 'SUPPLIER' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Supplier / Payee</label>
                                        <select
                                            value={expenseForm.supplierId}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, supplierId: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all appearance-none"
                                        >
                                            <option value="">Select Payee...</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
                                        <select
                                            value={expenseForm.category}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as any })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all appearance-none"
                                        >
                                            <option value="Other">Other</option>
                                            <option value="Rent">Rent</option>
                                            <option value="Electricity">Electricity</option>
                                            <option value="Fuel">Fuel</option>
                                            <option value="Maintenance">Maintenance</option>
                                            <option value="Equipment">Equipment</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {transactionType === 'EXPENSE' && expenseType === 'ANIMAL' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Select Animal</label>
                                        <select
                                            value={expenseForm.cattleId}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, cattleId: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all appearance-none"
                                        >
                                            <option value="">Select Cattle...</option>
                                            {cattle.filter(c => c.status === 'Active').map(c => (
                                                <option key={c.id} value={c.id}>{c.tagNumber} - {c.type}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Cost Type</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {['MEDICAL', 'VACCINATION', 'LABOR', 'OTHER'].map((type) => (
                                                <button
                                                    key={type}
                                                    onClick={() => setExpenseForm({ ...expenseForm, costType: type as any })}
                                                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${expenseForm.costType === type
                                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
                                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                                                        }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {transactionType === 'INCOME' && expenseType === 'ANIMAL' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Select Animal</label>
                                        <select
                                            value={expenseForm.cattleId}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, cattleId: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all appearance-none"
                                        >
                                            <option value="">Select Cattle...</option>
                                            {cattle.filter(c => c.status === 'Active').map(c => (
                                                <option key={c.id} value={c.id}>{c.tagNumber} - {c.type}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Income Type</label>
                                        <div className="py-2 px-3 text-sm font-medium rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300 text-center">
                                            Income (Milk, etc.)
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
                                <textarea
                                    value={expenseForm.description}
                                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none h-20"
                                    placeholder="Enter details..."
                                ></textarea>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex justify-end gap-3">
                            <button
                                onClick={() => setShowExpenseModal(false)}
                                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleExpenseSubmit}
                                disabled={isSubmitting || !expenseForm.amount}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all shadow-md hover:shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Check size={16} />
                                        Save Transaction
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View All Transactions Modal */}
            {showAllTransactions && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl shadow-2xl border border-white/50 dark:border-slate-800/50 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Activity size={24} className="text-indigo-500" />
                                    All Transactions History
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">A complete log of all income and expenses.</p>
                            </div>
                            <button onClick={() => setShowAllTransactions(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-6 bg-white dark:bg-slate-900/20">
                            <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-white/50 dark:border-slate-800/50 overflow-hidden shadow-sm">
                                <table className="w-full">
                                    <thead className="bg-white dark:bg-slate-900/50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                                            <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                            <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/20 dark:divide-slate-700/50">
                                        {financialData.history.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                                    No transactions found.
                                                </td>
                                            </tr>
                                        ) : (
                                            financialData.history.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-white dark:hover:bg-slate-700/50 transition-colors">
                                                    <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300 font-medium">
                                                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{item.category}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.type === 'income'
                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                                                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                                                            }`}>
                                                            {item.type.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className={`px-6 py-4 text-sm font-bold text-right ${item.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                                                        }`}>
                                                        {item.type === 'income' ? '+' : '-'} Rs. {item.amount.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-right space-x-2">
                                                        <button
                                                            onClick={() => handleDeleteTransaction(item)}
                                                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                                            title="Delete Expense"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
