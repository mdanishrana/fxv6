import React, { useState, useEffect } from 'react';
import { CreditCard, Check, Clock, AlertTriangle, Mail, RefreshCw, Plus, X, Filter, Search, Calendar, DollarSign, Send, Eye, Trash2, Edit2, Save } from 'lucide-react';
import { Cattle, Tenant } from '../types';
import { api } from '../services/api';
import { useTheme } from '../services/ThemeContext';

interface PaymentManagerProps {
  tenant: Tenant;
  cattle: Cattle[];
  userRole: string;
}

interface PaymentSummary {
  cattleId: string;
  tagNumber: string;
  ownerName: string;
  ownerEmail: string;
  ownerMobile: string;
  totalDue: number;
  oldestDueDate: string;
  monthsDue: number;
  status: 'PENDING' | 'OVERDUE' | 'PAID' | 'ADVANCE_PAID';
  reminderSent: boolean;
  lastPaidDate: string | null;
}

export const PaymentManager: React.FC<PaymentManagerProps> = ({ tenant, cattle, userRole }) => {
  const { isDarkMode } = useTheme();
  const [summaries, setSummaries] = useState<PaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [newPayment, setNewPayment] = useState({
    cattleId: '',
    amount: '',
    dueDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settleData, setSettleData] = useState<{ summary: PaymentSummary | null, amount: string }>({ summary: null, amount: '' });

  const canManage = userRole === 'OWNER' || userRole === 'MANAGER';

  useEffect(() => {
    loadPayments();
  }, [tenant.id]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      // @ts-ignore - getSummary added to api
      const data = await api.payments.getSummary(tenant.id);
      setSummaries(data);
    } catch (err) {
      console.error('Failed to load payments:', err);
    }
    setLoading(false);
  };

  const handleGenerateMonthly = async () => {
    setProcessing(true);
    try {
      const result = await api.payments.generateMonthly(tenant.id);
      alert(result.message);
      loadPayments();
    } catch (err) {
      alert('Failed to generate monthly payments');
    }
    setProcessing(false);
  };



  const handleMarkPaid = (summary: PaymentSummary) => {
    setSettleData({ summary, amount: summary.totalDue.toString() });
    setSettleModalOpen(true);
  };

  const submitSettlePayment = async () => {
    if (!settleData.summary || !settleData.amount) return;
    setProcessing(true);
    try {
      // @ts-ignore
      const response = await api.payments.settle(tenant.id, settleData.summary.cattleId, { amountPaid: parseFloat(settleData.amount) });
      // @ts-ignore
      if (response.success) {
        alert(response.message || 'Payment settled successfully');
      }
      setSettleModalOpen(false);
      loadPayments();
    } catch (err) {
      alert('Failed to settle payments');
    }
    setProcessing(false);
  };

  const handleSendReminder = async (summary: PaymentSummary) => {
    if (!window.confirm(`Send payment reminder to ${summary.ownerName} for ${summary.tagNumber}?`)) return;

    try {
      // @ts-ignore
      await api.payments.sendReminder(tenant.id, summary.cattleId);
      alert('Reminder sent successfully');
      loadPayments();
    } catch (err) {
      alert('Failed to send reminder');
    }
  };

  const handleAddPayment = async () => {
    if (!newPayment.cattleId || !newPayment.amount) {
      alert('Please select an animal and enter amount');
      return;
    }

    try {
      await api.payments.create(tenant.id, {
        cattleId: newPayment.cattleId,
        amount: parseFloat(newPayment.amount),
        dueDate: newPayment.dueDate,
        notes: newPayment.notes,
        status: 'PENDING',
        reminderSent: false
      });
      setShowAddModal(false);
      setNewPayment({ cattleId: '', amount: '', dueDate: new Date().toISOString().split('T')[0], notes: '' });
      loadPayments();
    } catch (err) {
      alert('Failed to add payment');
    }
  };

  const handleDeleteAllForCattle = async (cattleId: string) => {
    if (!window.confirm("Are you sure you want to completely clear ALL payment records for this animal? This will reset their balance to 0 and cannot be undone.")) return;
    setProcessing(true);
    try {
      // @ts-ignore
      const result = await api.payments.deleteAllForCattle(tenant.id, cattleId);
      // @ts-ignore
      alert(result.message || 'Records successfully cleared.');
      loadPayments();
    } catch (err) {
      alert('Failed to clear payment records for this animal.');
    }
    setProcessing(false);
  };

  const [selectedCattleStart, setSelectedCattleStart] = useState<string | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedCattleDetails, setSelectedCattleDetails] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);

  const handleViewDetails = async (summary: PaymentSummary) => {
    setSelectedCattleStart(summary.cattleId);
    setDetailsModalOpen(true);
    fetchDetails(summary.cattleId);
  };

  const fetchDetails = async (cattleId: string) => {
    setDetailsLoading(true);
    try {
      // @ts-ignore
      const data = await api.payments.list(tenant.id, cattleId);
      // Show ALL records (including PAID) for editing capabilities
      setSelectedCattleDetails(data);
    } catch (err) {
      alert('Failed to load details');
    }
    setDetailsLoading(false);
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm('Are you sure you want to delete this payment record?')) return;
    try {
      // @ts-ignore
      await api.payments.delete(tenant.id, paymentId);
      if (selectedCattleStart) fetchDetails(selectedCattleStart);
      loadPayments();
    } catch (err) {
      alert('Failed to delete payment');
    }
  };

  const handleUpdatePayment = async (updated: any) => {
    try {
      // @ts-ignore
      await api.payments.update(tenant.id, updated.id, updated);
      setEditingPayment(null);
      if (selectedCattleStart) fetchDetails(selectedCattleStart);
      loadPayments();
    } catch (err) {
      alert('Failed to update payment');
    }
  };

  const filteredSummaries = summaries.filter(p => {
    const matchesStatus = filterStatus === 'All' || p.status === filterStatus;
    const matchesSearch = searchTerm === '' ||
      p.tagNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.ownerName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const stats = {
    totalRecords: summaries.length,
    pending: summaries.filter(p => p.status === 'PENDING').length,
    overdue: summaries.filter(p => p.status === 'OVERDUE').length,
    amountDue: summaries.reduce((sum, p) => sum + p.totalDue, 0)
  };

  const getStatusBadge = (summary: PaymentSummary) => {
    switch (summary.status) {
      case 'PAID':
        return <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Check size={12} /> Paid</span>;
      case 'ADVANCE_PAID':
        return <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Check size={12} /> Advance Paid</span>;
      case 'PENDING': {
        let daysText = "Pending";
        if (summary.oldestDueDate) {
          const diff = new Date().getTime() - new Date(summary.oldestDueDate).getTime();
          const days = Math.floor(diff / (1000 * 3600 * 24));
          if (days > 0) {
            daysText = `${days} Days Pending`;
          } else if (days < 0) {
             daysText = `Pending (${Math.abs(days)}d until due)`;
          }
        }
        return <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs font-bold flex items-center gap-1 w-fit whitespace-nowrap"><Clock size={12} /> {daysText}</span>;
      }
      case 'OVERDUE': {
        let daysText = "Overdue";
        if (summary.oldestDueDate) {
          const diff = new Date().getTime() - new Date(summary.oldestDueDate).getTime();
          const days = Math.floor(diff / (1000 * 3600 * 24));
          if (days > 0) {
             daysText = `${days} Days Overdue`;
          }
        }
        return <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-bold flex items-center gap-1 w-fit whitespace-nowrap"><AlertTriangle size={12} /> {daysText}</span>;
      }
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">{summary.status}</span>;
    }
  };

  const getStatusBadgeForHistory = (status: string) => {
    switch (status) {
      case 'PAID': return <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-bold w-fit flex items-center gap-1"><Check size={10} /> Paid</span>;
      case 'PENDING': return <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs font-bold w-fit flex items-center gap-1"><Clock size={10} /> Pending</span>;
      case 'OVERDUE': return <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-bold w-fit flex items-center gap-1"><AlertTriangle size={10} /> Overdue</span>;
      default: return <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-bold w-fit items-center flex">{status}</span>;
    }
  };

  const getDaysAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = new Date().getTime() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 3600 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Due Records */}
        <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.15)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
              <CreditCard className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Records</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Due Records</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{stats.totalRecords}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Animals with active billing</p>
          </div>
        </div>

        {/* Pending */}
        <div className="group bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(245,158,11,0.15)] hover:shadow-[0_8px_30px_rgb(245,158,11,0.3)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-white dark:bg-slate-800 border border-amber-100 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
              <Clock className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Pending</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Pending</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{stats.pending}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Awaiting payment collection</p>
          </div>
        </div>

        {/* Overdue */}
        <div className="group bg-gradient-to-br from-red-50 via-rose-50 to-red-50 dark:from-red-950/40 dark:to-rose-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(239,68,68,0.15)] hover:shadow-[0_8px_30px_rgb(239,68,68,0.3)] border border-red-100 dark:border-red-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-red-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white/60 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Alert</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Overdue</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{stats.overdue}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Past due date, action required</p>
          </div>
        </div>

        {/* Total Amount Due */}
        <div className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Amount</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Amount Due</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{tenant.currency || 'Rs.'} {stats.amountDue.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Outstanding balance to collect</p>
          </div>
        </div>
      </div>

      <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-3xl shadow-sm border border-white/50 dark:border-slate-800/50 overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white dark:bg-slate-900/50 backdrop-blur-xl">
          <div className="flex items-center gap-4 flex-wrap w-full md:w-auto">
            <div className="relative group w-full md:w-64">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                placeholder="Search tag or owner..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-sm font-medium focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-48">
                <Filter size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-sm font-medium focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="PAID">Paid</option>
                </select>
              </div>
            </div>
          </div>

          {canManage && (
            <div className="flex gap-3 flex-wrap w-full md:w-auto justify-end">
              <button
                onClick={handleGenerateMonthly}
                disabled={processing}
                className="px-4 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-white dark:hover:bg-slate-700 hover:border-slate-200 dark:hover:border-slate-600 disabled:opacity-50 flex items-center gap-2 transition-all shadow-sm"
              >
                {processing ? <RefreshCw className="animate-spin text-emerald-500" size={18} /> : <RefreshCw size={18} className="text-emerald-500" />}
                <span className="hidden sm:inline">Run Checks</span>
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
              >
                <Plus size={18} /> Record Payment
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Animal Details</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Owner Info</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Due</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Last Paid</th>
                {canManage && <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="px-6 py-16 text-center">
                    <div className="bg-white dark:bg-slate-800/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
                      <DollarSign size={48} className="text-slate-300 dark:text-slate-600" />
                    </div>
                    <p className="text-xl font-bold text-slate-700 dark:text-slate-300">No payment records found</p>
                    <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">Adjust your filters or generate new bills.</p>
                  </td>
                </tr>
              ) : (
                filteredSummaries.map(summary => (
                  <tr key={summary.cattleId} className="hover:bg-white/60 dark:hover:bg-slate-800/60/60 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-600 dark:text-blue-400 font-bold text-xs ring-4 ring-white dark:ring-slate-900 shadow-sm">
                          {summary.tagNumber}
                        </div>
                        <div className="sm:hidden">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{summary.ownerName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 hidden sm:table-cell">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{summary.ownerName}</span>
                        <span className="text-xs text-slate-400 font-mono mt-0.5">{summary.ownerEmail}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className={`font-black text-base ${summary.totalDue > 0 ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>{tenant.currency || 'Rs.'} {summary.totalDue.toLocaleString()}</span>
                        {summary.monthsDue > 1 && (
                          <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded w-fit mt-1">{summary.monthsDue} Months Pending</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {getStatusBadge(summary)}
                    </td>
                    <td className="px-6 py-5 hidden lg:table-cell">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full">
                        {getDaysAgo(summary.lastPaidDate)}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleViewDetails(summary)}
                            className="p-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye size={18} />
                          </button>
                          {(summary.status === 'OVERDUE' || summary.status === 'PENDING') && (
                            <button
                              onClick={() => handleSendReminder(summary)}
                              disabled={summary.reminderSent}
                              className={`p-2 rounded-lg transition-colors ${summary.reminderSent
                                ? 'bg-white dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'}`}
                              title={summary.reminderSent ? "Reminder Sent" : "Send Reminder"}
                            >
                              <Mail size={18} />
                            </button>
                          )}
                          {summary.status !== 'PAID' && (
                            <button
                              onClick={() => handleMarkPaid(summary)}
                              className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors"
                              title="Mark as Paid"
                            >
                              <Check size={18} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteAllForCattle(summary.cattleId)}
                            className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                            title="Clear All Records"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md flex justify-between items-center relative z-10">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="bg-emerald-100 dark:bg-emerald-500/20 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                  <Plus size={20} />
                </div>
                Add Payment Record
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5 bg-white dark:bg-slate-900 flex-1 overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Animal</label>
                <div className="relative">
                  <select
                    value={newPayment.cattleId}
                    onChange={(e) => setNewPayment({ ...newPayment, cattleId: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-xl px-4 py-3 pl-11 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none appearance-none font-medium cursor-pointer"
                  >
                    <option value="">-- Select Animal --</option>
                    {cattle.filter(c => c.status === 'Active').map(c => (
                      <option key={c.id} value={c.id}>{c.tagNumber} - {c.ownerName}</option>
                    ))}
                  </select>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Search size={18} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Amount ({tenant.currency || 'PKR'})</label>
                <div className="relative">
                  <input
                    type="number"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-xl px-4 py-3 pl-16 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-bold text-lg"
                    placeholder="e.g. 15000"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-serif font-bold">{tenant.currency || 'Rs.'}</div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Due Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={newPayment.dueDate}
                    onChange={(e) => setNewPayment({ ...newPayment, dueDate: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-xl px-4 py-3 pl-11 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Calendar size={18} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Notes (Optional)</label>
                <textarea
                  value={newPayment.notes}
                  onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium resize-none"
                  rows={3}
                  placeholder="Additional details..."
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md rounded-b-3xl flex justify-end gap-3 z-10 relative">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPayment}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all font-bold transform hover:-translate-y-0.5"
              >
                <Check size={18} /> Add Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="bg-blue-100 dark:bg-emerald-500/20 p-2 rounded-xl text-emerald-600 dark:text-blue-400">
                  <Clock size={20} />
                </div>
                Payment History
              </h3>
              <button
                onClick={() => setDetailsModalOpen(false)}
                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-white dark:bg-slate-900/50">
              {detailsLoading ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="animate-spin text-emerald-600 dark:text-emerald-400" size={32} />
                </div>
              ) : (
                <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 dark:border-slate-800/50 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-white dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
                      <tr className="text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-4">Next Payment Date</th>
                        <th className="px-5 py-4">Amount</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                      {selectedCattleDetails.map(payment => (
                        <tr key={payment.id} className="text-sm hover:bg-white dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-5 py-4">
                            {editingPayment?.id === payment.id ? (
                              <input
                                type="date"
                                className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 dark:bg-slate-700 dark:text-white w-full outline-none focus:ring-2 focus:ring-emerald-500/20"
                                value={editingPayment.dueDate.split('T')[0]}
                                onChange={e => setEditingPayment({ ...editingPayment, dueDate: e.target.value })}
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-slate-400" />
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {new Date(new Date(payment.dueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {editingPayment?.id === payment.id ? (
                              <input
                                type="number"
                                className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 w-24 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20"
                                value={editingPayment.amount}
                                onChange={e => setEditingPayment({ ...editingPayment, amount: e.target.value })}
                              />
                            ) : (
                              <span className="font-bold text-slate-800 dark:text-slate-100">{tenant.currency || 'Rs.'} {parseFloat(payment.amount).toLocaleString()}</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {editingPayment?.id === payment.id ? (
                              <select
                                className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 dark:bg-slate-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                                value={editingPayment.status}
                                onChange={e => setEditingPayment({ ...editingPayment, status: e.target.value })}
                              >
                                <option value="PENDING">Pending</option>
                                <option value="OVERDUE">Overdue</option>
                                <option value="PAID">Paid</option>
                                <option value="ADVANCE_PAID">Advance Paid</option>
                              </select>
                            ) : (
                              getStatusBadgeForHistory(payment.status)
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {editingPayment?.id === payment.id ? (
                              <div className="flex justify-end gap-2">
                                <button onClick={() => handleUpdatePayment(editingPayment)} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors" title="Save">
                                  <Save size={16} />
                                </button>
                                <button onClick={() => setEditingPayment(null)} className="p-2 bg-white text-slate-400 rounded-lg hover:bg-slate-100 transition-colors" title="Cancel">
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingPayment(payment)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Edit">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDeletePayment(payment.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {selectedCattleDetails.length === 0 && (
                        <tr><td colSpan={4} className="text-center py-12 text-slate-500">No payment records found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {settleModalOpen && settleData.summary && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md flex justify-between items-center relative z-10">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="bg-emerald-100 dark:bg-emerald-500/20 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                  <Check size={20} />
                </div>
                Settle Payment
              </h3>
              <button
                onClick={() => setSettleModalOpen(false)}
                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                disabled={processing}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 bg-white dark:bg-slate-900 flex-1">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                You are settling pending dues for <strong>{settleData.summary.tagNumber}</strong> ({settleData.summary.ownerName}). The total calculated due is <strong>{tenant.currency || 'Rs.'} {settleData.summary.totalDue.toLocaleString()}</strong>.
              </p>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Amount Paid ({tenant.currency || 'PKR'})</label>
                <div className="relative">
                  <input
                    type="number"
                    value={settleData.amount}
                    onChange={(e) => setSettleData({ ...settleData, amount: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-xl px-4 py-3 pl-16 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-bold text-lg"
                    placeholder="Enter absolute amount paid"
                    disabled={processing}
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-serif font-bold">{tenant.currency || 'Rs.'}</div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  If the owner paid for 2 months together, enter the total absolute amount. We will generate the extra invoices automatically.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md rounded-b-3xl flex justify-end gap-3 z-10 relative">
              <button
                onClick={() => setSettleModalOpen(false)}
                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl font-bold transition-colors"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={submitSettlePayment}
                disabled={processing || !settleData.amount || parseFloat(settleData.amount) <= 0}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all font-bold transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none"
              >
                {processing ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />} 
                {processing ? 'Processing...' : 'Settle Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


