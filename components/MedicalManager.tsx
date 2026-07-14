import React, { useState, useEffect } from 'react';
import {
    Search, Plus, Filter, AlertCircle, Edit2, Trash2,
    Syringe, Pill, Package, Calendar, RefreshCw, ChevronDown
} from 'lucide-react';
import { api } from '../services/api';
import { MedicalItem, MedicalType, MedicalStatus } from '../types';
import { useTheme } from '../services/ThemeContext';

interface MedicalManagerProps {
    tenantId: string;
}

export const MedicalManager: React.FC<MedicalManagerProps> = ({ tenantId }) => {
    const { isRTL, t } = useTheme();
    const [items, setItems] = useState<MedicalItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<MedicalType | 'ALL'>('ALL');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingItem, setEditingItem] = useState<MedicalItem | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<MedicalItem>>({
        type: 'MEDICINE',
        name: '',
        targetAnimal: 'Both',
        batchNumber: '',
        manufacturer: '',
        quantity: 0,
        unit: 'doses',
        costPerUnit: 0,
        expiryDate: '',
        notes: '',
        status: 'ACTIVE'
    });

    useEffect(() => {
        fetchItems();
    }, [tenantId]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const data = await api.medical.list(tenantId);
            setItems(data);
        } catch (error) {
            console.error('Failed to fetch medical inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingItem) {
                await api.medical.update(tenantId, editingItem.id, formData);
            } else {
                await api.medical.create(tenantId, formData);
            }
            setShowAddModal(false);
            setEditingItem(null);
            resetForm();
            fetchItems();
        } catch (error: any) {
            console.error('Failed to save item:', error);
            alert(`Failed to save item: ${error.message || error}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return;
        try {
            await api.medical.delete(tenantId, id);
            fetchItems();
        } catch (error) {
            console.error('Failed to delete item:', error);
        }
    };

    const resetForm = () => {
        setFormData({
            type: 'MEDICINE',
            name: '',
            targetAnimal: 'Both',
            batchNumber: '',
            manufacturer: '',
            quantity: 0,
            unit: 'doses',
            costPerUnit: 0,
            expiryDate: '',
            notes: '',
            status: 'ACTIVE'
        });
    };

    const openEditModal = (item: MedicalItem) => {
        setEditingItem(item);
        setFormData({ ...item });
        setShowAddModal(true);
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.batchNumber?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'ALL' || item.type === filterType;
        return matchesSearch && matchesType;
    });

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                <div className="w-full lg:w-auto">
                    <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <Pill size={24} />
                        </div>
                        Medical Inventory
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 text-sm">Manage medicines, vaccines, and health supplies</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowAddModal(true); }}
                    className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-3 rounded-2xl flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 font-bold hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                >
                    <Plus size={18} />
                    Add Item
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400`} size={20} />
                    <input
                        type="text"
                        placeholder="Search by name or batch..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`w-full ${isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'} py-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-white/20 dark:border-slate-700/50 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm`}
                    />
                </div>
                <div className="flex gap-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-sm w-full sm:w-auto overflow-x-auto no-scrollbar">
                    {(['ALL', 'VACCINE', 'MEDICINE'] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${filterType === type
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 scale-100'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700/50'
                                }`}
                        >
                            {type === 'ALL' ? 'All Items' : type === 'VACCINE' ? 'Vaccines' : 'Medicines'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Inventory List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {loading ? (
                    [...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-6 h-48 animate-pulse border border-slate-200 dark:border-slate-700" />
                    ))
                ) : filteredItems.length > 0 ? (
                    filteredItems.map(item => (
                        <div key={item.id} className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-5 rounded-3xl shadow-sm hover:shadow-[0_8px_30px_rgb(16,185,129,0.15)] border border-white/50 dark:border-slate-800/50 hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
                            <div className={`absolute top-0 left-0 w-1 h-full ${item.type === 'VACCINE' ? 'bg-emerald-500' : 'bg-emerald-500'}`} />

                            <div className="flex justify-between items-start mb-3 pl-2">
                                <div className="flex items-center gap-2">
                                    {item.type === 'VACCINE' ? (
                                        <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-emerald-600 rounded-lg"><Syringe size={16} /></div>
                                    ) : (
                                        <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg"><Pill size={16} /></div>
                                    )}
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.status === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                        item.status === 'EXPIRED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                        }`}>
                                        {item.status}
                                    </span>
                                </div>
                                <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEditModal(item)} className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                </div>
                            </div>

                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-1 pl-2 truncate" title={item.name}>{item.name}</h3>
                            <div className="pl-2 space-y-2">
                                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <Package size={14} />
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{item.quantity} {item.unit}</span>
                                </div>
                                {item.batchNumber && (
                                    <div className="text-xs text-slate-400 flex items-center gap-2">
                                        <span className="font-mono bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded">Batch: {item.batchNumber}</span>
                                    </div>
                                )}
                                {item.expiryDate && (
                                    <div className="text-xs text-slate-400 flex items-center gap-2">
                                        <Calendar size={12} />
                                        <span>Exp: {new Date(item.expiryDate).toLocaleDateString()}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 text-slate-400 bg-white dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                        <Package size={48} className="mb-4 opacity-50" />
                        <p className="text-lg font-medium">No items found</p>
                        <p className="text-sm">Add medicines or vaccines to get started.</p>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800/50">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                {editingItem ? 'Edit Item' : 'Add New Item'}
                            </h2>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><Plus className="rotate-45" size={24} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Item Type</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" checked={formData.type === 'MEDICINE'} onChange={() => setFormData({ ...formData, type: 'MEDICINE' })} className="accent-rose-500 w-4 h-4" />
                                            <span className="text-slate-700 dark:text-slate-300">Medicine</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" checked={formData.type === 'VACCINE'} onChange={() => setFormData({ ...formData, type: 'VACCINE' })} className="accent-rose-500 w-4 h-4" />
                                            <span className="text-slate-700 dark:text-slate-300">Vaccine</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Name <span className="text-rose-500">*</span></label>
                                    <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 focus:ring-2 focus:ring-rose-500/20 outline-none" placeholder="e.g. Panadol, FMD Vaccine" />
                                </div>

                                {formData.type === 'VACCINE' && (
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Target Animal</label>
                                        <div className="flex gap-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                            <button type="button" onClick={() => setFormData({ ...formData, targetAnimal: 'Both' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.targetAnimal === 'Both' || !formData.targetAnimal ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>Both</button>
                                            <button type="button" onClick={() => setFormData({ ...formData, targetAnimal: 'Cow' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.targetAnimal === 'Cow' ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>Cow / Buffalo</button>
                                            <button type="button" onClick={() => setFormData({ ...formData, targetAnimal: 'Goat' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.targetAnimal === 'Goat' ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>Goat / Sheep</button>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Quantity <span className="text-rose-500">*</span></label>
                                    <input required type="number" min="0" step="any" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseFloat(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 focus:ring-2 focus:ring-rose-500/20 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Unit</label>
                                    <select value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 outline-none">
                                        <option value="doses">doses</option>
                                        <option value="ml">ml</option>
                                        <option value="pills">pills</option>
                                        <option value="bottles">bottles</option>
                                        <option value="kg">kg</option>
                                        <option value="g">g</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Price / Unit</label>
                                    <input type="number" min="0" step="any" value={formData.costPerUnit} onChange={e => setFormData({ ...formData, costPerUnit: parseFloat(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 focus:ring-2 focus:ring-rose-500/20 outline-none" placeholder="0.00" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Batch Number</label>
                                    <input type="text" value={formData.batchNumber} onChange={e => setFormData({ ...formData, batchNumber: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 outline-none" placeholder="Optional" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Expiry Date</label>
                                    <input type="date" value={formData.expiryDate ? new Date(formData.expiryDate).toISOString().split('T')[0] : ''} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 outline-none" />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Manufacturer</label>
                                    <input type="text" value={formData.manufacturer} onChange={e => setFormData({ ...formData, manufacturer: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 outline-none" placeholder="e.g. Pfizer, Local" />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Notes</label>
                                    <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 outline-none min-h-[80px]" placeholder="Additional details..." />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                                    {editingItem ? 'Save Changes' : 'Add Item'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
