
import React, { useState, useMemo, useEffect } from 'react';
import { FeedItem, UserRole, DeletionRequest, FeedPackage, Tenant } from '../types';
import { calculateRation, predictMixPerformance } from '../services/geminiService';
import { Package, AlertTriangle, Calculator, Loader2, Plus, X, Edit2, Save, Scale, Beaker, TrendingUp, Trash2, Layers, CheckCircle, Sparkles, History, Tag, CloudOff } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';
import { useTheme } from '../services/ThemeContext';

interface FeedManagerProps {
    feed: FeedItem[];
    setFeed: React.Dispatch<React.SetStateAction<FeedItem[]>>;
    packages: FeedPackage[];
    setPackages: React.Dispatch<React.SetStateAction<FeedPackage[]>>;
    userRole: UserRole;
    onRequestDelete: (req: DeletionRequest) => void;
    tenant?: Tenant;
    onRefresh?: () => void;
    initialTab?: 'inventory' | 'packages' | 'daily';
}

const PRESET_INGREDIENTS = [
    { name: "Berseem (Clover) - برسیم", protein: 20, energy: 2.25 },
    { name: "Lucerne (Alfalfa) - الفالفہ / لوسرن", protein: 17.5, energy: 2.07 },
    { name: "Maize Green - سبز مکئی", protein: 9, energy: 2.07 },
    { name: "Sorghum Green (Chari) - جوار / چری", protein: 10, energy: 1.89 },
    { name: "Bajra Green - باجرہ سبز", protein: 10, energy: 1.89 },
    { name: "Napier Grass - نیپیئر گھاس", protein: 11, energy: 1.89 },
    { name: "Wheat Straw - گندم کا بھوسہ", protein: 3.5, energy: 1.32 },
    { name: "Rice Straw - چاول کا بھوسہ", protein: 3.5, energy: 1.21 },
    { name: "Barley Straw - جَو کا بھوسہ", protein: 4.5, energy: 1.41 },
    { name: "Maize Stover - مکئی کا ڈنٹھل", protein: 5.5, energy: 1.53 },
    { name: "Maize Grain - مکئی دانہ", protein: 8.5, energy: 2.92 },
    { name: "Wheat Grain - گندم دانہ", protein: 12, energy: 2.61 },
    { name: "Barley Grain - جَو دانہ", protein: 11, energy: 2.61 },
    { name: "Sorghum Grain - جوار دانہ", protein: 10, energy: 2.56 },
    { name: "Wheat Bran - گندم کی چوکر", protein: 15.5, energy: 2.40 },
    { name: "Rice Bran - چاول کی چوکر", protein: 12, energy: 2.25 },
    { name: "Maize Gluten Feed - مکئی گلُوٹن فیڈ", protein: 21, energy: 2.58 },
    { name: "Chana Atti (Chickpea Flour) - چنا آٹا", protein: 21, energy: 2.43 },
    { name: "Chana Chuni - چنا چونی", protein: 19, energy: 2.25 },
    { name: "Cottonseed Cake - کھل بنولہ", protein: 40, energy: 2.97 },
    { name: "Canola Meal - کینولا کھل", protein: 36, energy: 2.61 },
    { name: "Soybean Meal - سویابین کھل", protein: 43, energy: 2.76 },
    { name: "Sunflower Cake - سورج مکھی کھل", protein: 30, energy: 2.43 },
    { name: "Molasses - شیرا", protein: 6.5, energy: 2.61 }
];

const INITIAL_FORM_STATE = {
    id: '',
    name: '',
    quantityKg: 0,
    costPerKg: 0,
    proteinPercent: 0,
    energyMcal: 0,
    lowStockThreshold: 500,
    bagPrice: 0,
    bagWeight: 50
};

