import React, { useState, useEffect } from 'react';
import { Tractor, BarChart3, Shield, Smartphone, Users, TrendingUp, Check, ArrowRight, Leaf, Scale, Syringe, Calculator, Mail, Sparkles, ChevronRight, CheckCircle2, Percent, Coins, ArrowUpRight } from 'lucide-react';
import heroImage from '@assets/image5_1765049126368.jpeg';
import cattleImage1 from '@assets/stock_images/cattle_cows_farm_liv_456f5ae2.jpg';
import cattleImage2 from '@assets/stock_images/cattle_cows_farm_liv_81fae086.jpg';
import cattleImage3 from '@assets/stock_images/cattle_cows_farm_liv_5d933c01.jpg';
import { SubscriptionPlan } from '../types';
import { api } from '../services/api';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: () => void;
}

const defaultPlans = [
    {
        id: 1,
        code: 'BASIC',
        name: 'Basic',
        pricePkr: 1000,
        billingPeriod: '/month',
        isCustom: false,
        contactEmail: null,
        isPopular: false,
        displayOrder: 1,
        userLimit: 3,
        cattleLimit: '50',
        features: [
            { id: 1, text: 'Up to 50 cattle', displayOrder: 1 },
            { id: 2, text: 'Weight tracking', displayOrder: 2 },
            { id: 3, text: 'Vaccination records', displayOrder: 3 },
            { id: 4, text: 'Basic reports', displayOrder: 4 },
            { id: 5, text: '3 users', displayOrder: 5 }
        ]
    },
    {
        id: 2,
        code: 'STANDARD',
        name: 'Standard',
        pricePkr: 3000,
        billingPeriod: '/month',
        isCustom: false,
        contactEmail: null,
        isPopular: true,
        displayOrder: 2,
        userLimit: 10,
        cattleLimit: '200',
        features: [
            { id: 6, text: 'Up to 200 cattle', displayOrder: 1 },
            { id: 7, text: 'All Basic features', displayOrder: 2 },
            { id: 8, text: 'Feed optimizer', displayOrder: 3 },
            { id: 9, text: 'Advanced analytics', displayOrder: 4 },
            { id: 10, text: '10 users', displayOrder: 5 }
        ]
    },
    {
        id: 3,
        code: 'PREMIUM',
        name: 'Premium',
        pricePkr: 5000,
        billingPeriod: '/month',
        isCustom: false,
        contactEmail: null,
        isPopular: false,
        displayOrder: 3,
        userLimit: 20,
        cattleLimit: 'Unlimited',
        features: [
            { id: 11, text: 'Unlimited cattle', displayOrder: 1 },
            { id: 12, text: 'All Standard features', displayOrder: 2 },
            { id: 13, text: 'AI Growth Advisor', displayOrder: 3 },
            { id: 14, text: 'Qurbani tracking', displayOrder: 4 },
            { id: 15, text: 'Finance module', displayOrder: 5 },
            { id: 16, text: '20 users', displayOrder: 6 }
        ]
    },
    {
        id: 4,
        code: 'CUSTOM',
        name: 'Custom',
        pricePkr: null,
        billingPeriod: '/month',
        isCustom: true,
        contactEmail: 'Sales@farmxpert.pk',
        isPopular: false,
        displayOrder: 4,
        userLimit: null,
        cattleLimit: 'Custom',
        features: [
            { id: 17, text: 'Everything in Premium', displayOrder: 1 },
            { id: 18, text: 'Custom integrations', displayOrder: 2 },
            { id: 19, text: 'Dedicated support', displayOrder: 3 },
            { id: 20, text: 'Custom user limits', displayOrder: 4 },
            { id: 21, text: 'On-premise option', displayOrder: 5 }
        ]
    }
];

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin }) => {
    const [plans, setPlans] = useState<SubscriptionPlan[]>(defaultPlans);
    const [isAnnual, setIsAnnual] = useState(false);
    const [herdSize, setHerdSize] = useState(150);
    const [calculatedSavings, setCalculatedSavings] = useState({ feed: 0, profit: 0, weight: 0 });
    const [rotatingIndex, setRotatingIndex] = useState(0);
    const words = ['Cattle Feedlot', 'Dairy Breeding', 'Commercial Farm', 'Livestock Profit'];

    useEffect(() => {
        const interval = setInterval(() => {
            setRotatingIndex(prev => (prev + 1) % words.length);
        }, 2800);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const data = await api.plans.list();
                if (data && data.length > 0) {
                    setPlans(data);
                }
            } catch (err) {
                console.error('Failed to fetch plans, using defaults:', err);
            }
        };
        fetchPlans();
    }, []);

    // Calculate dynamic ROI values based on Herd Size slider
    useEffect(() => {
        const feedSaved = Math.round(herdSize * 45); // 45 kg saved per animal/year
        const extraWeight = Math.round(herdSize * 8); // 8 kg extra gain per animal
        const netProfit = Math.round((feedSaved * 95) + (extraWeight * 850)); // Wanda price PKR 95/kg, Meat price PKR 850/kg
        setCalculatedSavings({ feed: feedSaved, profit: netProfit, weight: extraWeight });
    }, [herdSize]);

    const features = [
        { icon: Scale, title: 'Weight Tracking', desc: 'Monitor daily weight gain with visual charts, progress meters, and smart growth predictions.', color: 'blue' },
        { icon: Syringe, title: 'Vaccination Management', desc: 'Auto-schedule FMD, LSD, and Anthrax schedules with mobile push alerts & SMS reminders.', color: 'rose' },
        { icon: Leaf, title: 'Feed & Ration Optimizer', desc: 'Formulate feed mixes (Wanda, Silage, Straws) with cost-per-kg tracking & auto-inventory decrement.', color: 'teal' },
        { icon: Calculator, title: 'Financial ROI Analytics', desc: 'Track animal buying rates, daily feed costs, medical bills, and net ROI progress per animal.', color: 'amber' },
        { icon: Users, title: 'Multi-Role Team Control', desc: 'Define access bounds for Owners, Managers, and Laborers with detailed activity logs.', color: 'purple' },
        { icon: TrendingUp, title: 'Qurbani Sales campaigns', desc: 'Manage seasonal campaign pricing, deposits, customer balances, and detailed ledger outputs.', color: 'indigo' },
    ];

    const getGridCols = () => {
        if (plans.length === 4) return 'lg:grid-cols-4';
        if (plans.length === 3) return 'md:grid-cols-3';
        if (plans.length === 2) return 'md:grid-cols-2';
        return 'md:grid-cols-3';
    };

    return (
        <div className="landing-page-root min-h-screen bg-[#080d19] text-slate-100 selection:bg-emerald-500/30 overflow-hidden font-sans">
            {/* Tech Matrix Grid Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-30">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_80%,transparent_100%)]"></div>
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/20 rounded-full blur-[140px] animate-pulse-slow"></div>
                <div className="absolute bottom-[20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/15 rounded-full blur-[150px] animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
                <div className="absolute top-[40%] left-[20%] w-[40%] h-[40%] bg-fuchsia-600/10 rounded-full blur-[140px] animate-pulse-slow" style={{ animationDelay: '4s' }}></div>
            </div>

            {/* Premium Sticky Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/85 backdrop-blur-md border-b border-slate-900/60 shadow-lg shadow-black/20 transition-all duration-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
                    <div className="h-10 w-32 flex items-center justify-center relative">
                        <img src="/logo.png" alt="FarmXpert Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onLogin}
                            className="text-slate-300 hover:text-white font-semibold transition-colors px-4 py-2 text-sm cursor-pointer"
                        >
                            Sign In
                        </button>
                        <button 
                            onClick={onGetStarted}
                            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-900 font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/25 active:scale-95 cursor-pointer"
                        >
                            Get Started
                        </button>
                    </div>
                </div>
            </nav>

            {/* Glowing Hero Section */}
            <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div className="space-y-6 text-left">
                            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 shadow-inner opacity-0 animate-fadeInUp">
                                <Sparkles className="text-emerald-400 h-4 w-4 animate-spin-slow" />
                                <span className="text-emerald-400 text-xs font-bold tracking-wider uppercase">Pakistan’s Premier Feedlot Platform</span>
                            </div>
                            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black text-white leading-[1.1] tracking-tight opacity-0 animate-fadeInUp [animation-delay:150ms]">
                                Modernize Your <br />
                                <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-fuchsia-400 min-w-[320px] transition-all duration-500 ease-in-out transform hover:scale-[1.02] drop-shadow-[0_0_15px_rgba(46,211,183,0.3)] pt-2 pb-1">
                                    {words[rotatingIndex]}
                                </span> Business
                            </h1>
                            <p className="text-slate-400 text-lg leading-relaxed max-w-xl opacity-0 animate-fadeInUp [animation-delay:300ms]">
                                From purchase tracking to seasonal campaigns. Monitor live daily weight gains, design optimized rations, control feed expenses, and maximize herd profit margins.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 pt-4 opacity-0 animate-fadeInUp [animation-delay:450ms]">
                                <button 
                                    onClick={onGetStarted}
                                    className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-900 font-extrabold px-8 py-4 rounded-xl text-md transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95"
                                >
                                    Start 14-Day Free Trial <ArrowRight size={20} />
                                </button>
                                <button 
                                    onClick={() => {
                                        const el = document.getElementById('calculator-section');
                                        el?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="border border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-slate-200 px-8 py-4 rounded-xl font-bold text-md transition-all hover:border-slate-500 flex items-center justify-center gap-2"
                                >
                                    Calculate ROI Savings
                                </button>
                            </div>
                        </div>

                        {/* Interactive UI Mockup with Floating Cards */}
                        <div className="relative group opacity-0 animate-fadeInUp [animation-delay:600ms]">
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-cyan-500/10 to-fuchsia-500/10 rounded-3xl blur-3xl group-hover:scale-110 transition-transform duration-700"></div>
                            <div className="relative rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(16,185,129,0.15)] border border-white/10 bg-white/5 p-2 backdrop-blur-xl">
                                <div className="rounded-2xl overflow-hidden relative border border-slate-800/50">
                                    <img 
                                        src={heroImage} 
                                        alt="Pakistani cattle farm" 
                                        className="w-full h-[400px] object-cover scale-[1.02] group-hover:scale-105 transition-transform duration-[2s] ease-out"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>
                                    <div className="absolute inset-x-0 bottom-0 p-6 z-10">
                                    <div className="grid grid-cols-3 gap-4 relative">
                                        <div className="backdrop-blur-xl bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4 text-center shadow-2xl hover:border-emerald-500/50 transition-colors animate-float-slow-1">
                                            <p className="text-4xl font-black text-white drop-shadow-md">127</p>
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-wider">Herd Size</p>
                                        </div>
                                        <div className="backdrop-blur-xl bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4 text-center shadow-2xl hover:border-cyan-500/50 transition-colors animate-float-slow-2">
                                            <p className="text-3xl font-black text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)] mt-1">+1.25<span className="text-xl">kg</span></p>
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-wider">Avg Daily Gain</p>
                                        </div>
                                        <div className="backdrop-blur-xl bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4 text-center shadow-2xl hover:border-emerald-500/50 transition-colors animate-float-slow-3">
                                            <p className="text-4xl font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">Rs.</p>
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-wider">Net Profit</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </section>

            {/* Everything You Need (Glassmorphic Feature Cards) */}
            <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-950/40 border-y border-slate-900">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16 space-y-3">
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Complete Herd Intelligence Platform</h2>
                        <p className="text-slate-400 text-lg max-w-xl mx-auto font-medium">All feedlot and commercial workflows aggregated into a single secure interface.</p>
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature, i) => {
                            const colorsMap: Record<string, any> = {
                                blue: {
                                    iconBg: 'bg-blue-500/10 border-blue-500/20 group-hover:from-blue-500/20 group-hover:to-blue-500/5',
                                    iconColor: 'text-blue-400',
                                    cardBg: 'bg-blue-950/20 border-blue-900/30 hover:bg-blue-950/40',
                                    cardHover: 'hover:border-blue-500/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.06)]',
                                    titleHover: 'group-hover:text-blue-300'
                                },
                                rose: {
                                    iconBg: 'bg-rose-500/10 border-rose-500/20 group-hover:from-rose-500/20 group-hover:to-rose-500/5',
                                    iconColor: 'text-rose-400',
                                    cardBg: 'bg-rose-950/20 border-rose-900/30 hover:bg-rose-950/40',
                                    cardHover: 'hover:border-rose-500/40 hover:shadow-[0_0_30px_rgba(244,63,94,0.06)]',
                                    titleHover: 'group-hover:text-rose-300'
                                },
                                teal: {
                                    iconBg: 'bg-teal-500/10 border-teal-500/20 group-hover:from-teal-500/20 group-hover:to-teal-500/5',
                                    iconColor: 'text-teal-400',
                                    cardBg: 'bg-teal-950/20 border-teal-900/30 hover:bg-teal-950/40',
                                    cardHover: 'hover:border-teal-500/40 hover:shadow-[0_0_30px_rgba(20,184,166,0.06)]',
                                    titleHover: 'group-hover:text-teal-300'
                                },
                                amber: {
                                    iconBg: 'bg-amber-500/10 border-amber-500/20 group-hover:from-amber-500/20 group-hover:to-amber-500/5',
                                    iconColor: 'text-amber-400',
                                    cardBg: 'bg-amber-950/20 border-amber-900/30 hover:bg-amber-950/40',
                                    cardHover: 'hover:border-amber-500/40 hover:shadow-[0_0_30px_rgba(245,158,11,0.06)]',
                                    titleHover: 'group-hover:text-amber-300'
                                },
                                purple: {
                                    iconBg: 'bg-purple-500/10 border-purple-500/20 group-hover:from-purple-500/20 group-hover:to-purple-500/5',
                                    iconColor: 'text-purple-400',
                                    cardBg: 'bg-purple-950/20 border-purple-900/30 hover:bg-purple-950/40',
                                    cardHover: 'hover:border-purple-500/40 hover:shadow-[0_0_30px_rgba(168,85,247,0.06)]',
                                    titleHover: 'group-hover:text-purple-300'
                                },
                                indigo: {
                                    iconBg: 'bg-indigo-500/10 border-indigo-500/20 group-hover:from-indigo-500/20 group-hover:to-indigo-500/5',
                                    iconColor: 'text-indigo-400',
                                    cardBg: 'bg-indigo-950/20 border-indigo-900/30 hover:bg-indigo-950/40',
                                    cardHover: 'hover:border-indigo-500/40 hover:shadow-[0_0_30px_rgba(99,102,241,0.06)]',
                                    titleHover: 'group-hover:text-indigo-300'
                                }
                            };
                            const c = colorsMap[feature.color || 'teal'];

                            return (
                                <div key={i} className={`rounded-2xl p-7 border transition-all duration-500 group transform hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] ${c.cardBg} ${c.cardHover}`}>
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 border shadow-inner ${c.iconBg}`}>
                                        <feature.icon className={c.iconColor} size={28} />
                                    </div>
                                    <h3 className={`text-white font-extrabold text-xl mb-3 transition-colors ${c.titleHover}`}>{feature.title}</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Dynamic Interactive Calculator (SAVES / ROI WIDGET) */}
            <section id="calculator-section" className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-6xl mx-auto">
                    <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden backdrop-blur-md">
                        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none"></div>
                        
                        <div className="grid lg:grid-cols-2 gap-10 items-center">
                            <div className="space-y-6 text-left">
                                <h2 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                                    <Coins className="text-emerald-400" size={28} /> Estimate Your Savings
                                </h2>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    See how much Wanda feed costs and animal meat gains you could optimize using FarmXpert's daily growth analytics and formulation metrics.
                                </p>
                                
                                <div className="space-y-4 pt-4">
                                    <div className="flex justify-between items-center text-sm font-semibold">
                                        <span className="text-slate-300">Your Herd Size</span>
                                        <span className="text-emerald-400 text-lg font-bold">{herdSize} Animals</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="10" 
                                        max="1000" 
                                        step="10"
                                        value={herdSize} 
                                        onChange={(e) => setHerdSize(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                                    />
                                    <div className="flex justify-between text-xs text-slate-500 font-bold">
                                        <span>10 Animals</span>
                                        <span>500 Animals</span>
                                        <span>1,000 Animals</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 shadow-inner">
                                    <p className="text-xs uppercase font-bold text-slate-500 tracking-wider">Feed Saved (Wanda/Silage)</p>
                                    <p className="text-3xl font-black text-white mt-1">{calculatedSavings.feed.toLocaleString()} kg</p>
                                    <p className="text-xs text-slate-400 mt-1">Saved per year (45kg/animal average)</p>
                                </div>
                                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 shadow-inner">
                                    <p className="text-xs uppercase font-bold text-slate-500 tracking-wider">Extra Weight gained</p>
                                    <p className="text-3xl font-black text-emerald-400 mt-1">+{calculatedSavings.weight.toLocaleString()} kg</p>
                                    <p className="text-xs text-slate-400 mt-1">Extra yield gained per year</p>
                                </div>
                                <div className="col-span-1 sm:col-span-2 bg-gradient-to-r from-emerald-950/40 to-cyan-950/30 border border-emerald-500/30 rounded-2xl p-8 text-center shadow-[0_0_30px_rgba(16,185,129,0.1)] relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent pointer-events-none"></div>
                                    <p className="text-xs uppercase font-extrabold text-emerald-400 tracking-widest relative z-10">Estimated Yearly Profit Increase</p>
                                    <p className="text-5xl font-black text-white mt-3 mb-1 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] relative z-10 animate-pulse-slow">
                                        Rs. {calculatedSavings.profit.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-2 relative z-10">Calculated via Wanda feed prices and meat market rates</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Breeds Showcase */}
            <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-950/40 border-t border-slate-900">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16 space-y-3">
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Built for Local Pakistani Operations</h2>
                        <p className="text-slate-400 text-lg max-w-xl mx-auto font-medium">Tracking and optimizing feedlots across standard commercial breeds.</p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="relative rounded-2xl overflow-hidden group shadow-xl border border-slate-800/60">
                            <img src={cattleImage1} alt="Cattle feedlot" className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-500" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent flex items-end p-6">
                                <div>
                                    <p className="text-white font-bold text-lg">Premium Breeds</p>
                                    <p className="text-slate-300 text-xs">Register and track Sahiwal, Cholistani, Cross breeds</p>
                                </div>
                            </div>
                        </div>
                        <div className="relative rounded-2xl overflow-hidden group shadow-xl border border-slate-800/60">
                            <img src={cattleImage2} alt="Healthy cattle" className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-500" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent flex items-end p-6">
                                <div>
                                    <p className="text-white font-bold text-lg">Weight Monitoring</p>
                                    <p className="text-slate-300 text-xs">Visualize target completion metrics & daily ADG margins</p>
                                </div>
                            </div>
                        </div>
                        <div className="relative rounded-2xl overflow-hidden group shadow-xl border border-slate-800/60">
                            <img src={cattleImage3} alt="Farm cattle" className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-500" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent flex items-end p-6">
                                <div>
                                    <p className="text-white font-bold text-lg">Qurbani Campaigns</p>
                                    <p className="text-slate-300 text-xs">Organize booking details, token prices, and customer balances</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Simple pricing system */}
            <section className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-12 space-y-4">
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Flexible & Honest Pricing</h2>
                        <p className="text-slate-400 text-lg max-w-xl mx-auto">Choose a capacity level corresponding to your current herd size.</p>
                        
                        {/* Interactive Billing Cycle Toggle */}
                        <div className="inline-flex bg-slate-950 border border-slate-800 p-1.5 rounded-xl mt-4">
                            <button 
                                onClick={() => setIsAnnual(false)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${!isAnnual ? 'bg-emerald-500 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}
                            >
                                Monthly
                            </button>
                            <button 
                                onClick={() => setIsAnnual(true)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${isAnnual ? 'bg-emerald-500 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}
                            >
                                Annually <span className="bg-emerald-950/20 text-emerald-300 dark:bg-emerald-900/40 text-[9px] px-1 rounded font-black">-20%</span>
                            </button>
                        </div>
                    </div>

                    <div className={`grid grid-cols-1 sm:grid-cols-2 ${getGridCols()} gap-6 max-w-6xl mx-auto`}>
                        {plans.map((plan) => {
                            // Compute discounted annual pricing
                            const computedPrice = plan.pricePkr 
                                ? (isAnnual ? Math.round(plan.pricePkr * 0.8) : plan.pricePkr) 
                                : null;
                            const computedBillingPeriod = isAnnual ? '/month, billed annually' : plan.billingPeriod;

                            return (
                                <div 
                                    key={plan.id} 
                                    className={`relative rounded-3xl p-8 transition-all duration-500 hover:-translate-y-2 flex flex-col justify-between group ${plan.isPopular 
                                        ? 'bg-gradient-to-b from-[#00677c]/30 via-slate-900/90 to-slate-950 shadow-[0_0_40px_rgba(16,185,129,0.15)] border-2 border-transparent before:absolute before:inset-0 before:rounded-3xl before:p-[2px] before:bg-gradient-to-br before:from-emerald-400 before:via-cyan-500 before:to-transparent before:-z-10 z-10' 
                                        : 'bg-slate-900/40 border border-slate-800/80 hover:border-slate-700 hover:shadow-2xl'}`}
                                >
                                    <div>
                                        {plan.isPopular && (
                                            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-[10px] font-black tracking-widest px-4 py-1 rounded-full uppercase shadow-md">
                                                MOST POPULAR
                                            </div>
                                        )}
                                        <h3 className="text-white font-extrabold text-xl mb-2">{plan.name}</h3>
                                        
                                        <div className="flex items-baseline gap-1 mb-6 border-b border-slate-800/80 pb-6">
                                            {plan.isCustom ? (
                                                <div className="min-h-[50px] flex flex-col justify-center">
                                                    <span className="text-2xl font-black text-white tracking-tight">Custom Plan</span>
                                                    <a 
                                                        href={`mailto:${plan.contactEmail}`} 
                                                        className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 text-xs mt-1 font-bold"
                                                    >
                                                        <Mail size={12}/> {plan.contactEmail}
                                                    </a>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-4xl font-black text-white tracking-tight">Rs. {computedPrice?.toLocaleString()}</span>
                                                    <span className="text-slate-400 text-xs font-semibold">{computedBillingPeriod}</span>
                                                </>
                                            )}
                                        </div>

                                        <ul className="space-y-3.5 mb-8">
                                            {plan.features.map((feature) => (
                                                <li key={feature.id} className="flex items-center gap-3 text-slate-300 text-sm font-medium">
                                                    <CheckCircle2 className="text-emerald-400 shrink-0" size={16} />
                                                    {feature.text}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="mt-auto">
                                        {plan.isCustom ? (
                                            <a 
                                                href={`mailto:${plan.contactEmail}`}
                                                className="w-full py-3 rounded-xl font-bold transition-all bg-slate-850 hover:bg-slate-800 border border-slate-800 text-white flex items-center justify-center gap-2 shadow-inner text-sm"
                                            >
                                                <Mail size={16}/> Contact Sales
                                            </a>
                                        ) : (
                                            <button 
                                                onClick={onGetStarted}
                                                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${plan.isPopular 
                                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-900 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/25 active:scale-[0.98]' 
                                                    : 'bg-slate-900 border border-slate-800 hover:bg-slate-850 text-white'}`}
                                            >
                                                Get Started
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Big CTA */}
            <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-30"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 to-transparent"></div>
                <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
                    <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight drop-shadow-lg">Ready to Run a Highly Profitable Farm?</h2>
                    <p className="text-emerald-50 font-medium text-xl max-w-2xl mx-auto leading-relaxed opacity-90">Join 500+ modern farms across Pakistan. Formulate feed rations correctly and control expenditures today.</p>
                    <button 
                        onClick={onGetStarted}
                        className="bg-white text-slate-900 hover:bg-slate-50 px-10 py-5 rounded-2xl font-black text-lg transition-all shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)] flex items-center gap-3 mx-auto active:scale-95 hover:scale-105"
                    >
                        Start Your Free Trial <ArrowRight size={24} />
                    </button>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-6 px-4 sm:px-6 lg:px-8 bg-[#04070d] border-t border-slate-900">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="h-10 w-32 flex items-center justify-center relative">
                        <img src="/logo.png" alt="FarmXpert Logo" className="w-full h-full object-contain" />
                    </div>
                    <p className="text-slate-500 text-xs font-semibold">© {new Date().getFullYear()} FarmXpert Ltd. Pakistan's Premier Farm Management Platform.</p>
                    <div className="flex items-center gap-6 text-slate-400 text-xs font-semibold">
                        <a href="#" className="hover:text-white transition-colors">Privacy policy</a>
                        <a href="#" className="hover:text-white transition-colors">Terms of service</a>
                        <a href="mailto:support@farmxpert.pk" className="hover:text-white transition-colors">Help desk</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};
