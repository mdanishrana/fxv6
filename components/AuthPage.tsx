import React, { useState } from 'react';
import { ArrowLeft, Mail, Lock, User, Building2, Phone, Loader2, Eye, EyeOff, Check, Activity, Calculator, DollarSign, Syringe, Package, TrendingUp, CheckCircle2, Scale } from 'lucide-react';
import { api } from '../services/api';
import { SystemContent } from '../types';

const DEFAULT_CONTENT: SystemContent = {
    heroTitle: "Pakistan’s Leading Cattle Feedlot Management Platform",
    heroSubtitle: "Run your farm like a modern business. Track growth, control costs, and maximize profitability — all in one intelligent system.",
    features: [
        { icon: 'Scale', title: 'Real-Time Weight & Growth Monitoring', description: 'Track daily gain, performance trends, and herd progress instantly.' },
        { icon: 'Calculator', title: 'Smart Feed Optimization & Cost Control', description: 'Design ration packages and automatically calculate feed cost per animal.' },
        { icon: 'DollarSign', title: 'Complete Expense & Profit Analytics', description: 'Monitor feed, labor, health, and operational expenses with real-time ROI tracking.' },
        { icon: 'Syringe', title: 'Health & Vaccination Automation', description: 'Never miss a vaccination or treatment schedule again.' },
        { icon: 'Package', title: 'Inventory & Supplier Management', description: 'Stay ahead with stock alerts and supplier tracking.' },
        { icon: 'TrendingUp', title: 'Sales & Seasonal Campaign Tracking', description: 'Manage Qurbani and commercial sales with accurate profit reporting.' }
    ],
    footerPoints: [
        'Multi-animal performance dashboard',
        'Financial reporting & export (PDF)',
        'Secure cloud-based data',
        'Designed for Pakistan & GCC markets'
    ]
};

const IconMap: Record<string, any> = {
    Scale, Calculator, DollarSign, Syringe, Package, TrendingUp, Activity, CheckCircle2
};