export const FeedManager: React.FC<FeedManagerProps> = ({ feed, setFeed, packages, setPackages, userRole, onRequestDelete, tenant, onRefresh, initialTab = 'inventory' }) => {
    const { t } = useTheme();
    const [activeTab, setActiveTab] = useState<'inventory' | 'packages' | 'daily'>(initialTab);

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);
    const [emailStatus, setEmailStatus] = useState<string | null>(null);

    const [showRationModal, setShowRationModal] = useState(false);
    const [rationResult, setRationResult] = useState('');
    const [loadingRation, setLoadingRation] = useState(false);
    const [targetGain, setTargetGain] = useState('1.0');
    const [avgWeight, setAvgWeight] = useState('300');

    const [showMixerModal, setShowMixerModal] = useState(false);
    const [mixItems, setMixItems] = useState<{ id: string, amount: number }[]>([]);
    const [mixResult, setMixResult] = useState('');
    const [loadingMix, setLoadingMix] = useState(false);

    const [showAddModal, setShowAddModal] = useState(false);
    const [formData, setFormData] = useState(INITIAL_FORM_STATE);
    const [pricingMode, setPricingMode] = useState<'perKg' | 'perBag'>('perBag');

    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    const [usageLog, setUsageLog] = useState<any[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processResult, setProcessResult] = useState<any>(null);
    const [loadingLog, setLoadingLog] = useState(false);
    const [daysToProcess, setDaysToProcess] = useState(1);
    const [showMultiDayMode, setShowMultiDayMode] = useState(false);

    const [showPackageModal, setShowPackageModal] = useState(false);
    const [isSavingPackage, setIsSavingPackage] = useState(false);
    const [currentPackage, setCurrentPackage] = useState<FeedPackage>({
        id: '',
        name: '',
        dailyIntakePercent: 2.5,
        items: [],
        description: ''
    });

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-PK', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const canManage = userRole === 'OWNER' || userRole === 'MANAGER';
    const canSeeCost = userRole === 'OWNER' || userRole === 'MANAGER';

    const hasFeedOptimizer = tenant?.modules.includes('FEED_OPTIMIZER') || tenant?.modules.includes('AI_ADVISOR');
    const hasAI = tenant?.modules.includes('AI_ADVISOR') || tenant?.modules.includes('FEED_OPTIMIZER');

    const chartData = useMemo(() => {
        if (!canSeeCost) return [];
        const allDates = new Set<string>();
        feed.forEach(f => { f.priceHistory?.forEach(h => allDates.add(h.date)); });
        const sortedDates = Array.from(allDates).sort();
        return sortedDates.map(date => {
            const point: any = { name: date };
            feed.forEach(f => {
                if (f.priceHistory) {
                    const relevantEntry = [...f.priceHistory]
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .find(h => h.date <= date);
                    if (relevantEntry) { point[f.name] = relevantEntry.price; }
                }
            });
            return point;
        });
    }, [feed, canSeeCost]);

    const handleOpenPackageModal = (pkg?: FeedPackage) => {
        if (pkg) {
            setCurrentPackage(pkg);
        } else {
            setCurrentPackage({
                id: `pkg-${Date.now()}`,
                name: '',
                dailyIntakePercent: 2.5,
                items: [],
                description: ''
            });
        }
        setShowPackageModal(true);
    };

    const handleAddIngredientToPackage = () => {
        if (feed.length === 0) return;
        setCurrentPackage(prev => ({
            ...prev,
            items: [...prev.items, { feedItemId: feed[0].id, ratioPercent: 0 }]
        }));
    };

    const handleRemoveIngredientFromPackage = (index: number) => {
        setCurrentPackage(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const handleUpdatePackageItem = (index: number, field: 'feedItemId' | 'ratioPercent' | 'type' | 'manualKgPerFeeding' | 'manualFeedings' | 'dryMatter', value: any) => {
        const newItems = [...currentPackage.items];

        // Default DM% if switching to Roughage
        if (field === 'type' && value === 'ROUGHAGE' && !newItems[index].dryMatter) {
            newItems[index] = { ...newItems[index], dryMatter: 90 };
        }

        newItems[index] = { ...newItems[index], [field]: value };
        setCurrentPackage({ ...currentPackage, items: newItems });
    };

    const calculatePackageCost = useMemo(() => {
        let weightedCost = 0;
        let totalRatio = 0;
        currentPackage.items.forEach(item => {
            const f = feed.find(i => i.id === item.feedItemId);
            if (f) {
                if (f) {
                    // Only calculate weighted cost for concentrates (ratio based)
                    if (item.type !== 'ROUGHAGE' && item.type !== 'CONCENTRATE_FIXED') {
                        weightedCost += (f.costPerKg * item.ratioPercent);
                        totalRatio += item.ratioPercent;
                    }
                }
            }
        });
        return totalRatio > 0 ? (weightedCost / totalRatio) : 0;
    }, [currentPackage, feed]);

    const handleSavePackage = async () => {
        if (!currentPackage.name || !tenant) {
            alert("Package Name is required");
            return;
        }
        if (isSavingPackage) return;
        setIsSavingPackage(true);
        try {
            const isExisting = packages.some(p => p.id === currentPackage.id);
            if (isExisting) {
                await api.feed.updatePackage(tenant.id, currentPackage.id, currentPackage);
            } else {
                await api.feed.createPackage(tenant.id, currentPackage);
            }
            onRefresh?.();
            setShowPackageModal(false);
        } catch (e) {
            alert("Failed to save package");
        } finally {
            setIsSavingPackage(false);
        }
    };

    const handleDeletePackage = async (pkgId: string) => {
        if (!tenant) return;
        if (!confirm('Are you sure you want to delete this package?')) return;
        try {
            await api.feed.deletePackage(tenant.id, pkgId);
            onRefresh?.();
        } catch (e) {
            alert("Failed to delete package");
        }
    };

    const handleCalculateRation = async () => {
        setLoadingRation(true);
        const result = await calculateRation(feed, targetGain + 'kg', avgWeight);
        setRationResult(result);
        setLoadingRation(false);
    };

    const handleAddToMix = (feedId: string) => {
        if (mixItems.find(i => i.id === feedId)) return;
        setMixItems([...mixItems, { id: feedId, amount: 0 }]);
    };

    const handleRemoveFromMix = (feedId: string) => {
        setMixItems(prev => prev.filter(i => i.id !== feedId));
    };

    const handleUpdateMixAmount = (feedId: string, amount: number) => {
        setMixItems(mixItems.map(i => i.id === feedId ? { ...i, amount } : i));
    };

    const handlePredictMix = async () => {
        if (mixItems.length === 0) return;
        setLoadingMix(true);
        const preparedMix = mixItems.map(item => {
            const f = feed.find(feed => feed.id === item.id);
            return {
                name: f?.name || 'Unknown',
                amount: item.amount,
                protein: f?.proteinPercent || 0,
                energy: f?.energyMcal || 0
            };
        }).filter(i => i.amount > 0);
        const result = await predictMixPerformance(preparedMix, { weight: avgWeight, breed: 'Local Cross' });
        setMixResult(result);
        setLoadingMix(false);
    };

    const handleOpenAdd = () => {
        setFormData({ ...INITIAL_FORM_STATE, id: `feed-${Date.now()}` });
        setPricingMode('perBag');
        setShowAddModal(true);
    };

    const handleIngredientNameChange = (val: string) => {
        const preset = PRESET_INGREDIENTS.find(p => p.name === val);
        setFormData(prev => ({
            ...prev,
            name: val,
            proteinPercent: preset ? preset.protein : prev.proteinPercent,
            energyMcal: preset ? preset.energy : prev.energyMcal
        }));
    };

    const handleEdit = (item: FeedItem) => {
        setFormData({
            ...item,
            bagPrice: 0,
            bagWeight: 50
        });
        setPricingMode('perKg');
        setShowAddModal(true);
    };

    const handleSaveFeed = async () => {
        if (!formData.name || !tenant) {
            alert("Ingredient Name is required");
            return;
        }

        let finalCost = formData.costPerKg;
        if (pricingMode === 'perBag' && formData.bagWeight > 0 && formData.bagPrice > 0) {
            finalCost = formData.bagPrice / formData.bagWeight;
        }
        const newPrice = Number(finalCost.toFixed(2));
        const newQty = Number(formData.quantityKg);
        const lowThreshold = Number(formData.lowStockThreshold);

        // Trigger Email Alert via backend API
        if (newQty <= lowThreshold) {
            const itemForAlert: FeedItem = { ...formData, quantityKg: newQty, costPerKg: newPrice };
            api.feed.sendLowStockAlert(tenant.id, [itemForAlert])
                .then(res => {
                    if (res.success) {
                        setEmailStatus(res.message || 'Low stock alert sent!');
                        setTimeout(() => setEmailStatus(null), 5000);
                    }
                })
                .catch(err => {
                    console.error('Failed to send low stock alert:', err);
                });
        }

        const existing = feed.find(f => f.id === formData.id);
        let newHistory = existing?.priceHistory || [];
        const today = new Date().toISOString().split('T')[0];

        if (!existing || existing.costPerKg !== newPrice) {
            newHistory = [...newHistory, { date: today, price: newPrice }];
        }

        const itemData: Partial<FeedItem> = {
            name: formData.name,
            quantityKg: newQty,
            costPerKg: newPrice,
            proteinPercent: Number(formData.proteinPercent),
            energyMcal: Number(formData.energyMcal),
            lowStockThreshold: lowThreshold,
            priceHistory: newHistory
        };

        try {
            if (existing) {
                // Check if name changed to a name that already exists (other than itself)
                const duplicate = feed.find(f => f.id !== formData.id && f.name.toLowerCase() === formData.name.toLowerCase());
                if (duplicate) {
                    alert(`An ingredient with the name "${formData.name}" already exists. Please choose a different name or use the restock feature.`);
                    return;
                }
                await api.feed.updateItem(tenant.id, formData.id, itemData);
            } else {
                // Check if name already exists before creating new
                const duplicate = feed.find(f => f.name.toLowerCase() === formData.name.toLowerCase());
                if (duplicate) {
                    if (window.confirm(`An ingredient with the name "${formData.name}" already exists. Would you like to merge this quantity into the existing stock?`)) {
                        const existingItem = duplicate;
                        const mergedData = {
                            ...itemData,
                            quantityKg: (existingItem.quantityKg || 0) + (itemData.quantityKg || 0)
                        };
                        await api.feed.updateItem(tenant.id, existingItem.id, mergedData);
                    } else {
                        return;
                    }
                } else {
                    await api.feed.createItem(tenant.id, itemData);
                }
            }
            onRefresh?.();
            setShowAddModal(false);
        } catch (e) {
            alert("Failed to save feed item.");
        }
    };

    const handleDeleteClick = (id: string, e?: React.MouseEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (userRole === 'LABOR') return;
        if (userRole === 'MANAGER') {
            if (window.confirm("Send deletion request to Owner?")) {
                onRequestDelete({
                    id: `req-${Date.now()}`,
                    targetId: id,
                    targetName: 'Feed Item',
                    type: 'FEED',
                    requestedBy: 'Manager',
                    reason: 'Manual deletion request',
                    date: new Date().toISOString()
                });
            }
            return;
        }
        setItemToDelete(id);
    };

    const confirmDelete = async () => {
        if (itemToDelete && tenant) {
            try {
                await api.feed.deleteItem(tenant.id, itemToDelete);
                onRefresh?.();
                setItemToDelete(null);
            } catch (e) {
                alert("Failed to delete item.");
            }
        }
    };

    const loadUsageLog = async () => {
        if (!tenant) return;
        setLoadingLog(true);
        try {
            const log = await api.feed.getUsageLog(tenant.id);
            setUsageLog(log);
        } catch (e) {
            console.error('Failed to load usage log:', e);
        } finally {
            setLoadingLog(false);
        }
    };

    const handleProcessDaily = async () => {
        if (!tenant) return;
        const confirmMsg = showMultiDayMode && daysToProcess > 1
            ? `Process feed for the last ${daysToProcess} days? This will deduct feed from inventory for each unprocessed day.`
            : 'Process today\'s feed consumption? This will deduct feed from inventory based on each active animal\'s weight and assigned package.';
        if (!window.confirm(confirmMsg)) {
            return;
        }
        setIsProcessing(true);
        setProcessResult(null);
        try {
            let result;
            if (showMultiDayMode && daysToProcess > 1) {
                result = await api.feed.processMultipleDays(tenant.id, daysToProcess);
            } else {
                result = await api.feed.processDaily(tenant.id);
            }
            setProcessResult(result);
            onRefresh?.();
            loadUsageLog();
        } catch (e: any) {
            setProcessResult({ error: e.message || 'Failed to process daily feed' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteLog = async (logId: string) => {
        if (!tenant || !confirm('Are you sure you want to delete this usage entry? This will restore the consumed feed back to your inventory.')) return;
        try {
            await api.feed.deleteUsageLog(tenant.id, logId);
            onRefresh?.();
            loadUsageLog();
        } catch (e: any) {
            alert('Failed to delete usage log: ' + e.message);
        }
    };

    React.useEffect(() => {
        if (activeTab === 'daily' && tenant) {
            loadUsageLog();
        }
    }, [activeTab, tenant?.id]);

    // ... Render remains largely the same, just standard JSX structure
    return (
        <div className="space-y-8 animate-fade-in max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-2 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                <div className="w-full lg:w-auto">
                    <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent flex items-center gap-3">
                        Feed Management
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 text-sm">Manage feed inventory, rations, and daily feeding packages.</p>
                </div>

                {emailStatus && (
                    <div className="fixed top-24 right-6 z-50 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-fade-in border border-slate-700/50 backdrop-blur-md">
                        <div className="bg-emerald-500/20 rounded-full p-2 text-emerald-400 border border-emerald-500/20"><CheckCircle size={20} /></div>
                        <div>
                            <p className="font-bold text-base">Alert Sent</p>
                            <p className="text-sm opacity-80">{emailStatus}</p>
                        </div>
                    </div>
                )}

                <div className="flex gap-4 flex-wrap items-center w-full lg:w-auto">
                    <div className="flex bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-1.5 rounded-2xl w-full sm:w-auto overflow-x-auto no-scrollbar shadow-sm border border-white/20 dark:border-slate-700/50">
                        {activeTab === 'inventory' && (
                            <button
                                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 scale-100 whitespace-nowrap"
                            >
                                Inventory
                            </button>
                        )}
                        {activeTab === 'packages' && (
                            <button
                                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30 scale-100 whitespace-nowrap"
                            >
                                Packages
                            </button>
                        )}
                        {activeTab === 'daily' && (
                            <button
                                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/30 scale-100 whitespace-nowrap"
                            >
                                Daily Feed
                            </button>
                        )}
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        {activeTab === 'inventory' ? (
                            <>
                                {canManage && (
                                    <button
                                        onClick={handleOpenAdd}
                                        className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-3 rounded-2xl flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 font-bold hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                                    >
                                        <Plus size={18} /> <span className="hidden sm:inline">Add Ingredient</span>
                                    </button>
                                )}
                            </>
                        ) : activeTab === 'packages' ? (
                            <>
                                {canManage && (
                                    <button
                                        onClick={() => handleOpenPackageModal()}
                                        className="flex-1 sm:flex-none bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white px-5 py-3 rounded-2xl flex justify-center items-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-300 font-bold hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                                    >
                                        <Plus size={18} /> Create Package
                                    </button>
                                )}
                                {hasFeedOptimizer && (
                                    <button onClick={() => setShowMixerModal(true)} className="flex-1 sm:flex-none bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-white/20 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-700 px-5 py-3 rounded-2xl flex justify-center items-center gap-2 shadow-sm transition-all duration-300 font-bold hover:shadow-md hover:-translate-y-0.5 active:scale-95 whitespace-nowrap">
                                        <Beaker size={18} className="text-purple-500" /> <span className="hidden sm:inline">Mixer</span>
                                    </button>
                                )}
                                {hasAI && (
                                    <button onClick={() => setShowRationModal(true)} className="flex-1 sm:flex-none bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-5 py-3 rounded-2xl flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/30 transition-all duration-300 font-bold hover:-translate-y-0.5 active:scale-95 whitespace-nowrap">
                                        <Sparkles size={18} /> <span className="hidden sm:inline">AI Ration</span>
                                    </button>
                                )}
                            </>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* KPI Cards - Dashboard Style */}
            {(() => {
                const totalIngredients = feed.length;
                const lowStockItems = feed.filter(f => Number(f.quantityKg) <= Number(f.lowStockThreshold || 500)).length;
                const totalValue = feed.reduce((sum, f) => sum + (Number(f.quantityKg) * Number(f.costPerKg)), 0);
                const totalPackagesCount = packages.length;
                return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-2">
                        {/* Total Ingredients */}
                        <div className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                            <div className="flex items-start justify-between mb-6 relative">
                                <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                                    <Package className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Inventory</span>
                            </div>
                            <div className="relative">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Ingredients</p>
                                <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{totalIngredients}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Feed items in stock</p>
                            </div>
                        </div>

                        {/* Low Stock Alerts */}
                        <div className="group bg-gradient-to-br from-red-50 via-rose-50 to-red-50 dark:from-red-950/40 dark:to-rose-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(239,68,68,0.15)] hover:shadow-[0_8px_30px_rgb(239,68,68,0.3)] border border-red-100 dark:border-red-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-red-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                            <div className="flex items-start justify-between mb-6 relative">
                                <div className="p-3 bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300 relative">
                                    <AlertTriangle className="w-6 h-6" />
                                    {lowStockItems > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>}
                                </div>
                                <span className="text-[10px] bg-white/60 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Alerts</span>
                            </div>
                            <div className="relative">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Low Stock Items</p>
                                <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{lowStockItems}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Below threshold level</p>
                            </div>
                        </div>

                        {/* Total Inventory Value */}
                        {canSeeCost && (
                            <div className="group bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(245,158,11,0.15)] hover:shadow-[0_8px_30px_rgb(245,158,11,0.3)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                                <div className="flex items-start justify-between mb-6 relative">
                                    <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl text-white shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                                        <TrendingUp className="w-6 h-6" />
                                    </div>
                                    <span className="text-[10px] bg-white dark:bg-black/20 backdrop-blur-md text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-800/50 shadow-sm">Value</span>
                                </div>
                                <div className="relative">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Inventory Value</p>
                                    <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight"><span className="text-lg text-amber-600/80 dark:text-amber-500 font-bold mr-1">Rs.</span>{Math.round(totalValue).toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Total stock at cost price</p>
                                </div>
                            </div>
                        )}

                        {/* Total Packages */}
                        <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.15)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                            <div className="flex items-start justify-between mb-6 relative">
                                <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                                    <Layers className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Packages</span>
                            </div>
                            <div className="relative">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Feed Packages</p>
                                <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{totalPackagesCount}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Active feeding recipes</p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {activeTab === 'inventory' && (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {feed.map((item) => {
                            const qty = Number(item.quantityKg) || 0;
                            const cost = Number(item.costPerKg) || 0;
                            const threshold = Number(item.lowStockThreshold) || 500;
                            const protein = Number(item.proteinPercent) || 0;
                            const energy = Number(item.energyMcal) || 0;
                            const isLow = qty <= threshold;
                            return (
                                <div key={item.id} className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl shadow-sm hover:shadow-[0_8px_30px_rgb(16,185,129,0.15)] border border-white/50 dark:border-slate-800/50 hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
                                    {isLow && (
                                        <div className="absolute top-4 right-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-red-100 dark:border-red-500/30 animate-pulse shadow-sm z-10">
                                            <AlertTriangle size={14} /> LOW STOCK
                                        </div>
                                    )}
                                    <div className="flex items-start justify-between mb-6 relative z-10">
                                        <div className="p-4 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 rounded-2xl text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform duration-300 shadow-sm shadow-emerald-500/10">
                                            <Package size={28} />
                                        </div>
                                        <div className="text-right">
                                            <p className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{qty.toLocaleString()} <span className="text-sm font-bold text-slate-400 ml-0.5">kg</span></p>
                                            {canSeeCost && <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-0.5">Rs. {cost.toFixed(1)} / kg</p>}
                                        </div>
                                    </div>

                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4 truncate text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-emerald-600 group-hover:to-teal-600 transition-all duration-300" title={item.name}>{item.name}</h3>

                                    <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400 mb-6 relative z-10">
                                        <span className="flex items-center gap-2 bg-white dark:bg-slate-900/50 px-3 py-1.5 rounded-lg font-bold border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-blue-500/50"></div> CP: {protein}%
                                        </span>
                                        <span className="flex items-center gap-2 bg-white dark:bg-slate-900/50 px-3 py-1.5 rounded-lg font-bold border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></div> ME: {energy}
                                        </span>
                                    </div>

                                    {canManage && (
                                        <div className="flex gap-3 mt-auto pt-5 border-t border-slate-100 dark:border-slate-700/50 relative z-10">
                                            <button type="button" onClick={() => handleEdit(item)} className="flex-1 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-xl transition-colors flex justify-center items-center gap-2 border border-slate-200 dark:border-slate-600/50 hover:shadow-sm">
                                                <Edit2 size={14} /> Edit
                                            </button>
                                            <button type="button" onClick={(e) => handleDeleteClick(item.id, e)} className="py-2.5 px-4 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl transition-colors flex justify-center items-center border border-red-100 dark:border-red-500/20 hover:shadow-lg hover:shadow-red-500/10 text-sm font-bold">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}

                                    {/* Decorative gradient blob */}
                                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors duration-500 pointer-events-none"></div>
                                </div>
                            );
                        })}
                    </div>

                    {canSeeCost && chartData.length > 0 && (
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 mt-8">
                            <div className="flex items-center gap-5 mb-8">
                                <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-500/30">
                                    <TrendingUp size={28} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Market Price Trends</h3>
                                    <p className="text-slate-500 dark:text-slate-400 font-medium">Historical cost per kg analysis</p>
                                </div>
                            </div>
                            <div className="h-[450px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} vertical={false} />
                                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickMargin={15} axisLine={false} tickLine={false} fontWeight={500} />
                                        <YAxis
                                            stroke="#64748b"
                                            fontSize={12}
                                            label={{ value: 'Rs / kg', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#94a3b8', fontWeight: 600 } }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickMargin={15}
                                            fontWeight={500}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderRadius: '16px', border: 'none', color: '#fff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', padding: '12px 16px' }}
                                            itemStyle={{ color: '#e2e8f0', fontSize: '13px', padding: '2px 0' }}
                                            labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '30px', fontSize: '13px', fontWeight: 600 }} iconType="circle" />
                                        {feed.filter(f => f.priceHistory && f.priceHistory.length > 0).map((f, i) => (
                                            <Line
                                                key={f.id}
                                                type="monotone"
                                                dataKey={f.name}
                                                stroke={`hsl(${(i * 45) % 360}, 80%, 60%)`}
                                                strokeWidth={3}
                                                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                                activeDot={{ r: 8, strokeWidth: 0 }}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'packages' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {packages.map(pkg => {
                        let weightedCost = 0;
                        let totalRatio = 0;
                        let roughageCost = 0;

                        pkg.items.forEach(i => {
                            const f = feed.find(fi => fi.id === i.feedItemId);
                            if (f) {
                                if (i.type === 'ROUGHAGE') {
                                    const dailyPars = (i.manualKgPerFeeding || 0) * (i.manualFeedings || 1);
                                    roughageCost += dailyPars * f.costPerKg;
                                } else if (i.type === 'CONCENTRATE_FIXED') {
                                    const dailyPars = (i.manualKgPerFeeding || 0) * (i.manualFeedings || 1);
                                    roughageCost += dailyPars * f.costPerKg;
                                } else {
                                    weightedCost += (f.costPerKg * i.ratioPercent);
                                    totalRatio += i.ratioPercent;
                                }
                            }
                        });
                        const avgConcentrateCost = totalRatio > 0 ? (weightedCost / totalRatio) : 0;

                        return (
                            <div key={pkg.id} className="bg-white dark:bg-slate-800 p-7 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(99,102,241,0.15)] border border-slate-100 dark:border-slate-700 hover:border-indigo-100 dark:hover:border-indigo-900/50 transition-all duration-300 relative overflow-hidden group hover:-translate-y-1">
                                <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500"></div>
                                <div className="ml-5 relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-indigo-600 dark:group-hover:from-blue-400 dark:group-hover:to-indigo-400 transition-all">{pkg.name}</h3>
                                        {canSeeCost && (
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-0.5">Avg Mix Cost</p>
                                                <p className="text-xl font-black text-slate-900 dark:text-white">Rs. {Math.round(avgConcentrateCost)}<span className="text-sm font-semibold text-slate-400 dark:text-slate-500 ml-0.5">/kg</span></p>
                                                {roughageCost > 0 && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">+ Rs.{Math.round(roughageCost)}/day Fixed</p>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="mb-5">
                                        <span className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                                            Target Intake: {pkg.dailyIntakePercent.toFixed(1)}% Body Weight
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 italic mb-6 min-h-[50px] bg-white dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/50">{pkg.description || 'No description provided.'}</p>

                                    <div className="space-y-3 mb-7">
                                        {pkg.items.slice(0, 4).map((item, idx) => {
                                            const f = feed.find(fi => fi.id === item.feedItemId);
                                            return (
                                                <div key={idx} className="flex justify-between text-sm text-slate-700 dark:text-slate-300 border-b border-slate-50 dark:border-slate-800/50 pb-2 last:border-0 items-center">
                                                    <span className="font-medium flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></div>
                                                        {f?.name || 'Unknown'}
                                                    </span>
                                                    {item.type === 'ROUGHAGE' ? (
                                                        <span className="font-bold text-xs bg-white dark:bg-slate-700 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                                                            Roughage: {(item.manualKgPerFeeding || 0) * (item.manualFeedings || 1)} kg/day
                                                        </span>
                                                    ) : item.type === 'CONCENTRATE_FIXED' ? (
                                                        <span className="font-bold text-xs bg-white dark:bg-slate-700 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                                                            Fixed: {(item.manualKgPerFeeding || 0) * (item.manualFeedings || 1)} kg/day
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold bg-emerald-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md text-xs border border-blue-100 dark:border-blue-500/20">{item.ratioPercent}%</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {pkg.items.length > 4 && <div className="text-xs text-slate-400 text-center font-bold pt-1 uppercase tracking-wide">+ {pkg.items.length - 4} more ingredients</div>}
                                    </div>

                                    {canManage && (
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => handleOpenPackageModal(pkg)}
                                                className="flex-1 py-2.5 text-sm bg-white dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-colors border border-slate-200 dark:border-slate-600/50 hover:shadow-sm"
                                            >
                                                Edit Package
                                            </button>
                                            <button
                                                onClick={() => handleDeletePackage(pkg.id)}
                                                className="px-4 py-2.5 text-sm bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl font-bold transition-colors border border-red-100 dark:border-red-500/20 hover:shadow-lg hover:shadow-red-500/10"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors duration-500 pointer-events-none"></div>
                            </div>
                        );
                    })}

                    {packages.length === 0 && (
                        <div className="col-span-full text-center py-20 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
                            <Layers size={56} className="mx-auto mb-5 opacity-40" />
                            <p className="text-xl font-bold text-slate-600 dark:text-slate-400">No packages defined</p>
                            <p className="text-base mt-2 max-w-md mx-auto">Create a custom feeding package to start tracking rations & costs.</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'daily' && (
                <div className="space-y-8">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
                            <div>
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Daily Feed Processing</h3>
                                <p className="text-base text-slate-500 dark:text-slate-400 mt-1 font-medium">Deduct feed from inventory based on active animals' weight and assigned packages.</p>
                            </div>
                            {canManage && (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                                    <div className="flex items-center gap-4 bg-white dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700/50">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={showMultiDayMode}
                                                onChange={(e) => setShowMultiDayMode(e.target.checked)}
                                                className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 text-emerald-600 focus:ring-emerald-500 appearance-noneChecked checked:bg-emerald-500"
                                            />
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Multiple Days</span>
                                        </label>
                                        {showMultiDayMode && (
                                            <select
                                                value={daysToProcess}
                                                onChange={(e) => setDaysToProcess(parseInt(e.target.value))}
                                                className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow outline-none font-medium"
                                            >
                                                {[...Array(30)].map((_, i) => (
                                                    <option key={i + 1} value={i + 1}>
                                                        {i + 1} {i === 0 ? 'day' : 'days'}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleProcessDaily}
                                        disabled={isProcessing}
                                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-400 disabled:to-slate-500 text-white px-8 py-3.5 rounded-xl flex items-center justify-center gap-3 font-bold shadow-lg shadow-emerald-500/20 disabled:shadow-none transition-all duration-300 hover:-translate-y-0.5"
                                    >
                                        {isProcessing ? (
                                            <><Loader2 size={20} className="animate-spin" /> Processing...</>
                                        ) : (
                                            <><Scale size={20} /> {showMultiDayMode && daysToProcess > 1 ? `Process Last ${daysToProcess} Days` : "Process Today's Feed"}</>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>

                        {processResult && (
                            <div className={`p-6 rounded-2xl mb-8 shadow-sm border ${processResult.error ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-500/20' : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-500/20'}`}>
                                {processResult.error ? (
                                    <div className="flex items-center gap-4 text-red-700 dark:text-red-400">
                                        <div className="bg-red-100 dark:bg-red-500/20 p-2.5 rounded-xl"><AlertTriangle size={24} /></div>
                                        <span className="font-bold text-lg">{processResult.error}</span>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center gap-4 text-emerald-800 dark:text-emerald-400 font-bold mb-6">
                                            <div className="bg-emerald-100 dark:bg-emerald-500/20 p-2.5 rounded-xl"><CheckCircle size={24} /></div>
                                            {processResult.summary?.daysProcessed !== undefined ? (
                                                <span className="text-xl">Feed processed successfully for {processResult.summary.daysProcessed} day(s)</span>
                                            ) : (
                                                <span className="text-xl">Feed processed successfully for {processResult.date}</span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-6">
                                            {processResult.summary?.daysProcessed !== undefined && (
                                                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                                                    <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">Days Processed</p>
                                                    <p className="text-3xl font-black text-slate-800 dark:text-white mt-1">{processResult.summary.daysProcessed}</p>
                                                    {processResult.summary.daysSkipped > 0 && (
                                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-bold">{processResult.summary.daysSkipped} already done</p>
                                                    )}
                                                </div>
                                            )}
                                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                                                <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">Animals Fed</p>
                                                <p className="text-3xl font-black text-slate-800 dark:text-white mt-1">{processResult.summary?.totalAnimals}</p>
                                            </div>
                                            {processResult.summary?.totalWeightKg && (
                                                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                                                    <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">Total Weight</p>
                                                    <p className="text-3xl font-black text-slate-800 dark:text-white mt-1">{processResult.summary?.totalWeightKg?.toLocaleString()} <span className="text-sm font-bold text-slate-400">kg</span></p>
                                                </div>
                                            )}
                                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                                                <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">Feed Consumed</p>
                                                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{processResult.summary?.totalFeedConsumedKg?.toLocaleString()} <span className="text-sm font-bold text-emerald-600/60 dark:text-emerald-400/60">kg</span></p>
                                            </div>
                                        </div>
                                        {processResult.summary?.feedBreakdown?.length > 0 && (
                                            <div className="text-sm bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                                                <p className="font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase text-xs tracking-wider">Feed Consumed Breakdown</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {processResult.summary.feedBreakdown.map((fb: any, i: number) => (
                                                        <span key={i} className="bg-white dark:bg-slate-700/50 px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-medium">
                                                            {fb.feedName}: <strong className="text-slate-900 dark:text-white">{fb.consumedKg} kg</strong>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {processResult.dailyResults?.length > 0 && (
                                            <div className="text-sm mt-4 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                                                <p className="font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase text-xs tracking-wider">Daily Breakdown</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {processResult.dailyResults.map((dr: any, i: number) => (
                                                        <span key={i} className="bg-white dark:bg-slate-700/50 px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-medium">
                                                            {new Date(dr.date).toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric' })}: <strong className="text-slate-900 dark:text-white">{dr.feedConsumed} kg</strong>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {processResult.warnings && (
                                            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-800 dark:text-amber-200 text-sm">
                                                <p className="font-bold flex items-center gap-2 mb-2"><AlertTriangle size={16} /> {processResult.warnings.message}</p>
                                                <ul className="list-disc list-inside space-y-1 ml-1 opacity-90">
                                                    {processResult.warnings.items.map((item: any, i: number) => (
                                                        <li key={i} className="text-amber-700 dark:text-amber-300"><span className="font-semibold">{item.name}</span>: needed {item.required} kg, had {item.available} kg (shortage: {item.shortage} kg)</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mt-8">
                            <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                                <History size={20} className="text-slate-400" />
                                Feed Usage History (Last 30 Days)
                            </h4>
                            {loadingLog ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 size={32} className="animate-spin text-emerald-500" />
                                </div>
                            ) : usageLog.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                                    <Scale size={40} className="mx-auto mb-3 opacity-40" />
                                    <p className="font-medium">No feed usage recorded yet.</p>
                                    <p className="text-sm mt-1">Process daily feed to start tracking history.</p>
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 overflow-hidden">
                                    <div className="p-8 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/50 backdrop-blur-md flex justify-between items-center">
                                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                            <div className="bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-500/20 dark:to-purple-500/20 p-2.5 rounded-xl text-violet-600 dark:text-violet-400 shadow-sm">
                                                <History size={24} />
                                            </div>
                                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400">
                                                Daily Usage Log
                                            </span>
                                        </h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-white dark:bg-slate-700/20 border-b border-slate-100 dark:border-slate-700">
                                                    <th className="p-5 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Date Recorded</th>
                                                    <th className="p-5 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Package</th>
                                                    <th className="p-5 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Animals Fed</th>
                                                    <th className="p-5 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Roughage Cost ({tenant?.currency})</th>
                                                    <th className="p-5 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Concentrate Cost ({tenant?.currency})</th>
                                                    <th className="p-5 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Total Cost ({tenant?.currency})</th>
                                                    <th className="p-5 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {usageLog.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="p-16 text-center text-slate-400 dark:text-slate-500">
                                                            <div className="flex flex-col items-center gap-4">
                                                                <div className="bg-white dark:bg-slate-800 p-6 rounded-full">
                                                                    <CloudOff size={48} className="text-slate-300 dark:text-slate-600" />
                                                                </div>
                                                                <p className="text-lg font-medium">No feeding records found</p>
                                                                <p className="text-sm">Process daily feed to see logs here.</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    usageLog.map((log) => (
                                                        <tr key={log.id} className="hover:bg-white dark:hover:bg-slate-700/30 transition-colors group">
                                                            <td className="p-5">
                                                                <span className="font-bold text-slate-700 dark:text-slate-300">{formatDate(log.date)}</span>
                                                                <p className="text-xs text-slate-400 font-medium mt-0.5">{new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                            </td>
                                                            <td className="p-5">
                                                                <span className="font-bold text-emerald-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 rounded-lg border border-indigo-100 dark:border-indigo-500/20 text-sm">
                                                                    {log.packageName}
                                                                </span>
                                                            </td>
                                                            <td className="p-5 text-right font-bold text-slate-700 dark:text-slate-300 text-lg">
                                                                {log.totalAnimals}
                                                            </td>
                                                            <td className="p-5 text-right font-medium text-slate-600 dark:text-slate-400">
                                                                {log.totalRoughageCost?.toFixed(2) || '0.00'}
                                                            </td>
                                                            <td className="p-5 text-right font-medium text-slate-600 dark:text-slate-400">
                                                                {log.totalConcentrateCost?.toFixed(2) || '0.00'}
                                                            </td>
                                                            <td className="p-5 text-right">
                                                                <span className="font-black text-emerald-600 dark:text-emerald-400 text-lg">
                                                                    {((log.totalRoughageCost || 0) + (log.totalConcentrateCost || 0)).toFixed(2)}
                                                                </span>
                                                            </td>
                                                            <td className="p-5 text-center">
                                                                {canManage && (
                                                                    <button
                                                                        onClick={() => handleDeleteLog(log.id)}
                                                                        className="p-2.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-500/20 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                                        title="Delete Record"
                                                                    >
                                                                        <Trash2 size={18} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modals logic continues... (Wanda Mixer, AI Ration, Package Designer, Add Feed, Delete) */}
            {/* Reusing existing modal markup structure for consistency, ensuring state/handlers are connected */}

            {showMixerModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in text-left">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md flex justify-between items-center z-10 relative">
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                <div className="bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-500/20 dark:to-violet-500/20 p-2.5 rounded-xl text-emerald-600 dark:text-indigo-400 shadow-sm">
                                    <Beaker size={24} />
                                </div>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">
                                    Custom Feed Mixer
                                </span>
                            </h3>
                            <button
                                onClick={() => setShowMixerModal(false)}
                                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer hover:rotate-90 duration-300"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <div className="flex gap-6 mb-8">
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide text-xs">Add Ingredient to Mix</label>
                                    <div className="relative group">
                                        <select
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    handleAddToMix(e.target.value);
                                                    e.target.value = "";
                                                }
                                            }}
                                            className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-3.5 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold appearance-none cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-800 shadow-sm"
                                        >
                                            <option value="">-- Select Ingredient --</option>
                                            {feed.map(f => <option key={f.id} value={f.id}>{f.name} (Stock: {f.quantityKg}kg)</option>)}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors">
                                            <Plus size={20} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {mixItems.length > 0 && (
                                <div className="space-y-4 bg-white dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 mb-8">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Selected Ingredients</h4>
                                    {mixItems.map(item => {
                                        const f = feed.find(i => i.id === item.id);
                                        return (
                                            <div key={item.id} className="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.01] duration-200 group">
                                                <div className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-lg">{f?.name}</div>
                                                <div className="w-40 flex items-center gap-3 bg-white dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-700 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                                                    <input
                                                        type="number"
                                                        value={item.amount}
                                                        onChange={(e) => handleUpdateMixAmount(item.id, parseFloat(e.target.value))}
                                                        className="w-full bg-transparent text-slate-800 dark:text-white px-3 py-1 text-right font-bold outline-none"
                                                    />
                                                    <span className="text-sm font-bold text-slate-400 pr-3">kg</span>
                                                </div>
                                                <button onClick={() => handleRemoveFromMix(item.id)} className="bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 p-2.5 rounded-xl transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {mixItems.length > 0 && (
                                <button
                                    onClick={handlePredictMix}
                                    disabled={loadingMix}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold flex justify-center items-center gap-3 transition-all transform hover:-translate-y-0.5 shadow-lg shadow-indigo-500/25 disabled:opacity-70 disabled:shadow-none disabled:translate-y-0 text-lg tracking-wide"
                                >
                                    {loadingMix ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                                    Analyze Mix Performance
                                </button>
                            )}

                            {mixResult && (
                                <div className="mt-8 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-8 shadow-sm animate-fade-in relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                                    <h4 className="font-bold text-indigo-900 dark:text-indigo-300 mb-6 flex items-center gap-2 relative z-10 text-xl">
                                        <Sparkles size={22} className="text-indigo-500" /> Analysis Result
                                    </h4>
                                    <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 prose-headings:font-bold prose-headings:text-slate-800 dark:prose-headings:text-white prose-p:leading-relaxed bg-white/60 dark:bg-slate-900/60 p-6 rounded-2xl border border-indigo-100/50 dark:border-indigo-500/10 relative z-10 shadow-sm backdrop-blur-sm">
                                        <ReactMarkdown>{mixResult}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showRationModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in text-left">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md flex justify-between items-center z-10 relative">
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                <div className="bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-500/20 dark:to-teal-500/20 p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400 shadow-sm">
                                    <Calculator size={24} />
                                </div>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400">
                                    AI Ration Balancer
                                </span>
                            </h3>
                            <button
                                onClick={() => setShowRationModal(false)}
                                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer hover:rotate-90 duration-300"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide text-xs">Avg Animal Weight</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={avgWeight}
                                            onChange={(e) => setAvgWeight(e.target.value)}
                                            className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3.5 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-black text-lg placeholder:font-normal placeholder:text-slate-300"
                                            placeholder="0"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">kg</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide text-xs">Target Daily Gain</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={targetGain}
                                            onChange={(e) => setTargetGain(e.target.value)}
                                            className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3.5 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-black text-lg placeholder:font-normal placeholder:text-slate-300"
                                            placeholder="0.0"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">kg</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-sm mb-8 flex gap-4 items-start shadow-sm">
                                <Sparkles className="shrink-0 mt-1" size={20} />
                                <div className="space-y-1">
                                    <p className="font-bold uppercase tracking-wide text-xs opacity-70">AI Assistant</p>
                                    <p className="leading-relaxed text-base">I will analyze your <strong>current inventory</strong> to formulate a balanced Total Mixed Ration (TMR) that meets nutritional requirements at the lowest cost possible.</p>
                                </div>
                            </div>

                            <button
                                onClick={handleCalculateRation}
                                disabled={loadingRation}
                                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold flex justify-center items-center gap-3 transition-all transform hover:-translate-y-0.5 shadow-lg shadow-emerald-500/25 disabled:opacity-70 disabled:shadow-none disabled:translate-y-0 text-lg tracking-wide"
                            >
                                {loadingRation ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                                Generate Ration Plan
                            </button>

                            {rationResult && (
                                <div className="mt-8 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl p-8 shadow-sm animate-fade-in relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                                    <h4 className="font-bold text-emerald-900 dark:text-emerald-300 mb-6 flex items-center gap-2 relative z-10 text-xl">
                                        <CheckCircle size={22} className="text-emerald-500" /> Recommended Formulation
                                    </h4>
                                    <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 prose-headings:font-bold prose-headings:text-slate-800 dark:prose-headings:text-white prose-p:leading-relaxed bg-white/60 dark:bg-slate-900/60 p-6 rounded-2xl border border-emerald-100/50 dark:border-emerald-500/10 relative z-10 shadow-sm backdrop-blur-sm">
                                        <ReactMarkdown>{rationResult}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showPackageModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center rounded-t-3xl z-10 relative">
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                <div className="bg-blue-100 dark:bg-emerald-500/20 p-2.5 rounded-xl text-emerald-600 dark:text-blue-400">
                                    <Layers size={24} />
                                </div>
                                Package Designer
                            </h3>
                            <button
                                onClick={() => setShowPackageModal(false)}
                                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar bg-white dark:bg-slate-900">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Package Name</label>
                                    <input
                                        type="text"
                                        value={currentPackage.name}
                                        onChange={(e) => setCurrentPackage({ ...currentPackage, name: e.target.value })}
                                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium placeholder:font-normal"
                                        placeholder="e.g. Silver Plus"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Daily Intake Target</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={currentPackage.dailyIntakePercent}
                                            onChange={(e) => setCurrentPackage({ ...currentPackage, dailyIntakePercent: parseFloat(e.target.value) })}
                                            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-bold"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2 ml-1">Example: 2.5% maintenance, 3.5% fattening.</p>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Description</label>
                                <input
                                    type="text"
                                    value={currentPackage.description}
                                    onChange={(e) => setCurrentPackage({ ...currentPackage, description: e.target.value })}
                                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium placeholder:font-normal"
                                    placeholder="Brief notes about this diet plan..."
                                />
                            </div>

                            <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="font-bold text-slate-700 dark:text-slate-200 text-lg">Ingredients Mix</h4>
                                    <button
                                        onClick={handleAddIngredientToPackage}
                                        className="text-sm bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-blue-400 font-bold hover:bg-blue-100 dark:hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        <Plus size={16} /> Add Item
                                    </button>
                                </div>

                                {currentPackage.items.length === 0 ? (
                                    <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                                        <Layers size={32} className="mx-auto text-slate-300 mb-2" />
                                        <p className="text-slate-400 dark:text-slate-500 font-medium">No ingredients added yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-12 gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                                            <div className="col-span-5">Ingredient</div>
                                            <div className="col-span-3">Type</div>
                                            <div className="col-span-3 text-center">Amount</div>
                                            <div className="col-span-1"></div>
                                        </div>
                                        {currentPackage.items.map((item, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-4 items-start py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-white dark:hover:bg-slate-800 p-2 rounded-xl transition-colors">
                                                <div className="col-span-5">
                                                    <select
                                                        value={item.feedItemId}
                                                        onChange={(e) => handleUpdatePackageItem(idx, 'feedItemId', e.target.value)}
                                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none font-medium appearance-none"
                                                    >
                                                        {feed.map(f => <option key={f.id} value={f.id}>{f.name} (Rs.{f.costPerKg}/kg)</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-3">
                                                    <select
                                                        value={item.type || 'CONCENTRATE'}
                                                        onChange={(e) => handleUpdatePackageItem(idx, 'type', e.target.value)}
                                                        className="w-full text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none font-medium appearance-none"
                                                    >
                                                        <option value="CONCENTRATE">Concentrate (%)</option>
                                                        <option value="CONCENTRATE_FIXED">Concentrate (Fixed)</option>
                                                        <option value="ROUGHAGE">Roughage (Fixed)</option>
                                                    </select>
                                                    {item.type === 'ROUGHAGE' && (
                                                        <div className="mt-2">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    value={item.dryMatter || 90}
                                                                    onChange={(e) => handleUpdatePackageItem(idx, 'dryMatter', parseFloat(e.target.value))}
                                                                    className="w-14 text-[10px] border border-blue-200 dark:border-blue-800 bg-emerald-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded px-1.5 py-1 text-center font-bold"
                                                                    title="Dry Matter %"
                                                                />
                                                                <span className="text-[10px] text-slate-400 font-bold">% DM</span>
                                                            </div>
                                                            <div className="flex gap-1.5">
                                                                <button onClick={() => handleUpdatePackageItem(idx, 'dryMatter', 20)} className="text-[9px] px-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded border border-green-200 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors">Wet</button>
                                                                <button onClick={() => handleUpdatePackageItem(idx, 'dryMatter', 35)} className="text-[9px] px-1.5 bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-400 rounded border border-lime-200 dark:border-lime-800 hover:bg-lime-200 dark:hover:bg-lime-900/50 transition-colors">Silage</button>
                                                                <button onClick={() => handleUpdatePackageItem(idx, 'dryMatter', 90)} className="text-[9px] px-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded border border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors">Dry</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="col-span-3">
                                                    {item.type === 'ROUGHAGE' || item.type === 'CONCENTRATE_FIXED' ? (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    value={item.manualKgPerFeeding || 0}
                                                                    onChange={(e) => handleUpdatePackageItem(idx, 'manualKgPerFeeding', parseFloat(e.target.value))}
                                                                    placeholder="Kg"
                                                                    className="w-full text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 text-center font-bold"
                                                                />
                                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">kg</div>
                                                            </div>
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    value={item.manualFeedings || 1}
                                                                    onChange={(e) => handleUpdatePackageItem(idx, 'manualFeedings', parseFloat(e.target.value))}
                                                                    placeholder="x"
                                                                    className="w-full text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 text-center font-bold"
                                                                />
                                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">x</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="relative mt-1">
                                                            <input
                                                                type="number"
                                                                value={item.ratioPercent}
                                                                onChange={(e) => handleUpdatePackageItem(idx, 'ratioPercent', parseFloat(e.target.value))}
                                                                className="w-full text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 rounded-lg px-2 py-2 text-center font-bold"
                                                            />
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="col-span-1 text-right mt-2">
                                                    <button onClick={() => handleRemoveIngredientFromPackage(idx)} className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-100/50 dark:bg-slate-800/50 p-4 rounded-xl">
                                    <div className="text-sm text-slate-600 dark:text-slate-400">
                                        Concentrate Mix Ratio: <span className={`font-bold text-lg ml-1 ${currentPackage.items.reduce((a, b) => a + (b.type === 'ROUGHAGE' || b.type === 'CONCENTRATE_FIXED' ? 0 : b.ratioPercent), 0) === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {currentPackage.items.reduce((a, b) => a + (b.type === 'ROUGHAGE' || b.type === 'CONCENTRATE_FIXED' ? 0 : b.ratioPercent), 0)}%
                                        </span>
                                        <p className="text-xs text-slate-400 mt-1 font-medium">
                                            (Target 100% for Dana mix. Roughage separate)
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wide">Estimated Mix Cost</p>
                                        <div className="flex flex-col items-end">
                                            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">Rs. {calculatePackageCost.toFixed(1)} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/kg Mix</span></p>
                                            <p className="text-xs text-slate-400 italic font-medium">+ Fixed items cost</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-3xl flex justify-end gap-3 z-10 relative">
                            <button onClick={() => setShowPackageModal(false)} disabled={isSavingPackage} className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold transition-colors">Cancel</button>
                            <button onClick={handleSavePackage} disabled={isSavingPackage} className={`px-8 py-2.5 bg-gradient-to-r ${isSavingPackage ? 'from-slate-400 to-slate-500 cursor-not-allowed' : 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'} text-white rounded-xl shadow-lg shadow-blue-500/25 font-bold transition-all flex items-center gap-2 transform ${isSavingPackage ? '' : 'hover:-translate-y-0.5'}`}>
                                {isSavingPackage ? <><Loader2 className="animate-spin" size={18} /> Saving...</> : 'Save Package'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in text-left">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md flex justify-between items-center z-10 relative">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl shadow-sm ${feed.some(f => f.id === formData.id) ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}`}>
                                    {feed.some(f => f.id === formData.id) ? <Edit2 size={20} /> : <Plus size={20} />}
                                </div>
                                {feed.some(f => f.id === formData.id) ? 'Edit Ingredient' : 'Add New Ingredient'}
                            </h3>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer hover:rotate-90 duration-300"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide text-xs">Ingredient Name</label>
                                <div className="relative group">
                                    <input
                                        list="ingredients-list"
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => handleIngredientNameChange(e.target.value)}
                                        className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 pl-11 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold placeholder:font-normal hover:border-emerald-200 dark:hover:border-emerald-800"
                                        placeholder="e.g. Maize Grain"
                                    />
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-emerald-500 transition-colors">
                                        <TrendingUp size={18} />
                                    </div>
                                </div>
                                <datalist id="ingredients-list">
                                    {PRESET_INGREDIENTS.map(i => <option key={i.name} value={i.name} />)}
                                </datalist>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide text-xs">Protein (CP %)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={formData.proteinPercent}
                                            onChange={(e) => setFormData({ ...formData, proteinPercent: Number(e.target.value) })}
                                            className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide text-xs">Energy (Mcal)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={formData.energyMcal}
                                            onChange={(e) => setFormData({ ...formData, energyMcal: Number(e.target.value) })}
                                            className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Mcal</div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide text-xs">Stock (kg)</label>
                                    <input
                                        type="number"
                                        value={formData.quantityKg}
                                        onChange={(e) => setFormData({ ...formData, quantityKg: Number(e.target.value) })}
                                        className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold hover:border-emerald-200"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide text-xs">Low Alert (kg)</label>
                                    <input
                                        type="number"
                                        value={formData.lowStockThreshold}
                                        onChange={(e) => setFormData({ ...formData, lowStockThreshold: Number(e.target.value) })}
                                        className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold hover:border-emerald-200"
                                    />
                                </div>
                            </div>

                            {canSeeCost && (
                                <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50">
                                    <div className="flex gap-6 mb-4">
                                        <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all shadow-sm ${pricingMode === 'perBag' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold transform scale-[1.02]' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-200 bg-white dark:bg-slate-900'}`}>
                                            <input
                                                type="radio"
                                                name="pricingMode"
                                                checked={pricingMode === 'perBag'}
                                                onChange={() => setPricingMode('perBag')}
                                                className="hidden"
                                            />
                                            <Package size={18} />
                                            Per Bag
                                        </label>
                                        <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all shadow-sm ${pricingMode === 'perKg' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold transform scale-[1.02]' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-200 bg-white dark:bg-slate-900'}`}>
                                            <input
                                                type="radio"
                                                name="pricingMode"
                                                checked={pricingMode === 'perKg'}
                                                onChange={() => setPricingMode('perKg')}
                                                className="hidden"
                                            />
                                            <Scale size={18} />
                                            Per KG
                                        </label>
                                    </div>

                                    {pricingMode === 'perBag' ? (
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Bag Price (Rs)</label>
                                                <input
                                                    type="number"
                                                    value={formData.bagPrice}
                                                    onChange={(e) => setFormData({ ...formData, bagPrice: Number(e.target.value) })}
                                                    className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Bag Weight (kg)</label>
                                                <input
                                                    type="number"
                                                    value={formData.bagWeight}
                                                    onChange={(e) => setFormData({ ...formData, bagWeight: Number(e.target.value) })}
                                                    className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Price Per KG (Rs)</label>
                                            <input
                                                type="number"
                                                value={formData.costPerKg}
                                                onChange={(e) => setFormData({ ...formData, costPerKg: Number(e.target.value) })}
                                                className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-3 focus:ring-0 focus:border-emerald-500 transition-all outline-none font-bold text-lg"
                                            />
                                        </div>
                                    )}

                                    {pricingMode === 'perBag' && (
                                        <div className="mt-4 flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Calculated Cost</span>
                                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xl">
                                                Rs. {(formData.bagPrice > 0 && formData.bagWeight > 0 ? formData.bagPrice / formData.bagWeight : 0).toFixed(1)}
                                                <span className="text-sm font-normal text-slate-400 ml-1">/kg</span>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-3xl flex justify-end gap-3 z-10 relative">
                            <button onClick={() => setShowAddModal(false)} className="px-6 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold transition-colors">Cancel</button>
                            <button onClick={handleSaveFeed} className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all font-bold transform hover:-translate-y-0.5">
                                <Save size={18} /> Save Ingredient
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {itemToDelete && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in text-left">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-8 border border-slate-200 dark:border-slate-800 text-center">
                        <div className="bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ring-8 ring-red-50/50 dark:ring-red-500/5">
                            <Trash2 size={32} />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Delete Ingredient?</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                            Are you sure you want to delete this ingredient? This action cannot be undone.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setItemToDelete(null)}
                                className="flex-1 py-3.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-500/30 flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
                            >
                                <Trash2 size={18} /> Delete
                            </button>
                        </div>
                    </div>
                </div>
            )
            }
        </div >
    );
};


