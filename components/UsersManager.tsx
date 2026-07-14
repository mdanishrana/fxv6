import React, { useState, useEffect, useMemo } from 'react';
import { User, Tenant, UserRole } from '../types';
import { api } from '../services/api';
import { Users, UserPlus, Trash2, Mail, Shield, CheckCircle, Clock, X, Loader2, Phone, AlertCircle } from 'lucide-react';

interface UsersManagerProps {
    tenant: Tenant;
    currentUserRole: UserRole;
    currentUserId?: string; // If we can pass it, to prevent deleting self
}

const INITIAL_USER = {
    name: '',
    email: '',
    role: 'MANAGER' as UserRole,
    mobile: ''
};

export const UsersManager: React.FC<UsersManagerProps> = ({ tenant, currentUserRole, currentUserId }) => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [newUser, setNewUser] = useState(INITIAL_USER);
    const [isInviting, setIsInviting] = useState(false);
    const [errorPayload, setErrorPayload] = useState<string | null>(null);

    const canManage = currentUserRole === 'OWNER' || currentUserRole === 'SAAS_ADMIN';

    const userLimits: Record<string, number> = { 'BASIC': 2, 'STANDARD': 5, 'PREMIUM': 20 };
    const maxLimit = userLimits[tenant.tier] || 2;
    // Do not count animal owners towards the SaaS seat limit
    const currentCount = users.filter((u: any) => u.role !== 'ANIMAL_OWNER').length;
    const isLimitReached = currentCount >= maxLimit;

    useEffect(() => {
        loadUsers();
    }, [tenant.id]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await api.users.list(tenant.id);
            setUsers(data || []);
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleInviteUser = async () => {
        if (!newUser.name || !newUser.email || !newUser.role) {
            setErrorPayload('Name, email, and role are required.');
            return;
        }

        if (isLimitReached) {
            setErrorPayload(`User limit reached for your ${tenant.tier} plan (${maxLimit} seats). Please upgrade to invite more users.`);
            return;
        }

        setIsInviting(true);
        setErrorPayload(null);
        try {
            await api.users.create(tenant.id, newUser);
            await loadUsers();
            setShowInviteModal(false);
            setNewUser(INITIAL_USER);
            // alert('User invited successfully! They will receive an email shortly.');
        } catch (err: any) {
            console.error('Error inviting user:', err);
            setErrorPayload(err.message || 'Failed to invite user.');
        } finally {
            setIsInviting(false);
        }
    };

    const handleDeleteUser = async (user: any) => {
        if (user.role === 'OWNER') {
            alert('Cannot remove the farm owner.');
            return;
        }
        if (user.id === currentUserId) {
            alert('You cannot remove yourself.');
            return;
        }

        if (!confirm(`Are you sure you want to remove ${user.name} from your farm? They will instantly lose access.`)) {
            return;
        }

        try {
            await api.users.delete(tenant.id, user.id);
            await loadUsers();
        } catch (err: any) {
            console.error('Error deleting user:', err);
            alert(err.message || 'Failed to remove user');
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'OWNER': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
            case 'MANAGER': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
            case 'LABOR': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
            case 'READ_ONLY': return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
            default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="animate-spin text-emerald-600" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                        Team & Users
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Manage farm staff and roles across your account</p>
                </div>

                {canManage && (
                    <button
                        onClick={() => {
                            setErrorPayload(null);
                            setShowInviteModal(true);
                        }}
                        disabled={isLimitReached}
                        className={`px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all font-medium ${isLimitReached
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-700'
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-500/25 active:scale-95'
                            }`}
                    >
                        <UserPlus size={18} /> Invite Team Member
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm relative overflow-hidden flex items-center gap-5">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-xl text-emerald-600 dark:text-blue-400 relative z-10 shrink-0">
                        <Users size={28} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Team</p>
                        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{currentCount}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm relative overflow-hidden flex items-center gap-5">
                    <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-10 -mt-10 ${isLimitReached ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}></div>
                    <div className={`p-4 rounded-xl relative z-10 shrink-0 ${isLimitReached ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                        <Shield size={28} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Seat Capacity limit</p>
                        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                            {currentCount} <span className="text-slate-400 text-lg font-normal">/ {maxLimit} Seats ({tenant.tier})</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="text-left py-4 px-6 text-sm font-bold text-slate-600 dark:text-slate-300">Name</th>
                                <th className="text-left py-4 px-6 text-sm font-bold text-slate-600 dark:text-slate-300">Role</th>
                                <th className="text-left py-4 px-6 text-sm font-bold text-slate-600 dark:text-slate-300">Contact</th>
                                <th className="text-left py-4 px-6 text-sm font-bold text-slate-600 dark:text-slate-300">Status</th>
                                {canManage && <th className="text-center py-4 px-6 text-sm font-bold text-slate-600 dark:text-slate-300">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-white dark:hover:bg-slate-700/30 transition-colors group">
                                    <td className="py-4 px-6 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                        {user.name}
                                    </td>
                                    <td className="py-4 px-6 text-sm">
                                        <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-bold border ${getRoleBadgeColor(user.role)}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-300">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2"><Mail size={14} className="text-slate-400" /> {user.email}</div>
                                            {user.mobile && <div className="flex items-center gap-2"><Phone size={14} className="text-slate-400" /> {user.mobile}</div>}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-sm">
                                        {user.is_verified ? (
                                            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                                <CheckCircle size={16} /> Active
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
                                                <Clock size={16} /> Invite Sent
                                            </span>
                                        )}
                                    </td>
                                    {canManage && (
                                        <td className="py-4 px-6 text-center">
                                            {user.role !== 'OWNER' && user.id !== currentUserId && (
                                                <button
                                                    onClick={() => handleDeleteUser(user)}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                    title="Remove User"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={canManage ? 5 : 4} className="px-6 py-12 text-center text-slate-500">
                                        <Users size={48} className="mx-auto mb-3 opacity-30 cursor-pointer" />
                                        <p>No team members found</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showInviteModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden text-left">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Invite Team Member</h3>
                                <p className="text-slate-500 text-sm mt-0.5">They will receive an email invitation to join.</p>
                            </div>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 disabled:opacity-50"
                                disabled={isInviting}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {errorPayload && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-3 rounded-xl flex gap-3 text-red-600 dark:text-red-400 items-start">
                                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                    <p className="text-sm text-left">{errorPayload}</p>
                                </div>
                            )}

                            <div className="space-y-1.5 text-left">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Full Name *</label>
                                <input
                                    type="text"
                                    value={newUser.name}
                                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                                    placeholder="e.g. John Doe"
                                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                    disabled={isInviting}
                                />
                            </div>

                            <div className="space-y-1.5 text-left">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email Address *</label>
                                <input
                                    type="email"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    placeholder="name@example.com"
                                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                    disabled={isInviting}
                                />
                            </div>

                            <div className="space-y-1.5 text-left">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Mobile Unit (Optional)</label>
                                <input
                                    type="text"
                                    value={newUser.mobile}
                                    onChange={(e) => setNewUser({ ...newUser, mobile: e.target.value })}
                                    placeholder="03XX-XXXXXXX"
                                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                    disabled={isInviting}
                                />
                            </div>

                            <div className="space-y-1.5 text-left">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Role Permission *</label>
                                <select
                                    value={newUser.role}
                                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                    disabled={isInviting}
                                >
                                    <option value="MANAGER">Manager (Full Edit Access)</option>
                                    <option value="LABOR">Labor (Limited View/Edit)</option>
                                    <option value="READ_ONLY">Read Only (View Data Only)</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex justify-end gap-3">
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                                disabled={isInviting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleInviteUser}
                                disabled={isInviting}
                                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-75 disabled:scale-100"
                            >
                                {isInviting ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />}
                                Send Invite
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
