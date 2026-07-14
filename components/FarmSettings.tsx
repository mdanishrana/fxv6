
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tenant, UserRole, User } from '../types';
import { Save, Mail, Building2, CheckCircle, BellRing, Users, Plus, Trash2, Shield, Loader2, Info } from 'lucide-react';
import { api } from '../services/api';
import { useTheme } from '../services/ThemeContext';

interface FarmSettingsProps {
    tenant: Tenant;
    setTenant: React.Dispatch<React.SetStateAction<Tenant | null>>;
}

// Limits based on Tier
const TIER_USER_LIMITS = {
    'BASIC': 2,
    'STANDARD': 5,
    'PREMIUM': 20
};

export const FarmSettings: React.FC<FarmSettingsProps> = ({ tenant, setTenant }) => {
    const navigate = useNavigate();
    const { isDarkMode } = useTheme();
    const [farmName, setFarmName] = useState(tenant.name);
    const [ownerEmail, setOwnerEmail] = useState(tenant.ownerEmail || '');
    const [managerEmail, setManagerEmail] = useState(tenant.managerEmail || '');
    const [whatsappNumber, setWhatsappNumber] = useState(tenant.whatsappNumber || '');
    const [whatsappApiKey, setWhatsappApiKey] = useState(tenant.whatsappApiKey || '');
    const [notificationsEnabled, setNotificationsEnabled] = useState(tenant.smtpSettings?.enabled ?? true);
    const [herdValueRate, setHerdValueRate] = useState(tenant.herdValueRate || 1100);
    const [logoUrl, setLogoUrl] = useState(tenant.logoUrl || '');
    const [currency, setCurrency] = useState(tenant.currency || 'PKR');
    const [weightUnit, setWeightUnit] = useState(tenant.weightUnit || 'kg');
    const [branches, setBranches] = useState<string[]>(tenant.branches || []);
    const [newBranch, setNewBranch] = useState('');
    const [newUserForm, setNewUserForm] = useState({ name: '', email: '', role: 'LABOR' as UserRole });

    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);
    const [userError, setUserError] = useState<string | null>(null);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);

    // Fetch users from database on component mount
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const users = await api.users.list(tenant.id);
                setTenant(prev => prev ? ({
                    ...prev,
                    users: users.map((u: any) => ({
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        role: u.role as UserRole,
                        tenantId: tenant.id,
                        mobile: u.mobile,
                        isVerified: u.is_verified
                    }))
                }) : null);
            } catch (error) {
                console.error('Failed to fetch users:', error);
            } finally {
                setIsLoadingUsers(false);
            }
        };
        fetchUsers();
    }, [tenant.id]);

    const userLimit = TIER_USER_LIMITS[tenant.tier];
    const currentUsers = tenant.users || [];
    const canAddUser = currentUsers.length < userLimit;

    const handleSave = async () => {
        setIsSaving(true);
        setSaveError(null);

        try {
            const smtpSettings = {
                host: 'system-managed',
                port: 0,
                username: 'system',
                enabled: notificationsEnabled
            };

            await api.tenants.update(tenant.id, {
                name: farmName,
                ownerEmail,
                managerEmail,
                whatsappNumber,
                whatsappApiKey,
                smtpSettings,
                herdValueRate,
                logoUrl,
                currency,
                weightUnit,
                branches
            });

            setTenant(prev => prev ? ({
                ...prev,
                name: farmName,
                ownerEmail,
                managerEmail,
                whatsappNumber,
                whatsappApiKey,
                smtpSettings,
                herdValueRate,
                logoUrl,
                currency,
                weightUnit,
                branches
            }) : null);

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error: any) {
            setSaveError(error.message || 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size (limit to ~500KB)
        if (file.size > 500 * 1024) {
            alert("Logo file is too large. Please select an image under 500KB.");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setLogoUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleAddUser = async () => {
        if (!newUserForm.name || !newUserForm.email) {
            setUserError("Please enter name and email");
            return;
        }
        if (!canAddUser) {
            setUserError("User limit reached. Please upgrade your package.");
            return;
        }

        setIsAddingUser(true);
        setUserError(null);

        try {
            const newUser = await api.users.create(tenant.id, {
                name: newUserForm.name,
                email: newUserForm.email.toLowerCase().trim(),
                role: newUserForm.role
            });

            setTenant(prev => prev ? ({
                ...prev,
                users: [...(prev.users || []), {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role as UserRole,
                    tenantId: tenant.id
                }]
            }) : null);

            setNewUserForm({ name: '', email: '', role: 'LABOR' });
        } catch (error: any) {
            setUserError(error.message || 'Failed to add user');
        } finally {
            setIsAddingUser(false);
        }
    };

    const handleDeleteUser = async (userId: string, role: UserRole) => {
        if (role === 'OWNER') {
            alert("Cannot delete the Farm Owner.");
            return;
        }
        if (!window.confirm("Are you sure you want to remove this user?")) {
            return;
        }

        setIsDeletingUser(userId);
        setUserError(null);

        try {
            await api.users.delete(tenant.id, userId);
            setTenant(prev => prev ? ({
                ...prev,
                users: prev.users.filter(u => u.id !== userId)
            }) : null);
        } catch (error: any) {
            setUserError(error.message || 'Failed to delete user');
        } finally {
            setIsDeletingUser(null);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-5xl mx-auto pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                        Farm Settings
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Configure general details, alerts, and team access.</p>
                </div>
                {saved && (
                    <div className="bg-emerald-100/90 backdrop-blur text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-2 font-medium animate-fade-in shadow-sm border border-emerald-200">
                        <CheckCircle size={18} /> Settings Saved
                    </div>
                )}
            </div>

            {/* General Details */}
            <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60 relative overflow-hidden group hover:shadow-md transition-all duration-300">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-emerald-600 dark:text-blue-400">
                        <Building2 size={24} />
                    </div>
                    General Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Farm Name</label>
                        <input
                            type="text"
                            value={farmName}
                            onChange={(e) => setFarmName(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none backdrop-blur-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Owner Name (Read Only)</label>
                        <input
                            type="text"
                            value={tenant.ownerName}
                            disabled
                            className="w-full border border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/50 text-slate-500 rounded-xl px-4 py-3 cursor-not-allowed"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            Herd Value Rate (PKR/kg)
                            <span className="text-slate-400 cursor-help" title="Used for valuation estimates"><Info size={14} /></span>
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={herdValueRate}
                                onChange={(e) => setHerdValueRate(Number(e.target.value) || 0)}
                                min={0}
                                step={50}
                                className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl pl-4 pr-12 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">PKR</span>
                        </div>
                    </div>
                </div>

                {/* Branches / Locations */}
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700/60">
                    <h4 className="text-md font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                        Farm Branches & Locations
                    </h4>
                    <p className="text-sm text-slate-500 mb-4">Add multiple branches to categorize your livestock and manage headcount separately.</p>
                    
                    <div className="flex gap-3 mb-4">
                        <input
                            type="text"
                            value={newBranch}
                            onChange={(e) => setNewBranch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newBranch.trim()) {
                                    if (!branches.includes(newBranch.trim())) {
                                        setBranches([...branches, newBranch.trim()]);
                                    }
                                    setNewBranch('');
                                }
                            }}
                            placeholder="e.g. North Farm, Shed B"
                            className="flex-1 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none text-sm"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                if (newBranch.trim() && !branches.includes(newBranch.trim())) {
                                    setBranches([...branches, newBranch.trim()]);
                                    setNewBranch('');
                                }
                            }}
                            className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Plus size={16} /> Add Branch
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {branches.map(branch => (
                            <div key={branch} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/30 text-sm font-medium">
                                {branch}
                                <button 
                                    onClick={() => setBranches(branches.filter(b => b !== branch))}
                                    className="text-emerald-500 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-200 ml-1 focus:outline-none"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                        {branches.length === 0 && (
                            <span className="text-sm text-slate-400 italic">No branches defined. Animals will be assigned to main farm.</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Premium Branding & Localization */}
            <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60 relative overflow-hidden group hover:shadow-md transition-all duration-300">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                        <Building2 size={24} />
                    </div>
                    Premium Branding & Localization
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Brand Logo Upload</label>
                        <div className="flex items-center gap-4">
                            {logoUrl && (
                                <div className="w-16 h-16 rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 flex-shrink-0 shadow-sm flex items-center justify-center">
                                    <img src={logoUrl} alt="Farm Logo Preview" className="w-full h-full object-contain" />
                                </div>
                            )}
                            <div className="flex-1">
                                <label className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors w-full sm:w-auto self-start group">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-emerald-500 transition-colors">
                                        Choose Image File...
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/png, image/jpeg, image/webp, image/svg+xml"
                                        onChange={handleLogoUpload}
                                        className="hidden"
                                    />
                                </label>
                                <p className="text-xs text-slate-400 mt-2">Maximum file size: 500KB. Recommended formats: PNG or SVG.</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Primary Currency</label>
                        <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none backdrop-blur-sm appearance-none"
                        >
                            <option value="PKR">Pakistani Rupee (PKR - Rs)</option>
                            <option value="USD">US Dollar (USD - $)</option>
                            <option value="EUR">Euro (EUR - €)</option>
                            <option value="GBP">British Pound (GBP - £)</option>
                            <option value="INR">Indian Rupee (INR - ₹)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Default Weight Unit</label>
                        <select
                            value={weightUnit}
                            onChange={(e) => setWeightUnit(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none backdrop-blur-sm appearance-none"
                        >
                            <option value="kg">Kilograms (kg)</option>
                            <option value="lbs">Pounds (lbs)</option>
                        </select>
                    </div>
                </div>

                {/* Notification Recipients */}
                <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60 transition-all duration-300 hover:shadow-md">
                    <div className="flex justify-between items-start mb-6">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-emerald-600 dark:text-indigo-400">
                                <Mail size={24} />
                            </div>
                            Alert Configuration
                        </h3>
                        <div className="flex items-center gap-3 bg-white dark:bg-slate-700/50 p-1.5 rounded-full border border-slate-200 dark:border-slate-600">
                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${notificationsEnabled ? 'text-emerald-700 bg-emerald-100' : 'text-slate-500'}`}>
                                {notificationsEnabled ? 'Active' : 'Disabled'}
                            </span>
                            <button
                                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${notificationsEnabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>

                    <p className="text-sm text-slate-500 mb-8 max-w-2xl">
                        Configure who receives critical system alerts (e.g. Low Feed Stock, Health warnings). System alerts are automatically managed by our cloud service.
                    </p>

                    {notificationsEnabled ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Owner Email</label>
                                <input
                                    type="email"
                                    value={ownerEmail}
                                    onChange={(e) => setOwnerEmail(e.target.value)}
                                    placeholder="owner@farm.com"
                                    className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none backdrop-blur-sm transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Manager Email</label>
                                <input
                                    type="email"
                                    value={managerEmail}
                                    onChange={(e) => setManagerEmail(e.target.value)}
                                    placeholder="manager@farm.com"
                                    className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none backdrop-blur-sm transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">WhatsApp Number</label>
                                <input
                                    type="text"
                                    value={whatsappNumber}
                                    onChange={(e) => setWhatsappNumber(e.target.value)}
                                    placeholder="+923001234567"
                                    className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none backdrop-blur-sm transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">CallMeBot API Key</label>
                                <input
                                    type="text"
                                    value={whatsappApiKey}
                                    onChange={(e) => setWhatsappApiKey(e.target.value)}
                                    placeholder="123456"
                                    className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none backdrop-blur-sm transition-all"
                                />
                            </div>
                            <div className="col-span-full bg-indigo-50/70 dark:bg-indigo-900/20 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800/30 flex items-start gap-4">
                                <BellRing className="text-emerald-600 shrink-0 mt-0.5" size={20} />
                                <div className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed">
                                    <strong>System Note:</strong> Emails are routed via the FarmXpert Cloud.
                                    Please ensure <code>alerts@farmxpert.com</code> is added to your safe sender list to prevent alerts landing in spam.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-slate-800/50 p-12 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
                            <BellRing size={48} className="mx-auto text-slate-300 mb-4" />
                            <p className="text-slate-500 font-medium">Alerts are currently paused.</p>
                            <p className="text-slate-400 text-sm mt-1">Enable to configure recipients.</p>
                        </div>
                    )}
                </div>

                {saveError && (
                    <div className="bg-red-50/90 border border-red-200 text-red-700 px-6 py-4 rounded-xl text-sm flex items-center gap-3 shadow-sm">
                        <div className="p-2 bg-red-100 rounded-full text-red-600"><Info size={18} /></div>
                        {saveError}
                    </div>
                )}

                <div className="flex justify-end items-center gap-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                    {saved && (
                        <div className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-2 animate-fade-in transition-all">
                            <CheckCircle size={20} /> Configuration Saved Successfully
                        </div>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-8 py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-3"
                    >
                        {isSaving ? (
                            <><Loader2 size={20} className="animate-spin" /> Saving Changes...</>
                        ) : (
                            <><Save size={20} /> Save Configuration</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};