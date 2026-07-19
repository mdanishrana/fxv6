
import React, { useState, useEffect } from 'react';
import { Tenant, FeatureModule, User, SubscriptionPlan, PlanFeature, TenantSubscription, SubscriptionInvoice, SubscriptionDashboard, PaymentRecord, SystemContent } from '../types';
import { ShieldCheck, Search, Plus, Building2, Users, Power, Loader2, X, Settings, UserPlus, Trash2, Check, CreditCard, Edit2, DollarSign, Mail, FileText, TrendingUp, AlertTriangle, Calendar, Receipt, Eye, Bell } from 'lucide-react';
import { api } from '../services/api';
import { usePushNotifications } from '../src/hooks/usePushNotifications';

interface SaaSAdminProps {
    tenants: Tenant[];
    setTenants: React.Dispatch<React.SetStateAction<Tenant[]>>;
    onLoginAsTenant: (tenant: Tenant) => void;
}

type AdminTab = 'farms' | 'registrations' | 'plans' | 'subscriptions' | 'content' | 'notifications';

// Crude but readable browser/OS summary from a raw user-agent string - the full
// UA is shown on hover, this just keeps the table scannable.
function summarizeUserAgent(ua?: string | null): string {
    if (!ua) return '-';
    const browser = ua.includes('Edg/') ? 'Edge'
        : ua.includes('OPR/') || ua.includes('Opera') ? 'Opera'
        : ua.includes('Firefox/') ? 'Firefox'
        : ua.includes('Chrome/') ? 'Chrome'
        : ua.includes('Safari/') ? 'Safari'
        : 'Other';
    const os = ua.includes('Windows') ? 'Windows'
        : ua.includes('Android') ? 'Android'
        : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
        : ua.includes('Mac OS') ? 'macOS'
        : ua.includes('Linux') ? 'Linux'
        : 'Unknown OS';
    return `${browser} / ${os}`;
}

