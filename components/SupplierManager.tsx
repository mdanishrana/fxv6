import React, { useState, useEffect, useMemo } from 'react';
import { Supplier, SupplierPurchase, SupplierPurchaseItem, SupplierCategory, UserRole, Tenant } from '../types';
import { api } from '../services/api';
import { useTheme } from '../services/ThemeContext';
import { appEvents } from '../utils/events';
import { Truck, Plus, X, Edit2, Trash2, Phone, Mail, MapPin, Building2, Package, FileText, Calendar, DollarSign, CheckCircle, Clock, AlertCircle, Search, Filter, Loader2, ArrowRight } from 'lucide-react';

interface SupplierManagerProps {
  tenant: Tenant;
  userRole: UserRole;
}

const SUPPLIER_CATEGORIES: SupplierCategory[] = ['Feed', 'Medicine', 'Equipment', 'Veterinary', 'Rent', 'Electricity', 'Fuel', 'Maintenance', 'Labor', 'Other'];

const INITIAL_SUPPLIER: Partial<Supplier> = {
  name: '',
  company: '',
  phone: '',
  email: '',
  address: '',
  category: 'Feed',
  notes: '',
  status: 'ACTIVE'
};

const INITIAL_PURCHASE_ITEM: SupplierPurchaseItem = {
  name: '',
  quantity: 0,
  unit: 'kg',
  unitPrice: 0,
  total: 0
};

