import React, { useState, useEffect } from 'react';
import { Tenant, UserRole, SubscriptionPlan, SubscriptionDashboard } from '../types';
import { api } from '../services/api';
import { CreditCard, Zap, CheckCircle2, AlertCircle, Loader2, ArrowRight, Star, ShieldCheck } from 'lucide-react';
import { useTheme } from '../services/ThemeContext';

interface SubscriptionManagerProps {
    tenant: Tenant;
    setTenant: React.Dispatch<React.SetStateAction<Tenant | null>>;
}

export const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({ tenant, setTenant }) => {
    const { isDarkMode } = useTheme();
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpgrading, setIsUpgrading] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Usage stats
    const seatLimit = tenant.tier === 'BASIC' ? 2 : tenant.tier === 'STANDARD' ? 5 : 20;
    const currentSeats = tenant.users?.length || 0;
    const seatUsagePercent = Math.min(100, Math.round((currentSeats / seatLimit) * 100));

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const fetchedPlans = await api.plans.list();
                setPlans(fetchedPlans);
            } catch (err) {
                console.error("Failed to load plans:", err);
                setError("Failed to load subscription plans.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchPlans();
    }, []);

    const handleUpgrade = async (planId: number, planCode: string) => {
        if (!window.confirm(`Are you sure you want to upgrade to the ${planCode} plan?`)) return;

        setIsUpgrading(planId);
        setError(null);
        setSuccessMsg(null);

        try {
            const result = await api.billing.upgrade(tenant.id, planId);

            // Update local tenant state
            setTenant(prev => prev ? ({
                ...prev,
                tier: result.tier,
                modules: result.modules
            }) : null);

            setSuccessMsg(`Successfully upgraded to ${planCode} plan!`);
        } catch (err: any) {
            setError(err.message || 'Failed to process upgrade');
        } finally {
            setIsUpgrading(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 size={32} className="animate-spin text-purple-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                        Billing & Subscription
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        Manage your farm's plan, view usage limits, and unlock premium features.
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50/90 border border-red-200 text-red-700 px-6 py-4 rounded-xl text-sm flex items-center gap-3 shadow-sm">
                    <AlertCircle size={20} className="text-red-500" />
                    {error}
                </div>
            )}

            {successMsg && (
                <div className="bg-emerald-50/90 border border-emerald-200 text-emerald-700 px-6 py-4 rounded-xl text-sm flex items-center gap-3 shadow-sm">
                    <CheckCircle2 size={20} className="text-emerald-500" />
                    {successMsg}
                </div>
            )}

            {/* Current Plan Overview */}
            <div className="bg-white dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60">
                <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">

                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <ShieldCheck size={28} className="text-emerald-500" />
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                                Current Plan: {tenant.tier}
                            </h3>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                            Your farm is currently active and in good standing.
                        </p>

                        <div className="bg-white dark:bg-slate-900/50 p-5 rounded-xl border border-slate-100 dark:border-slate-700">
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Team Seats Used</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{currentSeats}</span>
                                    <span className="text-sm text-slate-500"> / {seatLimit}</span>
                                </div>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mb-2 overflow-hidden">
                                <div
                                    className={`h-2.5 rounded-full transition-all duration-500 ${seatUsagePercent > 90 ? 'bg-red-500' : seatUsagePercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${seatUsagePercent}%` }}
                                ></div>
                            </div>
                            {currentSeats >= seatLimit && (
                                <p className="text-xs text-red-500 font-medium flex items-center gap-1 mt-2">
                                    <AlertCircle size={12} /> Seat limit reached. Upgrade to invite more users.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Upgrade Plans Grid */}
            <div className="mt-12">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                    <Zap className="text-amber-500" /> Upgrade Your Farm
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {plans.map((plan) => (
                        <div
                            key={plan.id}
                            className={`relative bg-white dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border ${plan.isPopular ? 'border-purple-500 shadow-lg shadow-purple-500/20' : 'border-slate-200/60 dark:border-slate-700/60'} overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-xl`}
                        >
                            {plan.isPopular && (
                                <div className="absolute top-0 inset-x-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold uppercase tracking-wider text-center py-1.5 flex items-center justify-center gap-1">
                                    <Star size={12} fill="currentColor" /> Most Popular
                                </div>
                            )}

                            <div className={`p-8 ${plan.isPopular ? 'pt-10' : ''}`}>
                                <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">{plan.name}</h4>
                                <div className="flex items-baseline gap-1 mb-4">
                                    <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                                        {plan.pricePkr ? `Rs. ${plan.pricePkr.toLocaleString()}` : 'Custom'}
                                    </span>
                                    {plan.pricePkr && <span className="text-slate-500 text-sm font-medium">{plan.billingPeriod}</span>}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 min-h-[40px]">
                                    {plan.description}
                                </p>

                                <button
                                    onClick={() => handleUpgrade(plan.id, plan.code)}
                                    disabled={tenant.tier === plan.code || isUpgrading !== null}
                                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex justify-center items-center gap-2
                                        ${tenant.tier === plan.code
                                            ? 'bg-white dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                                            : plan.isPopular
                                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md'
                                                : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600'
                                        }`}
                                >
                                    {isUpgrading === plan.id ? (
                                        <><Loader2 size={16} className="animate-spin" /> Upgrading...</>
                                    ) : tenant.tier === plan.code ? (
                                        'Current Plan'
                                    ) : (
                                        <>{plan.isCustom ? 'Contact Sales' : 'Upgrade Plan'} <ArrowRight size={16} /></>
                                    )}
                                </button>
                            </div>

                            <div className="p-8 pt-0 flex-1 bg-white dark:bg-slate-800/30">
                                <div className="h-px w-full bg-slate-200 dark:bg-slate-700 mb-6"></div>
                                <ul className="space-y-4">
                                    <li className="flex items-start gap-3">
                                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">
                                            <strong className="text-slate-900 dark:text-white">{plan.userLimit || 'Unlimited'}</strong> Team Seats
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">
                                            <strong className="text-slate-900 dark:text-white">{plan.cattleLimit}</strong> Cattle Limit
                                        </span>
                                    </li>
                                    {plan.features.map(feature => (
                                        <li key={feature.id} className="flex items-start gap-3">
                                            <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">{feature.text}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
