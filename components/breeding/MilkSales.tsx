import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Edit2, Trash2, Calendar, Search, Droplet, User, DollarSign, Clock, CheckCircle, AlertCircle, X, Save } from 'lucide-react';
import { useTheme } from '../../services/ThemeContext';

interface MilkSale {
    id: string;
    sale_date: string;
    shift: 'Morning' | 'Evening';
    quantity_liters: string | number;
    price_per_liter: string | number;
    total_amount: string | number;
    buyer_name: string;
    payment_status: 'PENDING' | 'PARTIAL' | 'PAID';
    paid_amount: string | number;
    notes?: string;
}

interface MilkSalesProps {
    tenantId: string;
}

export function MilkSales({ tenantId }: MilkSalesProps) {
    const { t, isRTL } = useTheme();
    const [sales, setSales] = useState<MilkSale[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [shiftFilter, setShiftFilter] = useState<'all' | 'Morning' | 'Evening'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'PENDING' | 'PARTIAL' | 'PAID'>('all');

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [editingSale, setEditingSale] = useState<MilkSale | null>(null);
    const [saving, setSaving] = useState(false);

    // Form State
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formShift, setFormShift] = useState<'Morning' | 'Evening'>('Morning');
    const [formQuantity, setFormQuantity] = useState('');
    const [formPrice, setFormPrice] = useState('');
    const [formBuyer, setFormBuyer] = useState('');
    const [formStatus, setFormStatus] = useState<'PENDING' | 'PARTIAL' | 'PAID'>('PENDING');
    const [formPaid, setFormPaid] = useState('');
    const [formNotes, setFormNotes] = useState('');

    const token = localStorage.getItem('farmxpert_token');

    const fetchSales = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/breeding/milk-sales', {
                headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId }
            });
            if (res.ok) {
                setSales(await res.json());
            }
        } catch (err) {
            console.error('Failed to load milk sales', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSales();
    }, [tenantId]);

    // Handle form auto calculations
    const computedTotal = useMemo(() => {
        const qty = parseFloat(formQuantity) || 0;
        const price = parseFloat(formPrice) || 0;
        return qty * price;
    }, [formQuantity, formPrice]);

    // Automatically set status & paid amount based on rules
    const handleStatusChange = (status: 'PENDING' | 'PARTIAL' | 'PAID') => {
        setFormStatus(status);
        if (status === 'PAID') {
            setFormPaid(computedTotal.toString());
        } else if (status === 'PENDING') {
            setFormPaid('0');
        }
    };

    const handleOpenModal = (sale?: MilkSale) => {
        if (sale) {
            setEditingSale(sale);
            setFormDate(new Date(sale.sale_date).toISOString().split('T')[0]);
            setFormShift(sale.shift);
            setFormQuantity(sale.quantity_liters.toString());
            setFormPrice(sale.price_per_liter.toString());
            setFormBuyer(sale.buyer_name);
            setFormStatus(sale.payment_status);
            setFormPaid(sale.paid_amount.toString());
            setFormNotes(sale.notes || '');
        } else {
            setEditingSale(null);
            setFormDate(new Date().toISOString().split('T')[0]);
            setFormShift('Morning');
            setFormQuantity('');
            setFormPrice('');
            setFormBuyer('');
            setFormStatus('PENDING');
            setFormPaid('0');
            setFormNotes('');
        }
        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formDate || !formShift || !formQuantity || !formPrice || !formBuyer) {
            alert('Please fill out all required fields.');
            return;
        }

        const qty = parseFloat(formQuantity);
        const rate = parseFloat(formPrice);
        const paid = parseFloat(formPaid) || 0;

        if (isNaN(qty) || qty <= 0 || isNaN(rate) || rate <= 0) {
            alert('Quantity and Price must be positive numbers.');
            return;
        }

        if (paid < 0 || paid > computedTotal) {
            alert(`Paid amount must be between 0 and the total amount (Rs. ${computedTotal}).`);
            return;
        }

        setSaving(true);
        try {
            const url = editingSale ? `/api/breeding/milk-sales/${editingSale.id}` : '/api/breeding/milk-sales';
            const method = editingSale ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId
                },
                body: JSON.stringify({
                    saleDate: formDate,
                    shift: formShift,
                    quantityLiters: qty,
                    pricePerLiter: rate,
                    buyerName: formBuyer,
                    paymentStatus: formStatus,
                    paidAmount: paid,
                    notes: formNotes
                })
            });

            if (res.ok) {
                setShowModal(false);
                fetchSales();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to save record.');
            }
        } catch (err) {
            console.error(err);
            alert('Server error occurred.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this milk sale record? This will also remove the linked income transaction from the finance module.')) return;
        try {
            const res = await fetch(`/api/breeding/milk-sales/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId }
            });
            if (res.ok) {
                fetchSales();
            } else {
                alert('Failed to delete.');
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Filters and calculations
    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            const matchesSearch = s.buyer_name.toLowerCase().includes(searchTerm.toLowerCase()) || (s.notes && s.notes.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesShift = shiftFilter === 'all' || s.shift === shiftFilter;
            const matchesStatus = statusFilter === 'all' || s.payment_status === statusFilter;
            return matchesSearch && matchesShift && matchesStatus;
        });
    }, [sales, searchTerm, shiftFilter, statusFilter]);

    const stats = useMemo(() => {
        let liters = 0;
        let revenue = 0;
        let pending = 0;
        sales.forEach(s => {
            const qty = parseFloat(s.quantity_liters as string) || 0;
            const total = parseFloat(s.total_amount as string) || 0;
            const paid = parseFloat(s.paid_amount as string) || 0;
            liters += qty;
            revenue += total;
            pending += (total - paid);
        });
        return { liters, revenue, pending };
    }, [sales]);

    const getPaymentStatusColor = (status: string) => {
        switch (status) {
            case 'PAID': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'PARTIAL': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'PENDING': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const getPaymentStatusIcon = (status: string) => {
        switch (status) {
            case 'PAID': return <CheckCircle size={14} />;
            case 'PARTIAL': return <Clock size={14} />;
            case 'PENDING': return <AlertCircle size={14} />;
            default: return null;
        }
    };

    if (loading) {
        return <div className="flex justify-center p-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
    }

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            {/* KPI Section */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-blue-500/20"></div>
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-xl text-blue-600 dark:text-blue-400">
                            <Droplet size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Liters Sold</p>
                            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.liters.toLocaleString()} L</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-emerald-500/20"></div>
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Revenue</p>
                            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rs. {stats.revenue.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-amber-500/20"></div>
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="bg-amber-100 dark:bg-amber-900/30 p-3 rounded-xl text-amber-600 dark:text-amber-400">
                            <AlertCircle size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Pending Collection</p>
                            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rs. {stats.pending.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter and Table Section */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-50/30 dark:bg-slate-800/50">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Milk Dispatch Ledger</h3>
                        <p className="text-sm text-slate-500 mt-1">Track payments and customer accounts for dairy dispatch sales.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search buyer or notes..."
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select
                            value={shiftFilter}
                            onChange={e => setShiftFilter(e.target.value as any)}
                            className="w-full sm:w-auto px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                        >
                            <option value="all">All Shifts</option>
                            <option value="Morning">Morning</option>
                            <option value="Evening">Evening</option>
                        </select>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as any)}
                            className="w-full sm:w-auto px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                        >
                            <option value="all">All Status</option>
                            <option value="PAID">Paid</option>
                            <option value="PARTIAL">Partial</option>
                            <option value="PENDING">Pending</option>
                        </select>
                        <button
                            onClick={() => handleOpenModal()}
                            className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                            <Plus size={16} /> Record Sale
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-700/30 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-700 uppercase tracking-wider text-xs">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Shift</th>
                                <th className="px-6 py-4">Buyer Name</th>
                                <th className="px-6 py-4 text-right">Quantity (L)</th>
                                <th className="px-6 py-4 text-right">Rate (PKR/L)</th>
                                <th className="px-6 py-4 text-right">Total (PKR)</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-right">Paid</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredSales.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                                        No sales records found. Click "Record Sale" to start logging dispatch income.
                                    </td>
                                </tr>
                            ) : (
                                filteredSales.map(sale => {
                                    const qty = parseFloat(sale.quantity_liters as string) || 0;
                                    const rate = parseFloat(sale.price_per_liter as string) || 0;
                                    const total = parseFloat(sale.total_amount as string) || 0;
                                    const paid = parseFloat(sale.paid_amount as string) || 0;
                                    return (
                                        <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors group">
                                            <td className="px-6 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                                                {new Date(sale.sale_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${sale.shift === 'Morning' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400'}`}>
                                                    {sale.shift}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3.5 font-semibold text-slate-800 dark:text-slate-100">
                                                {sale.buyer_name}
                                            </td>
                                            <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                                                {qty} L
                                            </td>
                                            <td className="px-6 py-3.5 text-right font-mono text-slate-600 dark:text-slate-400">
                                                Rs. {rate}
                                            </td>
                                            <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                                                Rs. {total.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-3.5 text-center">
                                                <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${getPaymentStatusColor(sale.payment_status)}`}>
                                                    {getPaymentStatusIcon(sale.payment_status)}
                                                    {sale.payment_status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                                                Rs. {paid.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-3.5 text-right">
                                                <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleOpenModal(sale)}
                                                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                                                        title="Edit Sale"
                                                    >
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(sale.id)}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                        title="Delete Sale"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Record / Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-white/95 dark:bg-slate-800/95 backdrop-blur z-10">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <Droplet className="text-emerald-500" />
                                {editingSale ? 'Edit Milk Sale Record' : 'Record Daily Milk Sale'}
                            </h3>
                            <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sale Date *</label>
                                    <input
                                        type="date"
                                        value={formDate}
                                        onChange={e => setFormDate(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Shift *</label>
                                    <select
                                        value={formShift}
                                        onChange={e => setFormShift(e.target.value as any)}
                                        className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                                    >
                                        <option value="Morning">Morning</option>
                                        <option value="Evening">Evening</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buyer Name *</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="e.g. Nestle, Jamil Milk Shop"
                                        value={formBuyer}
                                        onChange={e => setFormBuyer(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Quantity (Liters) *</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        placeholder="0.0"
                                        value={formQuantity}
                                        onChange={e => setFormQuantity(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold font-mono"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Price per Liter (PKR) *</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        placeholder="Rate / L"
                                        value={formPrice}
                                        onChange={e => setFormPrice(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Computed Total Amount:</span>
                                <span className="font-mono font-black text-xl text-slate-800 dark:text-slate-100">Rs. {computedTotal.toLocaleString()}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Payment Status</label>
                                    <select
                                        value={formStatus}
                                        onChange={e => handleStatusChange(e.target.value as any)}
                                        className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer font-bold"
                                    >
                                        <option value="PENDING">Pending</option>
                                        <option value="PARTIAL">Partial</option>
                                        <option value="PAID">Paid</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Paid Amount (PKR)</label>
                                    <input
                                        type="number"
                                        value={formPaid}
                                        disabled={formStatus === 'PAID' || formStatus === 'PENDING'}
                                        onChange={e => setFormPaid(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold font-mono disabled:opacity-60"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notes (Optional)</label>
                                <textarea
                                    value={formNotes}
                                    onChange={e => setFormNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Enter additional details..."
                                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-white dark:bg-slate-800/50">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition-all flex items-center gap-2"
                            >
                                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                {editingSale ? 'Update Record' : 'Record Sale'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
