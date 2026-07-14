import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Users, Tag, Loader2, X, Check } from 'lucide-react';
import { useTheme } from '../services/ThemeContext';
import { useNavigate } from 'react-router-dom';

interface CattleGroup {
    id: string;
    name: string;
    description?: string;
    color: string;
    animal_count: number;
    created_at: string;
}

interface GroupsManagerProps {
    tenant: { id: string };
}

const PRESET_COLORS = [
    '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const getAuthHeaders = (tenantId: string) => {
    const token = localStorage.getItem('farmxpert_token');
    return {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const GroupsManager: React.FC<GroupsManagerProps> = ({ tenant }) => {
    const { isDarkMode } = useTheme();
    const navigate = useNavigate();
    const [groups, setGroups] = useState<CattleGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState<CattleGroup | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', color: '#10b981' });
    const [error, setError] = useState<string | null>(null);

    const fetchGroups = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/groups', { headers: getAuthHeaders(tenant.id) });
            if (res.ok) setGroups(await res.json());
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [tenant.id]);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    const openAdd = () => {
        setEditingGroup(null);
        setForm({ name: '', description: '', color: '#10b981' });
        setError(null);
        setShowModal(true);
    };

    const openEdit = (group: CattleGroup) => {
        setEditingGroup(group);
        setForm({ name: group.name, description: group.description || '', color: group.color });
        setError(null);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) { setError('Group name is required'); return; }
        setIsSaving(true);
        setError(null);
        try {
            const url = editingGroup ? `/api/groups/${editingGroup.id}` : '/api/groups';
            const method = editingGroup ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: getAuthHeaders(tenant.id),
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save group');

            if (editingGroup) {
                // Update in place
                setGroups(prev => prev.map(g => g.id === editingGroup.id
                    ? { ...g, name: data.name, description: data.description, color: data.color }
                    : g
                ));
            } else {
                // Add new group directly to list (with animal_count = 0)
                setGroups(prev => [...prev, { ...data, animal_count: 0 }]);
            }
            setShowModal(false);
            // Refresh in background to get accurate animal counts
            fetchGroups();
        } catch (err: any) {
            console.error('Save group error:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (group: CattleGroup) => {
        if (!confirm(`Delete group "${group.name}"? Animals will become ungrouped.`)) return;
        try {
            await fetch(`/api/groups/${group.id}`, { method: 'DELETE', headers: getAuthHeaders(tenant.id) });
            setGroups(prev => prev.filter(g => g.id !== group.id));
        } catch (err) { console.error(err); }
    };

    const base = isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800';
    const card = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';

    return (
        <div className={`min-h-screen p-4 md:p-6 ${base}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Animal Groups</h1>
                    <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Organize your herd into logical groups (e.g. Fattening Batch A, Breeding Group)
                    </p>
                </div>
                <button
                    onClick={openAdd}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-lg text-sm transition-all"
                >
                    <Plus size={18} /> New Group
                </button>
            </div>

            {/* Stats bar */}
            <div className={`flex items-center gap-6 p-4 rounded-xl border mb-6 ${card}`}>
                <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600">{groups.length}</p>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Groups</p>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{groups.reduce((s, g) => s + g.animal_count, 0)}</p>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Assigned Animals</p>
                </div>
            </div>

            {/* Groups Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-emerald-500" size={36} />
                </div>
            ) : groups.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    <Users size={48} className={isDarkMode ? 'text-slate-600' : 'text-slate-300'} />
                    <p className={`mt-4 text-lg font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No groups yet</p>
                    <p className={`text-sm mb-6 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Create a group to organize your animals</p>
                    <button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-sm font-medium">
                        <Plus size={16} className="inline mr-1" /> Create First Group
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {groups.map(group => (
                        <div 
                            key={group.id} 
                            onClick={() => navigate(`/cattle?groupId=${group.id}`)}
                            className={`rounded-2xl border p-5 relative overflow-hidden transition-all hover:shadow-md cursor-pointer ${card}`}
                        >
                            {/* Color accent bar */}
                            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ backgroundColor: group.color }} />

                            <div className="flex items-start justify-between mt-1">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm" style={{ backgroundColor: group.color }}>
                                        {group.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-base leading-tight">{group.name}</p>
                                        {group.description && (
                                            <p className={`text-xs mt-0.5 line-clamp-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{group.description}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={(e) => { e.stopPropagation(); openEdit(group); }} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                                        <Edit2 size={14} />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(group); }} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className={`mt-4 pt-3 border-t flex items-center gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                                <Tag size={14} style={{ color: group.color }} />
                                <span className="text-sm font-semibold" style={{ color: group.color }}>{group.animal_count}</span>
                                <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>animal{group.animal_count !== 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className={`rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <div className={`p-5 border-b flex items-center justify-between ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                            <h3 className="text-lg font-bold">{editingGroup ? 'Edit Group' : 'New Group'}</h3>
                            <button onClick={() => setShowModal(false)} className={`p-1 rounded-lg ${isDarkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Group Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g. Fattening Batch A"
                                    autoFocus
                                    className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 ${isDarkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-800'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Optional description..."
                                    rows={2}
                                    className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none ${isDarkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-800'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Color</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setForm({ ...form, color: c })}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform hover:scale-110 shadow-sm"
                                            style={{ backgroundColor: c }}
                                        >
                                            {form.color === c && <Check size={14} className="text-white" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {error && <p className="text-red-500 text-sm">{error}</p>}
                        </div>
                        <div className={`p-4 border-t flex justify-end gap-3 ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50'}`}>
                            <button onClick={() => setShowModal(false)} className={`px-4 py-2 rounded-xl text-sm ${isDarkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}>Cancel</button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                            >
                                {isSaving && <Loader2 size={14} className="animate-spin" />}
                                {editingGroup ? 'Save Changes' : 'Create Group'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