interface AuthPageProps {
    mode: 'login' | 'register' | 'forgot' | 'reset';
    onBack: () => void;
    onLogin: (token: string, user: any, tenant: any) => void;
    onSwitchMode: (mode: 'login' | 'register' | 'forgot') => void;
    resetToken?: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onBack, onLogin, onSwitchMode, resetToken }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        farmName: '',
        mobile: '',
        tier: 'BASIC'
    });

    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [content, setContent] = useState<SystemContent>(DEFAULT_CONTENT);
    const [planPrices, setPlanPrices] = useState<Record<string, string>>({ BASIC: '...', STANDARD: '...', PREMIUM: '...' });

    React.useEffect(() => {
        const fetchContent = async () => {
            try {
                const data = await api.content.get('landing_page');
                if (data) setContent(data);
            } catch (err) {
                console.error('Failed to load content, using default');
            }
        };
        fetchContent();

        const fetchPlans = async () => {
            try {
                const res = await fetch('/api/plans');
                if (res.ok) {
                    const plans: any[] = await res.json();
                    const priceMap: Record<string, string> = { BASIC: '', STANDARD: '', PREMIUM: '' };
                    for (const plan of plans) {
                        const code = (plan.code || '').toUpperCase();
                        if (priceMap.hasOwnProperty(code)) {
                            priceMap[code] = plan.isCustom
                                ? 'Custom'
                                : `Rs. ${Number(plan.pricePkr).toLocaleString()}/mo`;
                        }
                    }
                    setPlanPrices(priceMap);
                }
            } catch (err) {
                console.error('Failed to load plan prices');
            }
        };
        fetchPlans();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setIsLoading(true);

        try {
            if (mode === 'register') {
                if (formData.password !== formData.confirmPassword) {
                    throw new Error('Passwords do not match');
                }
                if (formData.password.length < 6) {
                    throw new Error('Password must be at least 6 characters');
                }

                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formData.name,
                        email: formData.email,
                        password: formData.password,
                        farmName: formData.farmName,
                        mobile: formData.mobile,
                        tier: formData.tier
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                setSuccess('Registration successful! Please check your email to verify your account.');
                setTimeout(() => {
                    onLogin(data.token, data.user, data.tenant);
                }, 2000);

            } else if (mode === 'login') {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: formData.email,
                        password: formData.password
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                onLogin(data.token, data.user, data.tenant);

            } else if (mode === 'forgot') {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: formData.email })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                setSuccess('If an account exists with this email, you will receive a password reset link.');

            } else if (mode === 'reset') {
                if (formData.password !== formData.confirmPassword) {
                    throw new Error('Passwords do not match');
                }

                const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: resetToken,
                        password: formData.password
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                setSuccess('Password reset successful! Redirecting to login...');
                setTimeout(() => onSwitchMode('login'), 2000);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const renderForm = () => {
        if (mode === 'login') {
            return (
                <>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                                placeholder="your@email.com"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-12 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                                placeholder="Enter your password"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => onSwitchMode('forgot')}
                            className="text-emerald-400 hover:text-emerald-300 text-sm"
                        >
                            Forgot password?
                        </button>
                    </div>
                </>
            );
        }

        if (mode === 'register') {
            return (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Your Name</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                                    placeholder="Ali Khan"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Mobile Number</label>
                            <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                                <input
                                    type="tel"
                                    value={formData.mobile}
                                    onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                                    className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                                    placeholder="03xx-xxxxxxx"
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Farm Name</label>
                        <div className="relative">
                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            <input
                                type="text"
                                value={formData.farmName}
                                onChange={e => setFormData({ ...formData, farmName: e.target.value })}
                                className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                                placeholder="Green Pastures Farm"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                                placeholder="your@email.com"
                                required
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                                    placeholder="Min 6 characters"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.confirmPassword}
                                    onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                                    placeholder="Confirm password"
                                    required
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Select Plan</label>
                        <div className="grid grid-cols-2 gap-3">
                            {/* FREE plan card */}
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, tier: 'FREE' })}
                                className={`p-3 rounded-xl border-2 transition-all text-center ${formData.tier === 'FREE'
                                    ? 'border-emerald-500 bg-emerald-500/10'
                                    : 'border-slate-700 hover:border-slate-600'
                                    }`}
                            >
                                <p className={`font-semibold ${formData.tier === 'FREE' ? 'text-emerald-400' : 'text-white'}`}>Free</p>
                                <p className="text-xs text-slate-400 mt-1">Free forever</p>
                                <p className="text-[10px] text-amber-400 mt-0.5">Up to 5 animals</p>
                            </button>

                            {/* Paid plan cards */}
                            {['BASIC', 'STANDARD', 'PREMIUM'].map(tier => (
                                <button
                                    key={tier}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, tier })}
                                    className={`p-3 rounded-xl border-2 transition-all text-center ${formData.tier === tier
                                        ? 'border-emerald-500 bg-emerald-500/10'
                                        : 'border-slate-700 hover:border-slate-600'
                                        }`}
                                >
                                    <p className={`font-semibold ${formData.tier === tier ? 'text-emerald-400' : 'text-white'}`}>
                                        {tier.charAt(0) + tier.slice(1).toLowerCase()}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {planPrices[tier] || '—'}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            );
        }

        if (mode === 'forgot') {
            return (
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                        <input
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                            placeholder="your@email.com"
                            required
                        />
                    </div>
                    <p className="text-slate-400 text-sm mt-3">
                        Enter your email address and we'll send you a link to reset your password.
                    </p>
                </div>
            );
        }

        if (mode === 'reset') {
            return (
                <>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-12 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                                placeholder="Min 6 characters"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Confirm New Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={formData.confirmPassword}
                                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all hover:bg-slate-800/80"
                                placeholder="Confirm new password"
                                required
                            />
                        </div>
                    </div>
                </>
            );
        }

        return null;
    };

    const getTitle = () => {
        switch (mode) {
            case 'login': return 'Welcome Back';
            case 'register': return 'Create Your Farm Account';
            case 'forgot': return 'Reset Password';
            case 'reset': return 'Set New Password';
        }
    };

    const getSubtitle = () => {
        switch (mode) {
            case 'login': return 'Sign in to manage your farm';
            case 'register': return 'Start your 14-day free trial';
            case 'forgot': return 'We\'ll send you a reset link';
            case 'reset': return 'Choose a strong password';
        }
    };

    const getButtonText = () => {
        switch (mode) {
            case 'login': return 'Sign In';
            case 'register': return 'Create Account';
            case 'forgot': return 'Send Reset Link';
            case 'reset': return 'Reset Password';
        }
    };

    return (
        <div className="min-h-screen bg-[#080d19] flex text-slate-200 selection:bg-emerald-500/30">
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#080d19] via-slate-900 to-[#080d19] p-8 xl:p-12 flex-col relative overflow-hidden border-r border-slate-900">
                {/* Background Blobs & Texture */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[80px] -ml-24 -mb-24"></div>
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20"></div>
                </div>

                {/* Content Container */}
                <div className="relative z-10 flex flex-col h-full">
                    {/* Header */}
                    <div className="mb-8 shrink-0">
                        <div className="h-14 w-60 overflow-hidden flex items-center justify-center relative mb-4">
                            <img src="/logo.png" alt="FarmXpert Logo" className="w-full h-full object-contain scale-[2.4] origin-center" />
                        </div>
                        <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-4 tracking-tight drop-shadow-sm">
                            {content.heroTitle}
                        </h2>
                        <p className="text-slate-400 text-lg font-medium leading-relaxed max-w-xl">
                            {content.heroSubtitle}
                        </p>
                    </div>

                    {/* Why FarmXpert? List - Scrollable area */}
                    <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-6 custom-scrollbar">
                        <h3 className="text-base font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-4 bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/50"></span> Why FarmXpert?
                        </h3>

                        <div className="space-y-6">
                            {content.features.map((feature, idx) => {
                                const IconComponent = IconMap[feature.icon] || CheckCircle2;
                                return (
                                    <div key={idx} className="flex gap-4 items-start group">
                                        <div className="w-10 h-10 bg-slate-800/50 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-slate-800 transition-all shadow-lg shadow-black/5 border border-slate-700/50 group-hover:border-emerald-500/30 group-hover:shadow-emerald-500/10">
                                            <IconComponent className="text-emerald-400" size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-200 text-lg leading-tight mb-1 group-hover:text-white transition-colors">{feature.title}</h4>
                                            <p className="text-slate-400 text-sm leading-relaxed group-hover:text-slate-300 transition-colors">{feature.description}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer - Built for Serious... */}
                    <div className="mt-8 pt-6 border-t border-slate-800/50 shrink-0">
                        <p className="text-slate-500 font-bold mb-3 uppercase tracking-wider text-xs flex items-center gap-2">
                            Built for Serious Feedlot Operations
                        </p>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-y-2 gap-x-4 text-sm font-medium text-slate-400">
                            {content.footerPoints.map((point, idx) => (
                                <div key={idx} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> {point}</div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
                <div className="w-full max-w-md">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors"
                    >
                        <ArrowLeft size={20} />
                        Back to Home
                    </button>

                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-white mb-2">{getTitle()}</h1>
                        <p className="text-slate-400">{getSubtitle()}</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                            {success}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {renderForm()}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white py-4 rounded-xl font-semibold text-lg transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading && <Loader2 className="animate-spin" size={20} />}
                            {getButtonText()}
                        </button>
                    </form>

                    {mode === 'login' && (
                        <p className="text-center text-slate-400 mt-6">
                            Don't have an account?{' '}
                            <button
                                onClick={() => onSwitchMode('register')}
                                className="text-emerald-400 hover:text-emerald-300 font-medium"
                            >
                                Sign up
                            </button>
                        </p>
                    )}

                    {mode === 'register' && (
                        <p className="text-center text-slate-400 mt-6">
                            Already have an account?{' '}
                            <button
                                onClick={() => onSwitchMode('login')}
                                className="text-emerald-400 hover:text-emerald-300 font-medium"
                            >
                                Sign in
                            </button>
                        </p>
                    )}

                    {mode === 'forgot' && (
                        <p className="text-center text-slate-400 mt-6">
                            Remember your password?{' '}
                            <button
                                onClick={() => onSwitchMode('login')}
                                className="text-emerald-400 hover:text-emerald-300 font-medium"
                            >
                                Sign in
                            </button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