export const SaaSAdmin: React.FC<SaaSAdminProps> = ({ tenants, setTenants, onLoginAsTenant }) => {
    const [activeTab, setActiveTab] = useState<AdminTab>('farms');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [showModuleModal, setShowModuleModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
    const [tenantUsers, setTenantUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    const [newUser, setNewUser] = useState({ name: '', email: '', role: 'LABOR' as 'OWNER' | 'MANAGER' | 'LABOR' });

    const [subscriptions, setSubscriptions] = useState<TenantSubscription[]>([]);
    const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
    const [subDashboard, setSubDashboard] = useState<SubscriptionDashboard | null>(null);
    const [loadingSubs, setLoadingSubs] = useState(false);
    const [showSubModal, setShowSubModal] = useState(false);
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [subTab, setSubTab] = useState<'overview' | 'subscriptions' | 'invoices' | 'farm-payments'>('overview');
    const [selectedSubTenant, setSelectedSubTenant] = useState<string>('');
    const [farmPayments, setFarmPayments] = useState<PaymentRecord[]>([]);
    const [loadingFarmPayments, setLoadingFarmPayments] = useState(false);
    const [newSubForm, setNewSubForm] = useState({
        tenantId: '',
        planId: '',
        billingCycle: 'MONTHLY' as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
        amount: '',
        trialDays: ''
    });

    const [newTenant, setNewTenant] = useState<Partial<Tenant>>({
        name: '',
        ownerName: '',
        ownerEmail: '',
        tier: 'BASIC',
        modules: ['CORE', 'QURBANI_TRACKING'],
        status: 'ACTIVE'
    });

    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loadingPlans, setLoadingPlans] = useState(false);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
    const [planForm, setPlanForm] = useState({
        name: '',
        code: '',
        pricePkr: '' as string | number,
        isCustom: false,
        contactEmail: '',
        isPopular: false,
        userLimit: '' as string | number,
        cattleLimit: ''
    });
    const [newFeature, setNewFeature] = useState('');

    // Delete confirmation modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
    const [deleteConfirmName, setDeleteConfirmName] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [content, setContent] = useState<SystemContent | null>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [savingContent, setSavingContent] = useState(false);

    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastBody, setBroadcastBody] = useState('');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);

    const { isSubscribed, subscribeToPush, loading: loadingPush, error: pushError } = usePushNotifications();

    const sendBroadcast = async () => {
        if (!broadcastTitle || !broadcastBody) return;
        setSendingBroadcast(true);
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch('/api/notifications/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title: broadcastTitle, body: broadcastBody })
            });
            if (res.ok) {
                alert('Broadcast sent successfully!');
                setBroadcastTitle('');
                setBroadcastBody('');
            } else {
                alert('Failed to send broadcast');
            }
        } catch (err) {
            console.error(err);
            alert('Failed to send broadcast');
        } finally {
            setSendingBroadcast(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'plans') {
            loadPlans();
        }
        if (activeTab === 'subscriptions') {
            loadSubscriptionData();
        }
        if (activeTab === 'content') {
            loadContent();
        }
    }, [activeTab]);

    const loadSubscriptionData = async () => {
        setLoadingSubs(true);
        try {
            const token = localStorage.getItem('farmxpert_token');
            const headers = { 'Authorization': `Bearer ${token}` };

            const [dashRes, subsRes, invRes] = await Promise.all([
                fetch('/api/subscriptions/dashboard', { headers }),
                fetch('/api/subscriptions', { headers }),
                fetch('/api/subscriptions/invoices', { headers })
            ]);

            if (dashRes.ok) setSubDashboard(await dashRes.json());
            if (subsRes.ok) setSubscriptions(await subsRes.json());
            if (invRes.ok) setInvoices(await invRes.json());
        } catch (err) {
            console.error('Failed to load subscription data:', err);
        } finally {
            setLoadingSubs(false);
        }
    };

    const loadFarmPayments = async (tenantId: string) => {
        setLoadingFarmPayments(true);
        setSelectedSubTenant(tenantId);
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(`/api/subscriptions/farm-payments/${tenantId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setFarmPayments(await res.json());
        } catch (err) {
            console.error('Failed to load farm payments:', err);
        } finally {
            setLoadingFarmPayments(false);
        }
    };

    const handleCreateSubscription = async () => {
        if (!newSubForm.tenantId || !newSubForm.amount) {
            alert('Tenant and amount are required');
            return;
        }
        setIsSaving(true);
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch('/api/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    tenantId: newSubForm.tenantId,
                    planId: newSubForm.planId ? parseInt(newSubForm.planId) : null,
                    billingCycle: newSubForm.billingCycle,
                    amount: parseFloat(newSubForm.amount),
                    trialDays: newSubForm.trialDays ? parseInt(newSubForm.trialDays) : 0
                })
            });
            if (res.ok) {
                await loadSubscriptionData();
                setShowSubModal(false);
                setNewSubForm({ tenantId: '', planId: '', billingCycle: 'MONTHLY', amount: '', trialDays: '' });
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to create subscription');
            }
        } catch (err) {
            alert('Failed to create subscription');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateInvoice = async (invoiceId: string, status: string, paymentMethod?: string) => {
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(`/api/subscriptions/invoices/${invoiceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    status,
                    paidDate: status === 'PAID' ? new Date().toISOString().split('T')[0] : null,
                    paymentMethod
                })
            });
            if (res.ok) await loadSubscriptionData();
        } catch (err) {
            alert('Failed to update invoice');
        }
    };

    const handleGenerateInvoices = async () => {
        if (!confirm('Generate invoices for all subscriptions due today?')) return;
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch('/api/subscriptions/generate-invoices', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                alert(data.message);
                await loadSubscriptionData();
            }
        } catch (err) {
            alert('Failed to generate invoices');
        }
    };

    const handleCheckOverdue = async () => {
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch('/api/subscriptions/check-overdue', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Marked ${data.overdueInvoices} invoices as overdue, ${data.pastDueSubscriptions} subscriptions as past due`);
                await loadSubscriptionData();
            }
        } catch (err) {
            alert('Failed to check overdue');
        }
    };

    const loadContent = async () => {
        setLoadingContent(true);
        try {
            const data = await api.content.get('landing_page');
            setContent(data);
        } catch (err) {
            console.error('Failed to load content:', err);
        } finally {
            setLoadingContent(false);
        }
    };

    const handleSaveContent = async () => {
        if (!content) return;
        setSavingContent(true);
        try {
            await api.content.update('landing_page', content);
            alert('Content updated successfully!');
        } catch (err) {
            alert('Failed to update content');
        } finally {
            setSavingContent(false);
        }
    };

    const loadPlans = async () => {
        setLoadingPlans(true);
        try {
            const data = await api.plans.list();
            setPlans(data);
        } catch (err) {
            console.error('Failed to load plans:', err);
        } finally {
            setLoadingPlans(false);
        }
    };

    const filteredTenants = tenants.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getAuthHeaders = () => {
        const token = localStorage.getItem('farmxpert_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    const handleStatusToggle = async (tenant: Tenant) => {
        const newStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        try {
            const res = await fetch(`/api/tenants/${tenant.id}/status`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, status: newStatus } : t));
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to update status');
            }
        } catch (err) {
            alert('Failed to update status');
        }
    };

    const handleDeleteTenant = (tenant: Tenant) => {
        setTenantToDelete(tenant);
        setDeleteConfirmName('');
        setDeleteError(null);
        setShowDeleteModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!tenantToDelete) return;
        if (deleteConfirmName !== tenantToDelete.name) {
            setDeleteError(`Farm name does not match. Please type exactly: "${tenantToDelete.name}"`);
            return;
        }
        setIsDeleting(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/tenants/${tenantToDelete.id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setTenants(prev => prev.filter(t => t.id !== tenantToDelete.id));
                setShowDeleteModal(false);
                setTenantToDelete(null);
            } else {
                const data = await res.json();
                setDeleteError(data.error || 'Failed to delete farm. Please try again.');
            }
        } catch (err) {
            setDeleteError('An error occurred. Please check server logs.');
            console.error(err);
        } finally {
            setIsDeleting(false);
        }
    };
    const openEditTierModal = (tenant: Tenant) => {
        setSelectedTenant(tenant);
        setNewTenant({ ...newTenant, tier: tenant.tier }); // Reuse `newTenant.tier` state for simplicity, or create a specific `editingTier` state
        setShowModuleModal(true); // We can repurpose this modal boolean state to save renaming everything
    };

    const handleSaveTier = async () => {
        if (!selectedTenant) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/tenants/${selectedTenant.id}/tier`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ tier: newTenant.tier })
            });
            if (res.ok) {
                const updatedTenant = await res.json();
                setTenants(prev => prev.map(t =>
                    t.id === selectedTenant.id ? { ...t, tier: updatedTenant.tier, modules: updatedTenant.modules } : t
                ));
                setShowModuleModal(false);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to save tier');
            }
        } catch (err) {
            alert('Failed to save tier');
        } finally {
            setIsSaving(false);
        }
    };

    const openUserModal = async (tenant: Tenant) => {
        setSelectedTenant(tenant);
        setLoadingUsers(true);
        setShowUserModal(true);
        try {
            const res = await fetch(`/api/tenants/${tenant.id}/users`, {
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const users = await res.json();
                setTenantUsers(users);
            }
        } catch (err) {
            console.error('Failed to load users');
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleAddUser = async () => {
        if (!selectedTenant || !newUser.name || !newUser.email) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/tenants/${selectedTenant.id}/users`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newUser)
            });
            if (res.ok) {
                const user = await res.json();
                setTenantUsers(prev => [...prev, user]);
                setNewUser({ name: '', email: '', role: 'LABOR' });
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to add user');
            }
        } catch (err) {
            alert('Failed to add user');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveUser = async (userId: string) => {
        if (!selectedTenant || !confirm('Remove this user?')) return;
        try {
            const res = await fetch(`/api/tenants/${selectedTenant.id}/users/${userId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setTenantUsers(prev => prev.filter(u => u.id !== userId));
            } else {
                alert('Failed to remove user');
            }
        } catch (err) {
            alert('Failed to remove user');
        }
    };

    const handleCreateTenant = async () => {
        if (!newTenant.name || !newTenant.ownerEmail) return;

        setIsSaving(true);
        setSaveError(null);

        try {
            const res = await fetch('/api/tenants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newTenant.name,
                    ownerName: newTenant.ownerName || newTenant.name,
                    ownerEmail: newTenant.ownerEmail,
                    tier: newTenant.tier,
                    modules: newTenant.modules
                })
            });

            if (res.ok) {
                const result = await res.json();
                const created: Tenant = {
                    id: result.id,
                    name: result.name || newTenant.name!,
                    ownerName: result.owner_name || newTenant.ownerName!,
                    ownerEmail: result.owner_email || newTenant.ownerEmail!,
                    tier: result.tier || newTenant.tier as any,
                    modules: result.modules || newTenant.modules as any,
                    locale: result.locale || 'en-PK',
                    currency: result.currency || 'PKR',
                    status: result.status || 'ACTIVE',
                    joinedDate: result.created_at || new Date().toISOString().split('T')[0],
                    users: []
                };

                setTenants([created, ...tenants]);
                setShowAddModal(false);
                setNewTenant({
                    name: '',
                    ownerName: '',
                    ownerEmail: '',
                    tier: 'BASIC',
                    modules: ['CORE', 'QURBANI_TRACKING'],
                    status: 'ACTIVE'
                });
            } else {
                const data = await res.json();
                setSaveError(data.error || 'Failed to create farm');
            }
        } catch (err: any) {
            console.error("Failed to create tenant:", err);
            setSaveError(err.message || "Failed to save. Please check your connection.");
        } finally {
            setIsSaving(false);
        }
    };

    const openEditPlan = (plan: SubscriptionPlan) => {
        setEditingPlan(plan);
        setPlanForm({
            name: plan.name,
            code: plan.code,
            pricePkr: plan.pricePkr ?? '',
            isCustom: plan.isCustom,
            contactEmail: plan.contactEmail || '',
            isPopular: plan.isPopular,
            userLimit: plan.userLimit ?? '',
            cattleLimit: plan.cattleLimit || ''
        });
        setShowPlanModal(true);
    };

    const openAddPlan = () => {
        setEditingPlan(null);
        setPlanForm({
            name: '',
            code: '',
            pricePkr: '',
            isCustom: false,
            contactEmail: '',
            isPopular: false,
            userLimit: '',
            cattleLimit: ''
        });
        setShowPlanModal(true);
    };

    const handleSavePlan = async () => {
        if (!planForm.name || !planForm.code) {
            alert('Plan name and code are required');
            return;
        }

        setIsSaving(true);
        try {
            const data = {
                name: planForm.name,
                code: planForm.code.toUpperCase(),
                pricePkr: planForm.pricePkr === '' ? null : Number(planForm.pricePkr),
                isCustom: planForm.isCustom,
                contactEmail: planForm.contactEmail || null,
                isPopular: planForm.isPopular,
                userLimit: planForm.userLimit === '' ? null : Number(planForm.userLimit),
                cattleLimit: planForm.cattleLimit || 'Unlimited'
            };

            if (editingPlan) {
                await api.plans.update(editingPlan.id, data);
            } else {
                await api.plans.create(data);
            }

            await loadPlans();
            setShowPlanModal(false);
        } catch (err: any) {
            alert(err.message || 'Failed to save plan');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePlan = async (planId: number) => {
        if (!confirm('Are you sure you want to delete this plan? This cannot be undone.')) return;

        try {
            await api.plans.delete(planId);
            await loadPlans();
        } catch (err: any) {
            alert(err.message || 'Failed to delete plan');
        }
    };

    const handleAddFeature = async (planId: number) => {
        if (!newFeature.trim()) return;

        try {
            await api.plans.addFeature(planId, newFeature.trim());
            setNewFeature('');
            await loadPlans();
        } catch (err: any) {
            alert(err.message || 'Failed to add feature');
        }
    };

    const handleDeleteFeature = async (planId: number, featureId: number) => {
        try {
            await api.plans.deleteFeature(planId, featureId);
            await loadPlans();
        } catch (err: any) {
            alert(err.message || 'Failed to delete feature');
        }
    };

    const calculateMRR = () => {
        return tenants.reduce((acc, t) => {
            const plan = plans.find(p => p.code === t.tier);
            return acc + Number(plan?.pricePkr || 0);
        }, 0);
    };

    return (
        <div className="space-y-4 md:space-y-6 animate-fade-in px-2 md:px-0">
            <div className="bg-slate-900 text-white p-4 md:p-8 rounded-xl md:rounded-2xl shadow-xl">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                    <div>
                        <h2 className="text-xl md:text-3xl font-bold flex items-center gap-2 md:gap-3">
                            <ShieldCheck className="text-emerald-400" size={24} />
                            <span className="hidden sm:inline">FarmXpert Admin Console</span>
                            <span className="sm:hidden">Admin Console</span>
                        </h2>
                        <p className="text-slate-400 mt-1 md:mt-2 text-sm md:text-base">Global SaaS Management</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="text-center md:text-right">
                            <p className="text-xl md:text-2xl font-bold">{tenants.length}</p>
                            <p className="text-[10px] md:text-xs text-slate-400 uppercase">Farms</p>
                        </div>
                        <div className="text-center md:text-right border-l border-slate-700 pl-4">
                            <p className="text-xl md:text-2xl font-bold text-emerald-400">
                                Rs. {(plans.length > 0 ? calculateMRR() : tenants.reduce((acc, t) => acc + Number(t.tier === 'PREMIUM' ? 5000 : t.tier === 'STANDARD' ? 3000 : 1000), 0)).toLocaleString()}
                            </p>
                            <p className="text-[10px] md:text-xs text-slate-400 uppercase">MRR</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('farms')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'farms'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Building2 size={16} className="inline mr-2" />
                    Farms
                </button>
                <button
                    onClick={() => setActiveTab('registrations')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'registrations'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Eye size={16} className="inline mr-2" />
                    Registrations
                </button>
                <button
                    onClick={() => setActiveTab('plans')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'plans'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <CreditCard size={16} className="inline mr-2" />
                    Plans
                </button>
                <button
                    onClick={() => setActiveTab('subscriptions')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'subscriptions'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Receipt size={16} className="inline mr-2" />
                    Billing & Payments
                </button>
                <button
                    onClick={() => setActiveTab('content')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'content'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <FileText size={16} className="inline mr-2" />
                    Content
                </button>
                <button
                    onClick={() => setActiveTab('notifications')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'notifications'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Bell size={16} className="inline mr-2" />
                    Notifications
                </button>
            </div>

            {activeTab === 'farms' && (
                <>
                    <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
                        <div className="relative w-full sm:w-72 md:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search farms..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-800 outline-none text-sm"
                            />
                        </div>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 md:px-6 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 text-sm md:text-base"
                        >
                            <Plus size={18} /> <span className="hidden sm:inline">Onboard New</span> Farm
                        </button>
                    </div>

                    <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-white border-b border-slate-200 text-slate-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-6 py-4">Farm Identity</th>
                                    <th className="px-6 py-4">Subscription</th>
                                    <th className="px-6 py-4">Features</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Controls</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTenants.map(tenant => (
                                    <tr key={tenant.id} className="hover:bg-white transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                                                    <Building2 size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800">{tenant.name}</p>
                                                    <p className="text-xs text-slate-500">Owner: {tenant.ownerName}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase border
                                                ${tenant.tier === 'PREMIUM' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                    tenant.tier === 'STANDARD' ? 'bg-emerald-50 text-blue-700 border-blue-100' :
                                                        'bg-white text-slate-600 border-slate-200'}`}>
                                                {tenant.tier}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs text-slate-500">
                                                {tenant.tier === 'PREMIUM' ? 'All 8 Modules' :
                                                    tenant.tier === 'STANDARD' ? 'Core, Qurbani, Feed, AI' :
                                                        'Core & Qurbani Only'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={`flex items-center gap-2 text-sm font-medium ${tenant.status === 'ACTIVE' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                <div className={`w-2 h-2 rounded-full ${tenant.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                {tenant.status}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => onLoginAsTenant(tenant)}
                                                    className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    Access
                                                </button>
                                                <button
                                                    onClick={() => openEditTierModal(tenant)}
                                                    className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors"
                                                    title="Change Package"
                                                >
                                                    <Settings size={16} />
                                                </button>
                                                <button
                                                    onClick={() => openUserModal(tenant)}
                                                    className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors"
                                                    title="Manage Users"
                                                >
                                                    <Users size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleStatusToggle(tenant)}
                                                    className={`p-1.5 rounded-lg transition-colors ${tenant.status === 'ACTIVE' ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                                                    title={tenant.status === 'ACTIVE' ? 'Block Farm' : 'Allow Farm'}
                                                >
                                                    <Power size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTenant(tenant)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-1"
                                                    title="Permanently Delete Farm"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="md:hidden space-y-3">
                        {filteredTenants.map(tenant => (
                            <div key={tenant.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                                            <Building2 size={18} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">{tenant.name}</p>
                                            <p className="text-xs text-slate-500">{tenant.ownerName}</p>
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-1 text-xs font-medium ${tenant.status === 'ACTIVE' ? 'text-emerald-600' : 'text-red-500'}`}>
                                        <div className={`w-2 h-2 rounded-full ${tenant.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                        {tenant.status}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase
                                        ${tenant.tier === 'PREMIUM' ? 'bg-purple-50 text-purple-700' :
                                            tenant.tier === 'STANDARD' ? 'bg-emerald-50 text-blue-700' :
                                                'bg-white text-slate-600'}`}>
                                        {tenant.tier}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                        {tenant.tier === 'PREMIUM' ? 'All Features Included' :
                                            tenant.tier === 'STANDARD' ? 'Standard Package' :
                                                'Basic Core Package'}
                                    </span>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onLoginAsTenant(tenant)}
                                        className="flex-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg"
                                    >
                                        Access
                                    </button>
                                    <button
                                        onClick={() => openEditTierModal(tenant)}
                                        className="p-2 rounded-lg text-emerald-500 bg-emerald-50"
                                    >
                                        <Settings size={16} />
                                    </button>
                                    <button
                                        onClick={() => openUserModal(tenant)}
                                        className="p-2 rounded-lg text-emerald-500 bg-emerald-50"
                                    >
                                        <Users size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleStatusToggle(tenant)}
                                        className={`p-2 rounded-lg ${tenant.status === 'ACTIVE' ? 'text-red-500 bg-red-50' : 'text-emerald-500 bg-emerald-50'}`}
                                    >
                                        <Power size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTenant(tenant)}
                                        className="p-2 rounded-lg bg-white text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {activeTab === 'registrations' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
                        <div className="relative w-full sm:w-72 md:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search by farm, owner, email, IP..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-800 outline-none text-sm"
                            />
                        </div>
                        <p className="text-sm text-slate-500">{tenants.length} farm(s) registered</p>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                    <th className="px-4 py-3">Registered</th>
                                    <th className="px-4 py-3">Farm</th>
                                    <th className="px-4 py-3">Owner</th>
                                    <th className="px-4 py-3">Email</th>
                                    <th className="px-4 py-3">Mobile</th>
                                    <th className="px-4 py-3">Tier</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">IP Address</th>
                                    <th className="px-4 py-3">Device</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...tenants]
                                    .sort((a, b) => new Date(b.createdAt || b.joinedDate || 0).getTime() - new Date(a.createdAt || a.joinedDate || 0).getTime())
                                    .filter(t => {
                                        const q = searchTerm.toLowerCase();
                                        if (!q) return true;
                                        return [t.name, t.ownerName, t.ownerEmail, t.registrationIp]
                                            .some(v => v && v.toLowerCase().includes(q));
                                    })
                                    .map(t => {
                                        const reg = t.createdAt || t.joinedDate;
                                        return (
                                            <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                                                    {reg ? new Date(reg).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{t.name}</td>
                                                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{t.ownerName || '-'}</td>
                                                <td className="px-4 py-3 text-slate-600">{t.ownerEmail || '-'}</td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{(t as any).owner_mobile || (t as any).ownerMobile || '-'}</td>
                                                <td className="px-4 py-3">
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{t.tier}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${t.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{t.status || '-'}</span>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{t.registrationIp || '-'}</td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap" title={t.registrationUserAgent || undefined}>
                                                    {summarizeUserAgent(t.registrationUserAgent)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                        <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
                            IP and device are captured at signup. Farms registered before this feature show "-".
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'plans' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800">Manage Subscription Plans</h3>
                        <button
                            onClick={openAddPlan}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm"
                        >
                            <Plus size={16} /> Add Plan
                        </button>
                    </div>

                    {loadingPlans ? (
                        <div className="text-center py-12">
                            <Loader2 className="animate-spin mx-auto text-slate-400" size={32} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {plans.map(plan => (
                                <div key={plan.id} className={`bg-white rounded-xl shadow-sm border-2 p-5 relative ${plan.isPopular ? 'border-emerald-500' : 'border-slate-200'}`}>
                                    {plan.isPopular && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                                            MOST POPULAR
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-lg">{plan.name}</h4>
                                            <p className="text-xs text-slate-500 uppercase">{plan.code}</p>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => openEditPlan(plan)}
                                                className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeletePlan(plan.id)}
                                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        {plan.isCustom ? (
                                            <div>
                                                <p className="text-lg font-bold text-slate-800">Custom Pricing</p>
                                                <a href={`mailto:${plan.contactEmail}`} className="text-sm text-emerald-600 flex items-center gap-1">
                                                    <Mail size={12} /> {plan.contactEmail}
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-2xl font-bold text-slate-800">Rs. {plan.pricePkr?.toLocaleString()}</span>
                                                <span className="text-slate-500 text-sm">{plan.billingPeriod}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="text-xs text-slate-500 mb-3 flex gap-3">
                                        <span>Users: {plan.userLimit || 'Custom'}</span>
                                        <span>Cattle: {plan.cattleLimit}</span>
                                    </div>

                                    <div className="border-t border-slate-100 pt-3">
                                        <p className="text-xs font-bold text-slate-600 mb-2 uppercase">Features</p>
                                        <ul className="space-y-1.5 mb-3">
                                            {plan.features.map(feature => (
                                                <li key={feature.id} className="flex justify-between items-center text-sm text-slate-700">
                                                    <span className="flex items-center gap-2">
                                                        <Check size={12} className="text-emerald-500" />
                                                        {feature.text}
                                                    </span>
                                                    <button
                                                        onClick={() => handleDeleteFeature(plan.id, feature.id)}
                                                        className="p-0.5 text-red-400 hover:text-red-600"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Add feature..."
                                                value={newFeature}
                                                onChange={e => setNewFeature(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddFeature(plan.id)}
                                                className="flex-1 text-xs border border-slate-200 rounded px-2 py-1"
                                            />
                                            <button
                                                onClick={() => handleAddFeature(plan.id)}
                                                className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Custom Delete Confirmation Modal */}
            {showDeleteModal && tenantToDelete && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-5 border-b border-red-100 bg-red-50 flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                                <Trash2 size={20} className="text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-red-800">Delete Farm Permanently</h3>
                                <p className="text-xs text-red-600">This action cannot be undone</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-slate-700">
                                You are about to permanently delete <strong>{tenantToDelete.name}</strong>. All cattle records, users, payments, and history will be erased.
                            </p>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    Type <span className="font-bold text-red-600">{tenantToDelete.name}</span> to confirm:
                                </label>
                                <input
                                    type="text"
                                    value={deleteConfirmName}
                                    onChange={e => { setDeleteConfirmName(e.target.value); setDeleteError(null); }}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                                    placeholder={tenantToDelete.name}
                                    autoFocus
                                />
                            </div>
                            {deleteError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{deleteError}</div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => { setShowDeleteModal(false); setTenantToDelete(null); }}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm"
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={isDeleting || deleteConfirmName !== tenantToDelete.name}
                                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-40 flex items-center gap-2 text-sm"
                            >
                                {isDeleting && <Loader2 className="animate-spin" size={16} />}
                                Delete Farm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showModuleModal && selectedTenant && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-4 md:p-6 border-b border-slate-100 bg-white flex justify-between items-center">
                            <div>
                                <h3 className="text-lg md:text-xl font-bold text-slate-800">Change Package</h3>
                                <p className="text-xs md:text-sm text-slate-500">{selectedTenant.name}</p>
                            </div>
                            <button onClick={() => setShowModuleModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 md:p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Subscription Tier</label>
                                <select 
                                    value={newTenant.tier} 
                                    onChange={e => setNewTenant({ ...newTenant, tier: e.target.value as any })} 
                                    className="w-full border border-slate-300 rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                >
                                    <option value="FREE">Free (All 8 Features · Max 5 Animals)</option>
                                    <option value="BASIC">Basic (Core & Qurbani Only)</option>
                                    <option value="STANDARD">Standard (+Feed & AI)</option>
                                    <option value="PREMIUM">Premium (All 8 Features)</option>
                                </select>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <p className="text-xs text-slate-600">
                                    Changing the tier will automatically assign the correct feature modules to this farm. The owner may need to refresh their page to see the new features.
                                </p>
                            </div>
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowModuleModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">Cancel</button>
                            <button onClick={handleSaveTier} disabled={isSaving} className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50 flex items-center gap-2 text-sm">
                                {isSaving && <Loader2 className="animate-spin" size={16} />}
                                Save Package
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showUserModal && selectedTenant && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-4 md:p-6 border-b border-slate-100 bg-white flex justify-between items-center">
                            <div>
                                <h3 className="text-lg md:text-xl font-bold text-slate-800">Manage Users</h3>
                                <p className="text-xs md:text-sm text-slate-500">{selectedTenant.name}</p>
                            </div>
                            <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 md:p-6 space-y-4 max-h-[50vh] overflow-y-auto">
                            {loadingUsers ? (
                                <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" size={24} /></div>
                            ) : tenantUsers.length === 0 ? (
                                <p className="text-center text-slate-500 py-4 text-sm">No users found</p>
                            ) : (
                                <div className="space-y-2">
                                    {tenantUsers.map(user => (
                                        <div key={user.id} className="flex justify-between items-center p-3 bg-white rounded-lg">
                                            <div>
                                                <p className="font-medium text-slate-800 text-sm">{user.name}</p>
                                                <p className="text-xs text-slate-500">{user.email}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase
                                                    ${user.role === 'OWNER' ? 'bg-purple-100 text-purple-700' :
                                                        user.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-slate-100 text-slate-600'}`}>
                                                    {user.role}
                                                </span>
                                                <button
                                                    onClick={() => handleRemoveUser(user.id)}
                                                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 md:p-6 border-t border-slate-100 bg-white">
                            <p className="font-medium text-slate-700 mb-3 text-sm">Add New User</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                                <input
                                    type="text"
                                    placeholder="Name"
                                    value={newUser.name}
                                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                />
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={newUser.email}
                                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                />
                                <select
                                    value={newUser.role}
                                    onChange={e => setNewUser({ ...newUser, role: e.target.value as any })}
                                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                >
                                    <option value="OWNER">Owner</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="LABOR">Labor</option>
                                </select>
                            </div>
                            <button
                                onClick={handleAddUser}
                                disabled={isSaving || !newUser.name || !newUser.email}
                                className="w-full bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                            >
                                {isSaving && <Loader2 className="animate-spin" size={16} />}
                                <UserPlus size={16} /> Add User
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPlanModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-4 md:p-6 border-b border-slate-100 bg-white flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">
                                {editingPlan ? 'Edit Plan' : 'Add New Plan'}
                            </h3>
                            <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 md:p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name</label>
                                    <input
                                        type="text"
                                        value={planForm.name}
                                        onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="e.g. Premium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Code</label>
                                    <input
                                        type="text"
                                        value={planForm.code}
                                        onChange={e => setPlanForm({ ...planForm, code: e.target.value.toUpperCase() })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm uppercase"
                                        placeholder="e.g. PREMIUM"
                                        disabled={!!editingPlan}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={planForm.isCustom}
                                        onChange={e => setPlanForm({ ...planForm, isCustom: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300"
                                    />
                                    <span className="text-sm text-slate-700">Custom Plan (Contact Sales)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={planForm.isPopular}
                                        onChange={e => setPlanForm({ ...planForm, isPopular: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300"
                                    />
                                    <span className="text-sm text-slate-700">Most Popular</span>
                                </label>
                            </div>

                            {planForm.isCustom ? (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                                    <input
                                        type="email"
                                        value={planForm.contactEmail}
                                        onChange={e => setPlanForm({ ...planForm, contactEmail: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Sales@farmxpert.pk"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Price (PKR/month)</label>
                                    <div className="relative">
                                        <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="number"
                                            value={planForm.pricePkr}
                                            onChange={e => setPlanForm({ ...planForm, pricePkr: e.target.value })}
                                            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm"
                                            placeholder="5000"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">User Limit</label>
                                    <input
                                        type="number"
                                        value={planForm.userLimit}
                                        onChange={e => setPlanForm({ ...planForm, userLimit: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Cattle Limit</label>
                                    <input
                                        type="text"
                                        value={planForm.cattleLimit}
                                        onChange={e => setPlanForm({ ...planForm, cattleLimit: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Unlimited"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowPlanModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePlan}
                                disabled={isSaving}
                                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50 flex items-center gap-2 text-sm"
                            >
                                {isSaving && <Loader2 className="animate-spin" size={16} />}
                                {editingPlan ? 'Update Plan' : 'Create Plan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'subscriptions' && (
                <div className="space-y-6">
                    {loadingSubs ? (
                        <div className="text-center py-12"><Loader2 className="animate-spin mx-auto" size={32} /></div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-100 rounded-lg"><TrendingUp className="text-emerald-600" size={20} /></div>
                                        <div>
                                            <p className="text-2xl font-bold text-slate-800">Rs. {(subDashboard?.mrr || 0).toLocaleString()}</p>
                                            <p className="text-xs text-slate-500 uppercase">Monthly Recurring</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-100 rounded-lg"><Building2 className="text-emerald-600" size={20} /></div>
                                        <div>
                                            <p className="text-2xl font-bold text-slate-800">{subDashboard?.active_subscriptions || 0}</p>
                                            <p className="text-xs text-slate-500 uppercase">Active Subs</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-amber-100 rounded-lg"><AlertTriangle className="text-amber-600" size={20} /></div>
                                        <div>
                                            <p className="text-2xl font-bold text-slate-800">{subDashboard?.overdue_invoices || 0}</p>
                                            <p className="text-xs text-slate-500 uppercase">Overdue</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-100 rounded-lg"><DollarSign className="text-purple-600" size={20} /></div>
                                        <div>
                                            <p className="text-2xl font-bold text-slate-800">Rs. {(subDashboard?.revenueThisMonth || 0).toLocaleString()}</p>
                                            <p className="text-xs text-slate-500 uppercase">This Month</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                                {(['overview', 'subscriptions', 'invoices', 'farm-payments'] as const).map(tab => (
                                    <button key={tab} onClick={() => setSubTab(tab)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${subTab === tab ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                        {tab === 'farm-payments' ? 'Farm Payments' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </button>
                                ))}
                                <div className="flex-1"></div>
                                <button onClick={handleGenerateInvoices} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1">
                                    <FileText size={14} /> Generate Invoices
                                </button>
                                <button onClick={handleCheckOverdue} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1">
                                    <AlertTriangle size={14} /> Check Overdue
                                </button>
                                <button onClick={() => setShowSubModal(true)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1">
                                    <Plus size={14} /> Add Subscription
                                </button>
                            </div>

                            {subTab === 'subscriptions' && (
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white border-b border-slate-200 text-slate-500 uppercase text-xs">
                                            <tr>
                                                <th className="px-4 py-3">Farm</th>
                                                <th className="px-4 py-3">Plan</th>
                                                <th className="px-4 py-3">Amount</th>
                                                <th className="px-4 py-3">Cycle</th>
                                                <th className="px-4 py-3">Status</th>
                                                <th className="px-4 py-3">Next Billing</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {subscriptions.length === 0 ? (
                                                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No subscriptions yet</td></tr>
                                            ) : subscriptions.map(sub => (
                                                <tr key={sub.id} className="hover:bg-white">
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-slate-800">{sub.tenantName}</p>
                                                        <p className="text-xs text-slate-500">{sub.ownerName}</p>
                                                    </td>
                                                    <td className="px-4 py-3">{sub.planName || '-'}</td>
                                                    <td className="px-4 py-3 font-medium">Rs. {sub.amount.toLocaleString()}</td>
                                                    <td className="px-4 py-3"><span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{sub.billingCycle}</span></td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${sub.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                                                            sub.status === 'TRIAL' ? 'bg-blue-100 text-blue-700' :
                                                                sub.status === 'PAST_DUE' ? 'bg-red-100 text-red-700' :
                                                                    'bg-slate-100 text-slate-600'
                                                            }`}>{sub.status}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-600">{sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString() : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {subTab === 'invoices' && (
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white border-b border-slate-200 text-slate-500 uppercase text-xs">
                                            <tr>
                                                <th className="px-4 py-3">Invoice #</th>
                                                <th className="px-4 py-3">Farm</th>
                                                <th className="px-4 py-3">Amount</th>
                                                <th className="px-4 py-3">Due Date</th>
                                                <th className="px-4 py-3">Status</th>
                                                <th className="px-4 py-3">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {invoices.length === 0 ? (
                                                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No invoices yet</td></tr>
                                            ) : invoices.map(inv => (
                                                <tr key={inv.id} className="hover:bg-white">
                                                    <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-slate-800">{inv.tenantName}</p>
                                                    </td>
                                                    <td className="px-4 py-3 font-medium">Rs. {inv.totalAmount.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-slate-600">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                                                            inv.status === 'OVERDUE' ? 'bg-red-100 text-red-700' :
                                                                inv.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                                                    'bg-slate-100 text-slate-600'
                                                            }`}>{inv.status}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {inv.status !== 'PAID' && (
                                                            <button onClick={() => handleUpdateInvoice(inv.id, 'PAID', 'Bank Transfer')}
                                                                className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
                                                                Mark Paid
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {subTab === 'farm-payments' && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <select value={selectedSubTenant} onChange={e => loadFarmPayments(e.target.value)}
                                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[200px]">
                                            <option value="">Select a farm...</option>
                                            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                        {loadingFarmPayments && <Loader2 className="animate-spin" size={20} />}
                                    </div>
                                    {selectedSubTenant && !loadingFarmPayments && (
                                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-white border-b border-slate-200 text-slate-500 uppercase text-xs">
                                                    <tr>
                                                        <th className="px-4 py-3">Animal Tag</th>
                                                        <th className="px-4 py-3">Owner</th>
                                                        <th className="px-4 py-3">Amount</th>
                                                        <th className="px-4 py-3">Due Date</th>
                                                        <th className="px-4 py-3">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {farmPayments.length === 0 ? (
                                                        <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No payments for this farm</td></tr>
                                                    ) : farmPayments.map(p => (
                                                        <tr key={p.id} className="hover:bg-white">
                                                            <td className="px-4 py-3 font-medium">{p.cattleTag}</td>
                                                            <td className="px-4 py-3">{p.ownerName}</td>
                                                            <td className="px-4 py-3 font-medium">Rs. {p.amount.toLocaleString()}</td>
                                                            <td className="px-4 py-3">{new Date(p.dueDate).toLocaleDateString()}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${(p.status as string) === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                                                    (p.status as string) === 'Overdue' ? 'bg-red-100 text-red-700' :
                                                                        'bg-amber-100 text-amber-700'
                                                                    }`}>{p.status}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {subTab === 'overview' && (
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                                        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><TrendingUp size={18} /> Subscription Summary</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between"><span className="text-slate-600">Active</span><span className="font-medium">{subDashboard?.active_subscriptions || 0}</span></div>
                                            <div className="flex justify-between"><span className="text-slate-600">Trial</span><span className="font-medium">{subDashboard?.trial_subscriptions || 0}</span></div>
                                            <div className="flex justify-between"><span className="text-slate-600">Past Due</span><span className="font-medium text-red-600">{subDashboard?.past_due_subscriptions || 0}</span></div>
                                            <div className="flex justify-between"><span className="text-slate-600">Cancelled</span><span className="font-medium">{subDashboard?.cancelled_subscriptions || 0}</span></div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                                        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileText size={18} /> Invoice Summary</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between"><span className="text-slate-600">Pending</span><span className="font-medium text-amber-600">{subDashboard?.pending_invoices || 0}</span></div>
                                            <div className="flex justify-between"><span className="text-slate-600">Overdue</span><span className="font-medium text-red-600">{subDashboard?.overdue_invoices || 0}</span></div>
                                            <div className="flex justify-between"><span className="text-slate-600">Revenue This Month</span><span className="font-medium text-emerald-600">Rs. {(subDashboard?.revenueThisMonth || 0).toLocaleString()}</span></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {showSubModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-4 md:p-6 border-b border-slate-100 bg-white flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">Add Subscription</h3>
                            <button onClick={() => setShowSubModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <div className="p-4 md:p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Farm</label>
                                <select value={newSubForm.tenantId} onChange={e => setNewSubForm({ ...newSubForm, tenantId: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="">Select farm...</option>
                                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.ownerName})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
                                <select value={newSubForm.planId} onChange={e => {
                                    const plan = plans.find(p => p.id === parseInt(e.target.value));
                                    setNewSubForm({ ...newSubForm, planId: e.target.value, amount: plan?.pricePkr?.toString() || '' });
                                }} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="">Select plan...</option>
                                    {plans.filter(p => !p.isCustom).map(p => <option key={p.id} value={p.id}>{p.name} - Rs. {p.pricePkr?.toLocaleString()}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount (PKR)</label>
                                    <input type="number" value={newSubForm.amount} onChange={e => setNewSubForm({ ...newSubForm, amount: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="5000" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Billing Cycle</label>
                                    <select value={newSubForm.billingCycle} onChange={e => setNewSubForm({ ...newSubForm, billingCycle: e.target.value as any })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                                        <option value="MONTHLY">Monthly</option>
                                        <option value="QUARTERLY">Quarterly</option>
                                        <option value="YEARLY">Yearly</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Trial Days (optional)</label>
                                <input type="number" value={newSubForm.trialDays} onChange={e => setNewSubForm({ ...newSubForm, trialDays: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="0" />
                            </div>
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowSubModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">Cancel</button>
                            <button onClick={handleCreateSubscription} disabled={isSaving}
                                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50 flex items-center gap-2 text-sm">
                                {isSaving && <Loader2 className="animate-spin" size={16} />}
                                Create Subscription
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'notifications' && (
                <div className="space-y-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Push Notifications</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2">Send broadcast messages to all subscribed users.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Send Broadcast</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                                    <input
                                        type="text"
                                        value={broadcastTitle}
                                        onChange={(e) => setBroadcastTitle(e.target.value)}
                                        className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                        placeholder="e.g., System Maintenance"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Message Body</label>
                                    <textarea
                                        value={broadcastBody}
                                        onChange={(e) => setBroadcastBody(e.target.value)}
                                        className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-32 resize-none"
                                        placeholder="Enter your message here..."
                                    />
                                </div>
                                <button
                                    onClick={sendBroadcast}
                                    disabled={sendingBroadcast || !broadcastTitle || !broadcastBody}
                                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {sendingBroadcast ? <Loader2 className="animate-spin" /> : <Bell size={20} />}
                                    Send Broadcast
                                </button>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Your Subscription Status</h2>
                            <div className="flex flex-col items-center justify-center h-full py-8 text-center space-y-4">
                                <div className={`p-4 rounded-full ${isSubscribed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <Bell size={48} />
                                </div>
                                <div>
                                    <p className="text-lg font-medium text-slate-900 dark:text-white">
                                        {isSubscribed ? 'You are subscribed' : 'Notifications disabled'}
                                    </p>
                                    <p className="text-slate-500 text-sm">
                                        {isSubscribed ? 'You will receive broadcast messages on this device.' : 'Enable notifications to test receiving messages.'}
                                    </p>
                                </div>
                                {!isSubscribed && (
                                    <button
                                        onClick={subscribeToPush}
                                        disabled={loadingPush}
                                        className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                                    >
                                        Enable Notifications
                                    </button>
                                )}
                                {pushError && <p className="text-red-500 text-sm">{pushError}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className="fixed bottom-6 right-6 z-40">
                <button
                    onClick={subscribeToPush}
                    disabled={isSubscribed || loadingPush}
                    className={`p-4 rounded-full shadow-lg text-white transition-all ${isSubscribed ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    title={isSubscribed ? 'Notifications Enabled' : 'Enable Notifications'}
                >
                    {loadingPush ? <Loader2 className="animate-spin" size={24} /> : <Bell size={24} />}
                </button>
                {pushError && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-red-100 text-red-700 text-xs p-2 rounded border border-red-200">
                        {pushError}
                    </div>
                )}
            </div>

            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-4 md:p-6 border-b border-slate-100 bg-white">
                            <h3 className="text-lg md:text-xl font-bold text-slate-800">Register New Farm</h3>
                            <p className="text-xs md:text-sm text-slate-500">Create a new tenant space.</p>
                        </div>
                        <div className="p-4 md:p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Farm Name</label>
                                <input type="text" value={newTenant.name} onChange={e => setNewTenant({ ...newTenant, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name</label>
                                <input type="text" value={newTenant.ownerName} onChange={e => setNewTenant({ ...newTenant, ownerName: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Owner Email</label>
                                <input type="email" value={newTenant.ownerEmail} onChange={e => setNewTenant({ ...newTenant, ownerEmail: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Subscription Tier</label>
                                <select value={newTenant.tier} onChange={e => setNewTenant({ ...newTenant, tier: e.target.value as any })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="FREE">Free (All 8 Features · Max 5 Animals)</option>
                                    <option value="BASIC">Basic (Core only)</option>
                                    <option value="STANDARD">Standard (+Feed)</option>
                                    <option value="PREMIUM">Premium (+AI & Finance)</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100">
                            {saveError && (
                                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                    {saveError}
                                </div>
                            )}
                            <div className="flex justify-end gap-3">
                                <button onClick={() => { setShowAddModal(false); setSaveError(null); }} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm" disabled={isSaving}>Cancel</button>
                                <button onClick={handleCreateTenant} disabled={isSaving} className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50 flex items-center gap-2 text-sm">
                                    {isSaving && <Loader2 className="animate-spin" size={16} />}
                                    {isSaving ? 'Saving...' : 'Create Farm'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'content' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Manage Auth Page Content</h3>
                            <p className="text-sm text-slate-500">Update marketing text visible on the login/landing page.</p>
                        </div>
                        <button
                            onClick={handleSaveContent}
                            disabled={savingContent}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {savingContent && <Loader2 className="animate-spin" size={16} />}
                            Save Changes
                        </button>
                    </div>

                    {loadingContent ? (
                        <div className="text-center py-12"><Loader2 className="animate-spin mx-auto" size={32} /></div>
                    ) : !content ? (
                        <div className="text-center py-12 text-slate-500">Failed to load content.</div>
                    ) : (
                        <div className="space-y-8">
                            {/* Hero Section */}
                            <div className="space-y-4">
                                <h4 className="font-bold text-slate-700 border-b border-slate-100 pb-2">Hero Section</h4>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Headline</label>
                                    <input
                                        type="text"
                                        value={content.heroTitle}
                                        onChange={e => setContent({ ...content, heroTitle: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Subtitle</label>
                                    <textarea
                                        value={content.heroSubtitle}
                                        onChange={e => setContent({ ...content, heroSubtitle: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm h-24 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Features Section */}
                            <div className="space-y-4">
                                <h4 className="font-bold text-slate-700 border-b border-slate-100 pb-2">Features List</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {content.features.map((feature, idx) => (
                                        <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-white relative group">
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 uppercase">Icon Name</label>
                                                    <input
                                                        type="text"
                                                        value={feature.icon}
                                                        onChange={e => {
                                                            const newFeatures = [...content.features];
                                                            newFeatures[idx].icon = e.target.value;
                                                            setContent({ ...content, features: newFeatures });
                                                        }}
                                                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 uppercase">Title</label>
                                                    <input
                                                        type="text"
                                                        value={feature.title}
                                                        onChange={e => {
                                                            const newFeatures = [...content.features];
                                                            newFeatures[idx].title = e.target.value;
                                                            setContent({ ...content, features: newFeatures });
                                                        }}
                                                        className="w-full border border-slate-300 rounded px-2 py-1 text-sm font-medium"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 uppercase">Description</label>
                                                    <textarea
                                                        value={feature.description}
                                                        onChange={e => {
                                                            const newFeatures = [...content.features];
                                                            newFeatures[idx].description = e.target.value;
                                                            setContent({ ...content, features: newFeatures });
                                                        }}
                                                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                                                        rows={2}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer Section */}
                            <div className="space-y-4">
                                <h4 className="font-bold text-slate-700 border-b border-slate-100 pb-2">Footer Points</h4>
                                <div className="space-y-2">
                                    {content.footerPoints.map((point, idx) => (
                                        <div key={idx} className="flex gap-2">
                                            <input
                                                type="text"
                                                value={point}
                                                onChange={e => {
                                                    const newPoints = [...content.footerPoints];
                                                    newPoints[idx] = e.target.value;
                                                    setContent({ ...content, footerPoints: newPoints });
                                                }}
                                                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
