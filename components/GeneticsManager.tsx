import React, { useState, useEffect } from 'react';
import { Plus, Search, Dna, TestTube, Trash2, Edit2, Archive, CheckCircle, AlertCircle, X, Filter } from 'lucide-react';
import { api } from '../services/api';
import { useTheme } from '../services/ThemeContext';

interface GeneticsManagerProps {
    tenant: any;
}

export function GeneticsManager({ tenant }: GeneticsManagerProps) {
    const { isDarkMode } = useTheme();
    const [activeTab, setActiveTab] = useState<'SEMEN' | 'EMBRYOS'>('SEMEN');
    const [semen, setSemen] = useState<any[]>([]);
    const [embryos, setEmbryos] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    // Form State
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const loadData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('farmxpert_token');
            const headers = { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id };

            if (activeTab === 'SEMEN') {
                const res = await fetch('/api/genetics/semen', { headers });
                if (res.ok) setSemen(await res.json());
            } else {
                const res = await fetch('/api/genetics/embryos', { headers });
                if (res.ok) setEmbryos(await res.json());
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('farmxpert_token');
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-tenant-id': tenant.id
            };

            const endpoint = activeTab === 'SEMEN' ? '/api/genetics/semen' : '/api/genetics/embryos';
            const url = editingItem ? `${endpoint}/${editingItem.id}` : endpoint;
            const method = editingItem ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setShowModal(false);
                setFormData({});
                setEditingItem(null);
                loadData();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to save');
            }
        } catch (err) {
            alert('Error saving record');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this record?')) return;
        try {
            const token = localStorage.getItem('farmxpert_token');
            const endpoint = activeTab === 'SEMEN' ? '/api/genetics/semen' : '/api/genetics/embryos';

            await fetch(`${endpoint}/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id }
            });
            loadData();
        } catch (err) {
            alert('Failed to delete');
        }
    };

    const openModal = (item?: any) => {
        if (item) {
            setEditingItem(item);
            setFormData(item);
        } else {
            setEditingItem(null);
            setFormData({ status: 'AVAILABLE' });
        }
        setShowModal(true);
    };

    const filteredData = (activeTab === 'SEMEN' ? semen : embryos).filter(item =>
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.bull_name && item.bull_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400">
                            Genetics
                        </span> Management
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
                        Manage your Semen & Embryo inventory for advanced breeding programs.
                    </p>
                </div>

                {/* Modern Tabs */}
                <div className="bg-white dark:bg-slate-800/50 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 flex gap-2 shadow-sm">
                    <button
                        onClick={() => setActiveTab('SEMEN')}
                        className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'SEMEN' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-md transform scale-[1.02]' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                    >
                        <TestTube size={18} className={activeTab === 'SEMEN' ? 'text-emerald-500' : ''} />
                        Semen Bank
                    </button>
                    <button
                        onClick={() => setActiveTab('EMBRYOS')}
                        className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'EMBRYOS' ? 'bg-white dark:bg-slate-700 text-pink-600 dark:text-pink-400 shadow-md transform scale-[1.02]' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                    >
                        <Dna size={18} className={activeTab === 'EMBRYOS' ? 'text-pink-500' : ''} />
                        Embryo Bank
                    </button>
                </div>
            </div>

            {/* Main Content Card */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 overflow-hidden">

                {/* Toolbar */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/30 dark:bg-slate-800/30 backdrop-blur-sm">
                    <div className="relative w-full sm:w-80 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder={`Search by Code or Bull Name...`}
                            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-700 dark:text-slate-200 placeholder-slate-400"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all text-sm"
                    >
                        <Plus size={18} /> Add {activeTab === 'SEMEN' ? 'Semen' : 'Embryo'}
                    </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-wider backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-6 py-4">Code</th>
                                <th className="px-6 py-4">Sire / Bull</th>
                                {activeTab === 'EMBRYOS' && <th className="px-6 py-4">Donor Dam</th>}
                                <th className="px-6 py-4">Breed</th>
                                <th className="px-6 py-4">Source</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {filteredData.map(item => (
                                <tr key={item.id} className="hover:bg-white dark:hover:bg-slate-700/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">{item.code}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-700 dark:text-slate-300 text-sm flex items-center gap-2">
                                            <div className="bg-white dark:bg-slate-700 p-1.5 rounded-lg text-slate-500"><Dna size={14} /></div>
                                            {item.bull_name || '-'}
                                        </div>
                                    </td>
                                    {activeTab === 'EMBRYOS' && <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{item.donor_cow || '-'}</td>}
                                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                                        <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded text-xs font-medium border border-slate-200 dark:border-slate-700">
                                            {item.breed || '-'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{item.source || 'OWN'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${item.status === 'AVAILABLE'
                                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                                                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                            }`}>
                                            {item.status === 'AVAILABLE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>}
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openModal(item)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Edit">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors" title="Delete">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <div className="bg-white dark:bg-slate-800 p-4 rounded-full mb-4">
                                                <Archive size={32} className="opacity-50" />
                                            </div>
                                            <p className="text-lg font-medium text-slate-600 dark:text-slate-300">No records found</p>
                                            <p className="text-sm mt-1">Try adjusting your search or add a new entry.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-700">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex justify-between items-center backdrop-blur-md">
                            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <div className={`p-2 rounded-lg ${activeTab === 'SEMEN' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400'}`}>
                                    {activeTab === 'SEMEN' ? <TestTube size={20} /> : <Dna size={20} />}
                                </div>
                                {editingItem ? 'Edit' : 'Add'} {activeTab === 'SEMEN' ? 'Semen' : 'Embryo'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Code *</label>
                                    <input required type="text" className="w-full px-4 py-2.5 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 dark:text-slate-100 font-medium" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="Unique ID" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</label>
                                    <div className="relative">
                                        <select className="w-full px-4 py-2.5 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 dark:text-slate-100 appearance-none font-medium" value={formData.status || 'AVAILABLE'} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                            <option value="AVAILABLE">Available</option>
                                            <option value="ARCHIVED">Archived</option>
                                            <option value={activeTab === 'SEMEN' ? 'DEPLETED' : 'TRANSFERRED'}>{activeTab === 'SEMEN' ? 'Depleted' : 'Transferred'}</option>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                            <Filter size={14} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sire / Bull Name</label>
                                <input type="text" className="w-full px-4 py-2.5 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 dark:text-slate-100" value={formData.bull_name || ''} onChange={e => setFormData({ ...formData, bull_name: e.target.value })} placeholder="Name of the Bull" />
                            </div>

                            {activeTab === 'EMBRYOS' && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Donor Dam</label>
                                    <input type="text" className="w-full px-4 py-2.5 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 dark:text-slate-100" value={formData.donor_cow || ''} onChange={e => setFormData({ ...formData, donor_cow: e.target.value })} placeholder="Mother Cow" />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Breed</label>
                                    <input type="text" className="w-full px-4 py-2.5 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 dark:text-slate-100" value={formData.breed || ''} onChange={e => setFormData({ ...formData, breed: e.target.value })} placeholder="e.g. Holstein" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Source</label>
                                    <input type="text" className="w-full px-4 py-2.5 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 dark:text-slate-100" value={formData.source || ''} onChange={e => setFormData({ ...formData, source: e.target.value })} placeholder="e.g. Own, Imported" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Notes</label>
                                <textarea className="w-full px-4 py-2.5 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl min-h-[100px] focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 dark:text-slate-100 resize-none" value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional details..."></textarea>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-white dark:hover:bg-slate-600 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all">Save Record</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