export const SupplierManager: React.FC<SupplierManagerProps> = ({ tenant, userRole }) => {
  const { isDarkMode, t } = useTheme();
  const [activeTab, setActiveTab] = useState<'suppliers' | 'purchases'>('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Partial<Supplier>>(INITIAL_SUPPLIER);
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [currentPurchase, setCurrentPurchase] = useState<Partial<SupplierPurchase>>({
    supplierId: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    invoiceNumber: '',
    items: [{ ...INITIAL_PURCHASE_ITEM }],
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    paymentStatus: 'PENDING',
    paidAmount: 0,
    notes: ''
  });
  const [isEditingPurchase, setIsEditingPurchase] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const canManage = userRole === 'OWNER' || userRole === 'MANAGER';

  useEffect(() => {
    loadData();
  }, [tenant.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [suppliersData, purchasesData] = await Promise.all([
        api.suppliers.list(tenant.id),
        api.suppliers.listPurchases(tenant.id)
      ]);
      setSuppliers(suppliersData);
      setPurchases(purchasesData);
    } catch (err) {
      console.error('Failed to load supplier data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.company && s.company.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [suppliers, searchTerm, categoryFilter, statusFilter]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const supplier = suppliers.find(s => s.id === p.supplierId);
      const matchesSearch = (supplier?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || p.paymentStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [purchases, suppliers, searchTerm, statusFilter]);

  const handleOpenSupplierModal = (supplier?: Supplier) => {
    if (supplier) {
      setCurrentSupplier(supplier);
      setIsEditingSupplier(true);
    } else {
      setCurrentSupplier(INITIAL_SUPPLIER);
      setIsEditingSupplier(false);
    }
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async () => {
    if (!currentSupplier.name) {
      alert('Supplier name is required');
      return;
    }
    setIsSaving(true);
    try {
      if (isEditingSupplier && currentSupplier.id) {
        await api.suppliers.update(tenant.id, currentSupplier.id, currentSupplier);
      } else {
        await api.suppliers.create(tenant.id, currentSupplier);
      }
      await loadData();
      appEvents.emit('SUPPLIERS_UPDATED');
      setShowSupplierModal(false);
    } catch (err) {
      alert('Failed to save supplier');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      await api.suppliers.delete(tenant.id, id);
      await loadData();
      appEvents.emit('SUPPLIERS_UPDATED');
    } catch (err) {
      alert('Failed to delete supplier');
    }
  };

  const handleOpenPurchaseModal = (purchase?: SupplierPurchase) => {
    if (purchase) {
      setCurrentPurchase(purchase);
      setIsEditingPurchase(true);
    } else {
      setCurrentPurchase({
        supplierId: suppliers.length > 0 ? suppliers[0].id : '',
        purchaseDate: new Date().toISOString().split('T')[0],
        invoiceNumber: '',
        items: [{ ...INITIAL_PURCHASE_ITEM }],
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        paymentStatus: 'PENDING',
        paidAmount: 0,
        notes: ''
      });
      setIsEditingPurchase(false);
    }
    setShowPurchaseModal(true);
  };

  const handleAddPurchaseItem = () => {
    setCurrentPurchase(prev => ({
      ...prev,
      items: [...(prev.items || []), { ...INITIAL_PURCHASE_ITEM }]
    }));
  };

  const handleRemovePurchaseItem = (index: number) => {
    setCurrentPurchase(prev => {
      const newItems = [...(prev.items || [])];
      newItems.splice(index, 1);
      return { ...prev, items: newItems };
    });
    recalculateTotals();
  };

  const handleUpdatePurchaseItem = (index: number, field: keyof SupplierPurchaseItem, value: any) => {
    setCurrentPurchase(prev => {
      const newItems = [...(prev.items || [])];
      newItems[index] = { ...newItems[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
      }
      const subtotal = newItems.reduce((sum, item) => sum + item.total, 0);
      const taxAmount = prev.taxAmount || 0;
      return {
        ...prev,
        items: newItems,
        subtotal,
        totalAmount: subtotal + taxAmount
      };
    });
  };

  const recalculateTotals = () => {
    setCurrentPurchase(prev => {
      const subtotal = (prev.items || []).reduce((sum, item) => sum + item.total, 0);
      const taxAmount = prev.taxAmount || 0;
      return { ...prev, subtotal, totalAmount: subtotal + taxAmount };
    });
  };

  const handleTaxChange = (tax: number) => {
    setCurrentPurchase(prev => ({
      ...prev,
      taxAmount: tax,
      totalAmount: (prev.subtotal || 0) + tax
    }));
  };

  const handleSavePurchase = async () => {
    if (!currentPurchase.supplierId) {
      alert('Please select a supplier');
      return;
    }
    if (!currentPurchase.items || currentPurchase.items.length === 0) {
      alert('Please add at least one item');
      return;
    }
    setIsSaving(true);
    try {
      if (isEditingPurchase && currentPurchase.id) {
        await api.suppliers.updatePurchase(tenant.id, currentPurchase.id, currentPurchase);
      } else {
        await api.suppliers.createPurchase(tenant.id, currentPurchase);
      }
      await loadData();
      setShowPurchaseModal(false);
    } catch (err) {
      alert('Failed to save purchase');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePurchase = async (id: string) => {
    if (!confirm('Are you sure you want to delete this purchase?')) return;
    try {
      await api.suppliers.deletePurchase(tenant.id, id);
      await loadData();
    } catch (err) {
      alert('Failed to delete purchase');
    }
  };

  const getSupplierName = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || 'Unknown';
  };

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

  const totalOwed = useMemo(() => {
    return purchases
      .filter(p => p.paymentStatus !== 'PAID')
      .reduce((sum, p) => sum + ((p.totalAmount || 0) - (p.paidAmount || 0)), 0);
  }, [purchases]);

  const totalPurchases = useMemo(() => {
    return purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
  }, [purchases]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
        <div className="w-full lg:w-auto">
          <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent flex items-center gap-3">
            {t('suppliers')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 text-sm">Track vendors, purchases, and payment status</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="flex gap-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-sm w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${activeTab === 'suppliers' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 scale-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700/50'}`}
            >
              Suppliers
            </button>
            <button
              onClick={() => setActiveTab('purchases')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${activeTab === 'purchases' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 scale-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700/50'}`}
            >
              Purchases
            </button>
          </div>

          {canManage && (
            <button
              onClick={() => activeTab === 'suppliers' ? handleOpenSupplierModal() : handleOpenPurchaseModal()}
              className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-2xl flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 font-bold hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
            >
              <Plus size={18} /> {activeTab === 'suppliers' ? 'Add Supplier' : 'New Purchase'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        {/* Total Suppliers */}
        <div className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
              <Building2 className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Vendors</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Suppliers</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{suppliers.length}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Registered vendors</p>
          </div>
        </div>

        {/* Total Purchases */}
        <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.15)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
              <Package className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Purchases</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Purchases</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight"><span className="text-lg text-blue-600/80 dark:text-blue-500 font-bold mr-1">Rs.</span>{totalPurchases.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">All time purchases</p>
          </div>
        </div>

        {/* Amount Owed */}
        <div className="group bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(245,158,11,0.15)] hover:shadow-[0_8px_30px_rgb(245,158,11,0.3)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl text-white shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white dark:bg-black/20 backdrop-blur-md text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-800/50 shadow-sm">Owed</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Amount Owed</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight"><span className="text-lg text-amber-600/80 dark:text-amber-500 font-bold mr-1">Rs.</span>{totalOwed.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Outstanding balance</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search suppliers, invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
          />
        </div>
        {activeTab === 'suppliers' && (
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="pl-9 pr-8 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none appearance-none cursor-pointer hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors h-full"
            >
              <option value="all">All Categories</option>
              {SUPPLIER_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        )}
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none appearance-none cursor-pointer hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors h-full"
          >
            <option value="all">All Status</option>
            {activeTab === 'suppliers' ? (
              <>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </>
            ) : (
              <>
                <option value="PENDING">Pending</option>
                <option value="PARTIAL">Partial</option>
                <option value="PAID">Paid</option>
              </>
            )}
          </select>
        </div>
      </div>

      {activeTab === 'suppliers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuppliers.map(supplier => (
            <div key={supplier.id} className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgba(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:border-emerald-200 dark:hover:border-emerald-800/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/10 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg shadow-emerald-500/30">
                    {supplier.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors tracking-tight">{supplier.name}</h3>
                    {supplier.company && <p className="text-sm text-slate-500 font-medium">{supplier.company}</p>}
                  </div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-bold tracking-widest uppercase border ${supplier.status === 'ACTIVE' ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
                  {supplier.status}
                </span>
              </div>

              <div className="space-y-3 text-sm mb-6 bg-white/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-white/20 dark:border-slate-700/50 relative z-10">
                {supplier.phone && (
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-medium">
                    <Phone size={16} className="text-emerald-500" />
                    {supplier.phone}
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-medium">
                    <Mail size={16} className="text-emerald-500" />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                )}
                {supplier.address && (
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-medium">
                    <MapPin size={16} className="text-emerald-500" />
                    <span className="truncate">{supplier.address}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 relative z-10">
                <span className="text-xs font-bold uppercase tracking-wider bg-white/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-xl border border-white/20 dark:border-slate-700/50 shadow-sm">
                  {supplier.category || 'Other'}
                </span>
                {canManage && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenSupplierModal(supplier)}
                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all shadow-sm"
                      title="Edit Supplier"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteSupplier(supplier.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all shadow-sm"
                      title="Delete Supplier"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredSuppliers.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400 bg-white/40 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-full mb-4">
                <Truck size={40} className="opacity-50" />
              </div>
              <p className="text-lg font-medium">No suppliers found</p>
              <p className="text-sm mt-1">Try adjusting the search or add a new supplier.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'purchases' && (
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/20 dark:bg-slate-900/30">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Supplier</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Items</th>
                  <th className="text-right px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</th>
                  <th className="text-center px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  {canManage && <th className="text-center px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20 dark:divide-slate-700/50">
                {filteredPurchases.map(purchase => (
                  <tr key={purchase.id} className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors group">
                    <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300 font-medium">
                      {new Date(purchase.purchaseDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-800 dark:text-slate-100">
                      {getSupplierName(purchase.supplierId)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-mono">
                      {purchase.invoiceNumber || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      <span className="bg-white/60 dark:bg-slate-700/60 px-3 py-1 rounded-lg text-xs font-bold shadow-sm border border-white/20 dark:border-slate-600/50">
                        {purchase.items?.length || 0} items
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-black text-slate-800 dark:text-slate-100 text-right">
                      Rs. {(purchase.totalAmount || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold border ${getPaymentStatusColor(purchase.paymentStatus).replace('bg-', 'bg-opacity-50 bg-').replace('text-', 'text-opacity-90 text-')}`}>
                        {getPaymentStatusIcon(purchase.paymentStatus)}
                        {purchase.paymentStatus}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenPurchaseModal(purchase)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all shadow-sm"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeletePurchase(purchase.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all shadow-sm"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredPurchases.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-6 py-16 text-center text-slate-500">
                      <FileText size={48} className="mx-auto mb-3 opacity-30" />
                      <p>No purchases found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full border border-slate-200/60 dark:border-slate-700/60 max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur z-10">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{isEditingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
              <button onClick={() => setShowSupplierModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Supplier Name *</label>
                <input
                  type="text"
                  value={currentSupplier.name || ''}
                  onChange={(e) => setCurrentSupplier({ ...currentSupplier, name: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g. Ali Traders"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Company Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={currentSupplier.company || ''}
                    onChange={(e) => setCurrentSupplier({ ...currentSupplier, company: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                    placeholder="e.g. National Feeds Ltd"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Phone</label>
                  <input
                    type="text"
                    value={currentSupplier.phone || ''}
                    onChange={(e) => setCurrentSupplier({ ...currentSupplier, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    placeholder="03XX-XXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email</label>
                  <input
                    type="email"
                    value={currentSupplier.email || ''}
                    onChange={(e) => setCurrentSupplier({ ...currentSupplier, email: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Address</label>
                <input
                  type="text"
                  value={currentSupplier.address || ''}
                  onChange={(e) => setCurrentSupplier({ ...currentSupplier, address: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  placeholder="Full business address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    value={currentSupplier.category || 'Feed'}
                    onChange={(e) => setCurrentSupplier({ ...currentSupplier, category: e.target.value as SupplierCategory })}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    {SUPPLIER_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    value={currentSupplier.status || 'ACTIVE'}
                    onChange={(e) => setCurrentSupplier({ ...currentSupplier, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notes</label>
                <textarea
                  value={currentSupplier.notes || ''}
                  onChange={(e) => setCurrentSupplier({ ...currentSupplier, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none"
                  placeholder="Any additional details..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-white dark:bg-slate-800/50">
              <button
                onClick={() => setShowSupplierModal(false)}
                className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSupplier}
                disabled={isSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition-all flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : null}
                {isEditingSupplier ? 'Update' : 'Create'} Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full border border-slate-200/60 dark:border-slate-700/60 max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur z-10">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{isEditingPurchase ? 'Edit Purchase Record' : 'Record New Purchase'}</h3>
              <button onClick={() => setShowPurchaseModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Supplier *</label>
                  <select
                    value={currentPurchase.supplierId || ''}
                    onChange={(e) => setCurrentPurchase({ ...currentPurchase, supplierId: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    <option value="">Select a Supplier</option>
                    {suppliers.filter(s => s.status === 'ACTIVE').map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Purchase Date</label>
                  <input
                    type="date"
                    value={currentPurchase.purchaseDate || ''}
                    onChange={(e) => setCurrentPurchase({ ...currentPurchase, purchaseDate: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Invoice Number</label>
                  <div className="relative">
                    <FileText className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                    <input
                      type="text"
                      value={currentPurchase.invoiceNumber || ''}
                      onChange={(e) => setCurrentPurchase({ ...currentPurchase, invoiceNumber: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                      placeholder="e.g. INV-2024-001"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Purchase Items</label>
                  <button onClick={handleAddPurchaseItem} className="text-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-emerald-200 transition-colors">
                    <Plus size={16} /> Add Item
                  </button>
                </div>

                <div className="space-y-3 bg-white dark:bg-slate-900/30 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 max-h-60 overflow-y-auto custom-scrollbar">
                  {(currentPurchase.items || []).map((item, index) => (
                    <div key={index} className="flex gap-3 items-center bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-3 rounded-lg border border-white/50 dark:border-slate-800/50 shadow-sm animate-fade-in">
                      <div className="flex-1 grid grid-cols-12 gap-3">
                        <div className="col-span-5">
                          <input
                            type="text"
                            placeholder="Item Name"
                            value={item.name}
                            onChange={(e) => handleUpdatePurchaseItem(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            placeholder="Qty"
                            value={item.quantity || ''}
                            onChange={(e) => handleUpdatePurchaseItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            placeholder="Price"
                            value={item.unitPrice || ''}
                            onChange={(e) => handleUpdatePurchaseItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                        <div className="col-span-3 flex items-center justify-end font-mono font-medium text-slate-700 dark:text-slate-200">
                          Rs. {item.total.toLocaleString()}
                        </div>
                      </div>
                      <button onClick={() => handleRemovePurchaseItem(index)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                  {(currentPurchase.items?.length === 0) && (
                    <div className="text-center py-4 text-slate-400 text-sm italic">No items added yet.</div>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-700/30 p-5 rounded-2xl space-y-3">
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-mono">Rs. {(currentPurchase.subtotal || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Tax / VAT</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Amount</span>
                    <input
                      type="number"
                      value={currentPurchase.taxAmount || ''}
                      onChange={(e) => handleTaxChange(parseFloat(e.target.value) || 0)}
                      className="w-28 px-2 py-1 text-right text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-slate-200 dark:border-slate-600 pt-3 text-slate-800 dark:text-white">
                  <span>Total Payable</span>
                  <span>Rs. {(currentPurchase.totalAmount || 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Payment Status</label>
                  <select
                    value={currentPurchase.paymentStatus || 'PENDING'}
                    onChange={(e) => setCurrentPurchase({ ...currentPurchase, paymentStatus: e.target.value as any })}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partial Payment</option>
                    <option value="PAID">Fully Paid</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Paid Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-slate-400 text-sm">Rs.</span>
                    <input
                      type="number"
                      value={currentPurchase.paidAmount || ''}
                      onChange={(e) => setCurrentPurchase({ ...currentPurchase, paidAmount: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notes</label>
                <textarea
                  value={currentPurchase.notes || ''}
                  onChange={(e) => setCurrentPurchase({ ...currentPurchase, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none"
                  placeholder="Additional notes about payment or delivery..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-white dark:bg-slate-800/50">
              <button onClick={() => setShowPurchaseModal(false)} className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSavePurchase}
                disabled={isSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition-all flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : null}
                {isEditingPurchase ? 'Update' : 'Save'} Purchase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
