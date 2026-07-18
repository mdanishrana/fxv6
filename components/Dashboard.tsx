
import React, { useState } from 'react';
import { useTheme } from '../services/ThemeContext';
import {
   LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
   BarChart, Bar, Legend, AreaChart, Area, ReferenceLine, Cell, PieChart, Pie
} from 'recharts';
import { Cattle, FeedItem, Tenant, UserRole, DeletionRequest, FeedPackage, AnimalType } from '../types';
import { calculateCattleFinancials } from '../utils/financials';
import { TrendingUp, Beef, Scale, DollarSign, Download, AlertCircle, Check, X, Target, ArrowUpRight, AlertTriangle, Info, TrendingDown, Activity, Calendar, Zap, ChevronRight, Package, Users, Syringe, PieChart as PieChartIcon, BarChart3, Heart } from 'lucide-react';

interface DashboardProps {
   cattle: Cattle[];
   feed: FeedItem[];
   feedPackages: FeedPackage[];
   tenant: Tenant;
   userRole: UserRole;
   deletionRequests: DeletionRequest[];
   onApprove: (req: DeletionRequest) => void;
   onReject: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
   cattle, feed, feedPackages, tenant, userRole, deletionRequests, onApprove, onReject
}) => {
   const { isDarkMode, t } = useTheme();
   const [filterPregnant, setFilterPregnant] = useState<'ALL' | 'PREGNANT'>('ALL');
   const [filterType, setFilterType] = useState<string>('ALL');

   const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

   // Apply filters
   const displayCattle = cattle.filter(c => 
       (filterPregnant === 'ALL' || c.isPregnant) &&
       (filterType === 'ALL' || c.type === filterType)
   );

   // Calculate metrics
   const totalCattle = displayCattle.length;
   // Dynamic per-type breakdown - covers every type actually on the farm (legacy
   // Cow/Bull/Heifer/Goat/Calf/Kid or the full new Cattle/Goat/Sheep taxonomy)
   // instead of a fixed set of categories that silently omit the rest.
   const herdTypeBreakdown: { type: string; count: number }[] = Object.values(AnimalType)
       .map(t => ({ type: t as string, count: displayCattle.filter(c => c.type === t).length }))
       .filter(t => t.count > 0);

   const valuationStock = displayCattle.filter(c => ['Active', 'Ready for Sale', 'Quarantine'].includes(c.status));
   const activeCount = valuationStock.length;

   const currentStockWeight = valuationStock.reduce((acc, c) => acc + (Number(c.currentWeight) || 0), 0);
   const avgWeight = activeCount > 0 ? (currentStockWeight / activeCount).toFixed(1) : '0';

   let totalADG = 0;
   let adgCount = 0;

   valuationStock.forEach(c => {
      if (c.weightHistory && c.weightHistory.length > 1) {
         const history = [...c.weightHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
         const latest = history[0];
         const latestTime = new Date(latest.date).getTime();

         let past = history.find(h => {
            const diffDays = (latestTime - new Date(h.date).getTime()) / (1000 * 3600 * 24);
            return diffDays >= 28;
         });

         if (!past) {
            const oldest = history[history.length - 1];
            const oldestTime = new Date(oldest.date).getTime();
            const diffDays = (latestTime - oldestTime) / (1000 * 3600 * 24);

            if (diffDays >= 7) {
               past = oldest;
            }
         }

         if (past) {
            const daysDiff = (latestTime - new Date(past.date).getTime()) / (1000 * 3600 * 24);
            if (daysDiff > 0) {
               const gain = (latest.weight - past.weight) / daysDiff;
               if (gain > -0.5 && gain < 3.5) {
                  totalADG += gain;
                  adgCount++;
               }
            }
         }
      }
   });

   const avgDailyGain = adgCount > 0 ? (totalADG / adgCount).toFixed(2) : '0.00';
   const adgTrend = parseFloat(avgDailyGain) >= 0.8 ? 'good' : parseFloat(avgDailyGain) >= 0.5 ? 'moderate' : 'low';

   const readyOrNearingCount = valuationStock.filter(c => {
      const remaining = c.targetWeight - c.currentWeight;
      return remaining <= (c.targetWeight * 0.1);
   }).length;

   const herdValueRate = tenant.herdValueRate || 1100;
   const estRevenue = currentStockWeight * herdValueRate;

   const lowStockItems = feed.filter(f => f.quantityKg <= f.lowStockThreshold);

   const pendingVaccinations = displayCattle.filter(c => !c.vaccinationStatus).length;

   // ROI Analysis Calculations (with null-safe math)
   const validFeedItems = feed.filter(f => f.costPerKg != null && !isNaN(f.costPerKg));
   const avgFeedCostPerKg = validFeedItems.length > 0
      ? validFeedItems.reduce((sum, f) => sum + (f.costPerKg || 0), 0) / validFeedItems.length
      : 50; // Default Rs 50/kg if no feed data

   const roiData = valuationStock.map(c => {
      const entryTime = c.entryDate ? new Date(c.entryDate).getTime() : Date.now();
      const now = Date.now();
      const daysOnFarm = Math.max(1, Math.floor((now - entryTime) / (1000 * 3600 * 24)));
      const currentWeight = Number(c.currentWeight) || 0;
      const entryWeight = Number(c.entryWeight) || 0;
      const weightGained = Math.max(0, currentWeight - entryWeight);

      // Use true financial calculation for 100% consistent cost logic
      const trueFinancials = calculateCattleFinancials(c, tenant, feedPackages, feed);
      const totalFeedCost = trueFinancials.feedCost;

      return {
         tagNumber: c.tagNumber,
         daysOnFarm,
         weightGained: Math.round(weightGained),
         totalFeedCost: Math.round(totalFeedCost) || 0,
         costPerKgGained: weightGained > 0 ? Math.round(totalFeedCost / weightGained) : -1,
         purchasePrice: Number(c.purchasePrice) || 0,
         currentValue: currentWeight * herdValueRate,
      };
   });
   
   // Sort cows from best performing (lowest Cost/Kg) to worst performing (-1 or Infinity means no gain, effectively worst).
   const sortedRoiData = [...roiData].sort((a, b) => {
      // If both lost/gained 0, they tie.
      if (a.costPerKgGained === -1 && b.costPerKgGained === -1) return 0;
      // If a lost/gained 0 but b gained weight, b is vastly vastly better (closer to the top).
      if (a.costPerKgGained === -1) return 1;
      if (b.costPerKgGained === -1) return -1;
      
      // If both gained weight, the lower cost/kg wins.
      return a.costPerKgGained - b.costPerKgGained;
   });

   const totalWeightGained = roiData.reduce((sum, r) => sum + (r.weightGained || 0), 0);
   const totalFeedCostAll = roiData.reduce((sum, r) => sum + (r.totalFeedCost || 0), 0);
   const avgCostPerKgGained = totalWeightGained > 0 ? Math.round(totalFeedCostAll / totalWeightGained) : 0;
   const totalPurchaseCost = roiData.reduce((sum, r) => sum + (r.purchasePrice || 0), 0);
   const totalCurrentValue = roiData.reduce((sum, r) => sum + (r.currentValue || 0), 0);
   const totalInvestment = totalPurchaseCost + totalFeedCostAll;
   const valueCreated = totalCurrentValue - totalInvestment;
   const roiPercent = totalInvestment > 0 ? ((valueCreated / totalInvestment) * 100).toFixed(1) : '0';

   const statusDistribution = [
      { name: 'Active', value: displayCattle.filter(c => c.status === 'Active').length, color: '#10b981' },
      { name: 'Ready for Sale', value: displayCattle.filter(c => c.status === 'Ready for Sale').length, color: '#3b82f6' },
      { name: 'Quarantine', value: displayCattle.filter(c => c.status === 'Quarantine').length, color: '#f59e0b' },
      { name: 'Sold', value: displayCattle.filter(c => c.status === 'Sold').length, color: '#6b7280' },
   ].filter(s => s.value > 0);

   const branchDistribution = (() => {
       const counts: Record<string, number> = { 'Main Farm': 0 };
       (tenant.branches || []).forEach(b => counts[b] = 0);
       
       displayCattle.forEach(c => {
           const b = c.branch || 'Main Farm';
           if (counts[b] !== undefined) counts[b]++;
           else counts[b] = 1;
       });

       return Object.entries(counts).filter(([_, val]) => val > 0).map(([name, value], i) => {
           const colors = ['#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#eab308', '#6366f1'];
           return { name, value, color: colors[i % colors.length] };
       });
   })();

   // Breeding & Reproduction KPIs
   const showBreedingKPIs = ['COW', 'GOAT', 'HEIFER', 'SHEEP'].includes(filterType.toUpperCase());
   const breedingFemales = showBreedingKPIs ? displayCattle.filter(c => c.gender === 'Female' || c.type === 'Cow' || c.type === 'Heifer') : [];
   const pregnantCount = breedingFemales.filter(c => c.isPregnant).length;
   const pregnancyRate = breedingFemales.length > 0 ? ((pregnantCount / breedingFemales.length) * 100).toFixed(1) : '0.0';
   const openFemalesCount = breedingFemales.length - pregnantCount;
   
   const now = new Date().getTime();
   const thirtyDaysFromNow = now + (30 * 24 * 60 * 60 * 1000);
   const upcomingBirths = breedingFemales.filter(c => {
       if (!c.expectedCalvingDate) return false;
       const expectedDate = new Date(c.expectedCalvingDate).getTime();
       return expectedDate >= now && expectedDate <= thirtyDaysFromNow;
   }).length;

   const growthData = activeCount > 0 && displayCattle[0].weightHistory.length > 0
      ? displayCattle[0].weightHistory.map((_, index) => {
         const dayPoint: any = { name: `Day ${index * 15}` };
         const topPerformers = [...valuationStock].sort((a, b) => b.currentWeight - a.currentWeight).slice(0, 5);

         topPerformers.forEach(c => {
            if (c.weightHistory[index]) {
               dayPoint[c.tagNumber] = c.weightHistory[index].weight;
            }
         });
         return dayPoint;
      })
      : [];

   // Dairy & Lactation KPIs
   const showDairyKPIs = showBreedingKPIs; // Same visibility rule
   const lactatingAnimals = displayCattle.filter(c => c.isLactating);
   const totalDailyMilk = lactatingAnimals.reduce((sum, c) => sum + (Number(c.currentDailyMilkYield) || 0), 0);
   const avgDailyMilk = lactatingAnimals.length > 0 ? (totalDailyMilk / lactatingAnimals.length).toFixed(1) : '0.0';
   
   let topProducer = { tagNumber: '-', yield: 0 };
   lactatingAnimals.forEach(c => {
       const y = Number(c.currentDailyMilkYield) || 0;
       if (y > topProducer.yield) topProducer = { tagNumber: c.tagNumber, yield: y };
   });

   // Health & Risk KPIs
   const sickAnimalsCount = displayCattle.filter(c => c.status === 'Sick' || c.status === 'Quarantine').length;
   const deadAnimalsCount = displayCattle.filter(c => c.status === 'Dead').length;
   // Consider total historical animals = displayCattle.length
   const mortalityRate = displayCattle.length > 0 ? ((deadAnimalsCount / displayCattle.length) * 100).toFixed(1) : '0.0';

   // Additional Financial KPIs (Harvest Profit)
   const harvestReadyStock = displayCattle.filter(c => {
       const remaining = c.targetWeight - c.currentWeight;
       return remaining <= (c.targetWeight * 0.1) && c.status === 'Active';
   });
   
   const harvestReadyValue = harvestReadyStock.reduce((sum, c) => sum + (c.currentWeight * herdValueRate), 0);
   // Estimate cost for harvest ready
   const harvestReadyCost = harvestReadyStock.reduce((sum, c) => {
       const financials = calculateCattleFinancials(c, tenant, feedPackages, feed);
       return sum + Number(c.purchasePrice) + financials.feedCost;
   }, 0);
   const projectedHarvestProfit = harvestReadyValue - harvestReadyCost;

   const dailyHerdIntake = currentStockWeight * 0.03;

   const feedData = feed.map(f => {
      const estDaysRemaining = dailyHerdIntake > 0 ? Math.round(f.quantityKg / (dailyHerdIntake * 0.5)) : 99;
      const percentage = f.lowStockThreshold > 0 ? Math.min((f.quantityKg / f.lowStockThreshold) * 100, 100) : 100;

      return {
         name: f.name.length > 20 ? f.name.substring(0, 20) + '...' : f.name,
         fullName: f.name,
         stock: f.quantityKg,
         threshold: f.lowStockThreshold,
         status: f.quantityKg <= f.lowStockThreshold ? 'critical' : f.quantityKg <= f.lowStockThreshold * 1.5 ? 'warning' : 'good',
         daysRemaining: estDaysRemaining,
         percentage
      };
   }).slice(0, 6);

   const currencySymbol = tenant.currency === 'PKR' ? 'Rs.' :
      tenant.currency === 'USD' ? '$' :
         tenant.currency === 'EUR' ? '€' :
            tenant.currency === 'GBP' ? '£' :
               tenant.currency === 'INR' ? '₹' : 'Rs.';
   const weightUnit = tenant.weightUnit || 'kg';
   const showFinance = (tenant.modules.includes('FINANCE') || tenant.modules.includes('CORE')) && (userRole === 'OWNER' || userRole === 'MANAGER');

   const handleExportCSV = () => {
      const headers = [
         'Tag Number', 'Name', 'Breed', 'Gender', 'Teeth', 'Status',
         `Current Weight (${weightUnit})`, `Target Weight (${weightUnit})`, `Daily Gain Goal (${weightUnit})`,
         'Entry Date', `Entry Weight (${weightUnit})`, `Purchase Price (${currencySymbol})`,
         'Owner Name', 'Owner Mobile', 'Package',
         'Vaccination Status', 'Notes',
         'Weight History', 'Vaccination History'
      ];

      const csvContent = [
         headers.join(','),
         ...displayCattle.map(c => {
            const wHist = c.weightHistory.map(w => `${w.date}:${w.weight}`).join(' | ');
            const vHist = c.vaccinationHistory.map(v => `${v.date}:${v.vaccineName}`).join(' | ');

            return [
               c.tagNumber,
               c.name || '',
               c.breed,
               c.gender,
               c.teeth,
               c.status,
               c.currentWeight,
               c.targetWeight,
               c.dailyTargetGain || '',
               c.entryDate,
               c.entryWeight,
               c.purchasePrice,
               `"${c.ownerName}"`,
               c.ownerMobile || '',
               c.monthlyPackageId,
               c.vaccinationStatus ? 'Yes' : 'No',
               `"${(c.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
               `"${wHist}"`,
               `"${vHist}"`
            ].join(',');
         })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `herd_report_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
   };

   const CustomGrowthTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
         return (
            <div className="bg-slate-900 p-4 border border-slate-700 rounded-xl shadow-2xl">
               <p className="text-xs font-bold text-slate-400 uppercase mb-2">{label}</p>
               {payload.map((entry: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 mb-1 text-sm">
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                     <span className="font-medium text-slate-300">{entry.name}:</span>
                     <span className="font-bold text-white">{entry.value} kg</span>
                  </div>
               ))}
            </div>
         );
      }
      return null;
   };

   const CustomFeedTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
         const data = payload[0].payload;
         return (
            <div className="bg-slate-900 p-4 border border-slate-700 rounded-xl shadow-2xl">
               <p className="font-bold text-white mb-2">{data.fullName || label}</p>
               <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-4">
                     <span className="text-slate-400">Current Stock:</span>
                     <span className={`font-bold ${data.status === 'critical' ? 'text-red-400' : data.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {data.stock.toLocaleString()} kg
                     </span>
                  </div>
                  <div className="flex justify-between gap-4">
                     <span className="text-slate-400">Reorder Level:</span>
                     <span className="text-slate-300">{data.threshold.toLocaleString()} kg</span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-slate-700">
                     <span className="text-xs text-slate-500 block">Est. Duration:</span>
                     <span className="font-bold text-white">~{data.daysRemaining} Days</span>
                  </div>
               </div>
            </div>
         );
      }
      return null;
   };

   const formatCurrency = (value: number) => {
      if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
      if (value >= 100000) return `${(value / 100000).toFixed(2)} Lac`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toLocaleString();
   };

   return (
      <div className="space-y-6 animate-fade-in relative z-10">
         {/* Enhanced Header Section */}
         <div className={`relative overflow-hidden p-8 rounded-3xl shadow-xl transition-all duration-300 border ${
            isDarkMode 
               ? 'bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white border-slate-800/50 shadow-slate-950/20' 
               : 'bg-gradient-to-br from-emerald-50/40 via-teal-50/20 to-cyan-50/10 text-slate-850 border-emerald-100/50 shadow-slate-100'
         }`}>
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[80px] -ml-24 -mb-24 pointer-events-none"></div>
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-20 pointer-events-none"></div>

            <div className="relative flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
               <div className="flex-1">
                  <div className="flex items-center gap-5 mb-3">
                     <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25 border border-white/10 backdrop-blur-sm group hover:scale-105 transition-transform duration-300">
                        <Beef size={32} className="text-white drop-shadow-md" />
                     </div>
                     <div>
                        <h2 className={`text-3xl lg:text-4xl font-bold tracking-tight mb-1 drop-shadow-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{tenant.name}</h2>
                        <div className="flex items-center gap-3">
                           <span className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider backdrop-blur-sm ${
                              isDarkMode 
                                 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                 : 'bg-emerald-100/80 text-emerald-700 border border-emerald-200'
                           }`}>{tenant.tier} Plan</span>
                           <span className={`text-sm font-medium flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-650'}`}>
                              <span className={`w-1 h-1 rounded-full ${isDarkMode ? 'bg-slate-500' : 'bg-slate-400'}`}></span>
                              Owner: {tenant.ownerName}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="flex flex-wrap items-center gap-4 self-end lg:self-center">
                  <div className={`backdrop-blur-md rounded-2xl shadow-lg border px-2 py-1 flex items-center ${
                     isDarkMode 
                        ? 'bg-white/5 border-white/10' 
                        : 'bg-emerald-100/30 border-emerald-100/50'
                  }`}>
                     <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className={`bg-transparent border-none outline-none font-bold text-sm cursor-pointer py-3 px-2 ${
                           isDarkMode ? 'text-white' : 'text-emerald-800'
                        }`}
                     >
                        <option className="text-black" value="ALL">All Types</option>
                        {Object.values(AnimalType).map(t => <option className="text-black" key={t} value={t}>{t}</option>)}
                     </select>
                     
                     <div className={`w-px h-6 mx-2 ${isDarkMode ? 'bg-white/20' : 'bg-emerald-200'}`}></div>

                     <select
                        value={filterPregnant}
                        onChange={(e) => setFilterPregnant(e.target.value as 'ALL' | 'PREGNANT')}
                        className={`bg-transparent border-none outline-none font-bold text-sm cursor-pointer py-3 px-2 ${
                           isDarkMode ? 'text-white' : 'text-emerald-800'
                        }`}
                     >
                        <option className="text-black" value="ALL">All Females/Males</option>
                        <option className="text-black" value="PREGNANT">🤰 Pregnant Only</option>
                     </select>
                  </div>
                  <div className={`text-center px-8 py-4 backdrop-blur-md rounded-2xl transition-colors shadow-lg border ${
                     isDarkMode 
                        ? 'bg-white/5 hover:bg-white/10 border-white/10 shadow-black/5' 
                        : 'bg-emerald-100/30 hover:bg-emerald-100/50 border-emerald-100/50 shadow-slate-100'
                  }`}>
                     <div className={`text-5xl font-black filter drop-shadow-sm ${
                        isDarkMode 
                           ? 'bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 bg-clip-text text-transparent' 
                           : 'text-emerald-700'
                     }`}>{totalCattle}</div>
                     <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-650'}`}>{t ? t('total_heads') : 'Total Heads'}</div>
                  </div>
                  {showFinance && (
                     <button
                        onClick={handleExportCSV}
                        className={`p-4 rounded-2xl transition-all duration-200 backdrop-blur-md shadow-lg group border ${
                           isDarkMode 
                              ? 'bg-white/5 hover:bg-white/10 active:bg-white/20 text-slate-300 hover:text-white border-white/10 hover:border-white/20' 
                              : 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 hover:text-slate-900 border-slate-200'
                        }`}
                        title="Download Full Report"
                     >
                        <Download size={24} className="group-hover:scale-110 transition-transform" />
                     </button>
                  )}
               </div>
            </div>
         </div>

         {lowStockItems.length > 0 && (
            <div className="bg-red-50/50 dark:bg-red-900/10 border-l-4 border-red-500 rounded-r-xl p-5 shadow-sm animate-in fade-in slide-in-from-top-2">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                  <h3 className="text-base font-bold text-red-800 dark:text-red-400 flex items-center gap-2">
                     <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-md">
                        <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
                     </div>
                     Critical Feed Alerts
                  </h3>
                  <button className="text-[10px] font-bold text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 px-3 py-1.5 rounded-md transition-colors uppercase tracking-wide">
                     Review Inventory &rarr;
                  </button>
               </div>
               <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {lowStockItems.map(item => (
                     <div key={item.id} className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-lg border border-red-100 dark:border-red-900/30 shadow-sm hover:shadow-md transition-shadow">
                        <div>
                           <span className="font-semibold text-slate-800 dark:text-slate-200 block text-sm">{item.name}</span>
                           <span className="text-xs text-slate-400 dark:text-slate-500">Threshold: {item.lowStockThreshold.toLocaleString()} kg</span>
                        </div>
                        <div className="text-right">
                           <span className="text-red-600 dark:text-red-400 font-bold text-base">{item.quantityKg.toLocaleString()}</span>
                           <span className="text-[10px] text-slate-400 dark:text-slate-500 block">kg left</span>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         )}

         {userRole === 'OWNER' && deletionRequests && deletionRequests.length > 0 && (
            <div className="bg-amber-50/50 dark:bg-amber-900/10 border-l-4 border-amber-500 rounded-r-xl p-5 shadow-sm animate-in fade-in slide-in-from-top-2">
               <h3 className="text-base font-bold text-amber-800 dark:text-amber-400 mb-3 flex items-center gap-2">
                  <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-md">
                     <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  Pending Approvals ({deletionRequests.length})
               </h3>
               <div className="space-y-2">
                  {deletionRequests.map(req => (
                     <div key={req.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30 flex flex-col sm:flex-row justify-between items-center gap-3 shadow-sm">
                        <div>
                           <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                              <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mr-2">{req.type}</span>
                              Delete: <strong>{req.targetName}</strong>
                           </p>
                           <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              By {req.requestedBy} on {new Date(req.date).toLocaleDateString()}
                           </p>
                        </div>
                        <div className="flex gap-2">
                           <button
                              onClick={() => onApprove(req)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-colors shadow-sm"
                           >
                              <Check size={14} /> Approve
                           </button>
                           <button
                              onClick={() => onReject(req.id)}
                              className="bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-colors"
                           >
                              <X size={14} /> Reject
                           </button>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         )}

         {/* Section 1: Value & Operations */}
         <div className="space-y-4">
            <div className="flex justify-between items-end px-2">
               <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/50"></div>
                  Value & Operations
               </h3>
               <span className="text-[10px] font-medium text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full">Updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               {/* Hero KPI: Estimated Herd Value */}
               {showFinance && (
                  <div className="group md:col-span-1 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(251,191,36,0.15)] hover:shadow-[0_8px_30px_rgb(251,191,36,0.3)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden backdrop-blur-sm">
                     <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-10 -mt-10 blur-2xl"></div>
                     <div className="flex items-start justify-between mb-6 relative">
                        <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl text-white shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                           <DollarSign className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white dark:bg-black/20 backdrop-blur-md text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-800/50 shadow-sm">
                           Est. Value
                        </span>
                     </div>
                     <div className="relative mt-2">
                        <p className="text-4xl font-black text-slate-900 dark:text-white tracking-tight drop-shadow-sm">
                           <span className="text-lg text-amber-600/80 dark:text-amber-500 font-bold mr-1">{currencySymbol}</span>
                           {formatCurrency(estRevenue)}
                        </p>
                        <p className="text-xs text-amber-900/60 dark:text-amber-400/70 font-bold uppercase mt-2 tracking-wider flex items-center gap-1">
                           Live Wt <span className="w-1 h-1 bg-amber-400 rounded-full"></span> Market Rate
                        </p>
                     </div>
                  </div>
               )}

               {/* Active Stock */}
               <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.15)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                  <div className="flex items-start justify-between mb-6 relative">
                     <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-emerald-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                        <Beef className="w-6 h-6" />
                     </div>
                     <span className="text-[10px] bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Live Inventory</span>
                  </div>
                  <div className="relative">
                     <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Active Heads</p>
                     <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{activeCount}</p>
                     <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Animals currently on farm</p>
                  </div>
               </div>

               {/* Harvest Ready */}
               <div className="group bg-gradient-to-br from-orange-50 via-red-50 to-orange-50 dark:from-orange-950/40 dark:to-red-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(249,115,22,0.15)] hover:shadow-[0_8px_30px_rgb(249,115,22,0.3)] border border-orange-100 dark:border-orange-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-orange-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                  <div className="flex items-start justify-between mb-6 relative">
                     <div className="p-3 bg-white dark:bg-slate-800 border border-orange-100 dark:border-orange-900/50 text-orange-600 dark:text-orange-400 rounded-2xl relative shadow-md group-hover:scale-110 transition-transform duration-300">
                        <Target className="w-6 h-6" />
                        {readyOrNearingCount > 0 && <span className="absolute top-0 right-0 -mt-1 -mr-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>}
                     </div>
                     <span className="text-[10px] bg-white/60 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Harvest Goal</span>
                  </div>
                  <div className="relative">
                     <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Harvest Ready</p>
                     <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{readyOrNearingCount}</p>
                     <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Within 10% of target weight</p>
                  </div>
               </div>

               {/* Herd Breakdown */}
               <div className="group bg-gradient-to-br from-purple-50 via-fuchsia-50 to-purple-50 dark:from-purple-950/40 dark:to-fuchsia-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(168,85,247,0.15)] hover:shadow-[0_8px_30px_rgb(168,85,247,0.3)] border border-purple-100 dark:border-purple-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-purple-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                  <div className="flex items-start justify-between mb-4 relative">
                     <div className="p-3 bg-white dark:bg-slate-800 border border-purple-100 dark:border-purple-900/50 text-purple-600 dark:text-purple-400 rounded-2xl relative shadow-md group-hover:scale-110 transition-transform duration-300">
                        <Users className="w-6 h-6" />
                     </div>
                     <span className="text-[10px] bg-white/60 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Herd Breakdown</span>
                  </div>
                  <div className="relative grid grid-cols-2 gap-y-2 gap-x-4 max-h-40 overflow-y-auto">
                     {herdTypeBreakdown.map(({ type, count }) => (
                        <div key={type} className="flex justify-between items-end border-b border-purple-200/50 dark:border-purple-800/30 pb-1">
                           <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{type}</span>
                           <span className="font-black text-slate-800 dark:text-slate-100 text-lg leading-none">{count}</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>

         {/* Breeding & Reproduction KPIs */}
         {showBreedingKPIs && (
            <div className="space-y-4 mb-8">
               <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-pink-500 rounded-full shadow-sm shadow-pink-500/50"></div>
                  Breeding & Reproduction
               </h3>
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {/* Pregnancy Rate */}
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 hover:border-pink-100 dark:hover:border-pink-900/50 transition-all duration-300 hover:-translate-y-1 group">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                           <div className="p-3 bg-pink-50 dark:bg-pink-900/30 rounded-2xl text-pink-500 dark:text-pink-400 group-hover:scale-110 transition-transform duration-300">
                              <Heart className="w-6 h-6" />
                           </div>
                           <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pregnancy Rate</span>
                        </div>
                     </div>
                     <p className="text-3xl font-black text-pink-600 dark:text-pink-400 tracking-tight">
                        {pregnancyRate}%
                     </p>
                     <p className="text-xs text-slate-400 font-medium mt-2">
                        {pregnantCount} out of {breedingFemales.length} females
                     </p>
                  </div>

                  {/* Upcoming Births */}
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 hover:border-amber-100 dark:hover:border-amber-900/50 transition-all duration-300 hover:-translate-y-1 group">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                           <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-2xl text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform duration-300">
                              <Calendar className="w-6 h-6" />
                           </div>
                           <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Due in 30 Days</span>
                        </div>
                     </div>
                     <p className="text-3xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                        {upcomingBirths}
                     </p>
                     <p className="text-xs text-slate-400 font-medium mt-2">
                        Upcoming calvings/kiddings
                     </p>
                  </div>

                  {/* Open Females */}
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 hover:border-indigo-100 dark:hover:border-indigo-900/50 transition-all duration-300 hover:-translate-y-1 group">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                           <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                              <Activity className="w-6 h-6" />
                           </div>
                           <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Open (Empty)</span>
                        </div>
                     </div>
                     <p className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                        {openFemalesCount}
                     </p>
                     <p className="text-xs text-slate-400 font-medium mt-2">
                        Non-pregnant females
                     </p>
                  </div>
               </div>
            </div>
         )}

         {/* Dairy & Lactation KPIs */}
         {showDairyKPIs && lactatingAnimals.length > 0 && (
            <div className="space-y-4 mb-8">
               <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-teal-500 rounded-full shadow-sm shadow-teal-500/50"></div>
                  Dairy & Lactation
               </h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Avg Daily Yield */}
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 hover:border-teal-100 dark:hover:border-teal-900/50 transition-all duration-300 hover:-translate-y-1 group">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                           <div className="p-3 bg-teal-50 dark:bg-teal-900/30 rounded-2xl text-teal-500 dark:text-teal-400 group-hover:scale-110 transition-transform duration-300">
                              <Activity className="w-6 h-6" />
                           </div>
                           <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Avg Daily Yield</span>
                        </div>
                     </div>
                     <p className="text-3xl font-black text-teal-600 dark:text-teal-400 tracking-tight">
                        {avgDailyMilk} <span className="text-sm font-medium">Liters/Day</span>
                     </p>
                     <p className="text-xs text-slate-400 font-medium mt-2">
                        Across {lactatingAnimals.length} lactating females
                     </p>
                  </div>

                  {/* Top Producer */}
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 hover:border-emerald-100 dark:hover:border-emerald-900/50 transition-all duration-300 hover:-translate-y-1 group">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                           <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl text-emerald-500 dark:text-emerald-400 group-hover:scale-110 transition-transform duration-300">
                              <TrendingUp className="w-6 h-6" />
                           </div>
                           <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Top Producer</span>
                        </div>
                     </div>
                     <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                        {topProducer.tagNumber}
                     </p>
                     <p className="text-xs text-slate-400 font-medium mt-2">
                        Peak Yield: {topProducer.yield} Liters/Day
                     </p>
                  </div>
               </div>
            </div>
         )}

         {/* Health & Risk KPIs */}
         <div className="space-y-4 mb-8">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
               <div className="w-1.5 h-4 bg-red-500 rounded-full shadow-sm shadow-red-500/50"></div>
               Health & Risk
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
               {/* Active Treatments */}
               <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 hover:border-orange-100 dark:hover:border-orange-900/50 transition-all duration-300 hover:-translate-y-1 group">
                  <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-4">
                        <div className="p-3 bg-orange-50 dark:bg-orange-900/30 rounded-2xl text-orange-500 dark:text-orange-400 group-hover:scale-110 transition-transform duration-300">
                           <AlertTriangle className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Active Treatments</span>
                     </div>
                  </div>
                  <p className="text-3xl font-black text-orange-600 dark:text-orange-400 tracking-tight">
                     {sickAnimalsCount}
                  </p>
                  <p className="text-xs text-slate-400 font-medium mt-2">
                     Sick or Quarantined animals
                  </p>
               </div>

               {/* Mortality Rate */}
               <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 hover:border-red-100 dark:hover:border-red-900/50 transition-all duration-300 hover:-translate-y-1 group">
                  <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-2xl text-red-500 dark:text-red-400 group-hover:scale-110 transition-transform duration-300">
                           <Info className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Mortality Rate</span>
                     </div>
                  </div>
                  <p className="text-3xl font-black text-red-600 dark:text-red-400 tracking-tight">
                     {mortalityRate}%
                  </p>
                  <p className="text-xs text-slate-400 font-medium mt-2">
                     Lost animals: {deadAnimalsCount}
                  </p>
               </div>
            </div>
         </div>

         {/* Section 2: Growth Performance */}
         <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
               <div className="w-1.5 h-4 bg-indigo-500 rounded-full shadow-sm shadow-indigo-500/50"></div>
               Growth Metrics
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
               {/* Avg Weight */}
               <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(99,102,241,0.15)] border border-slate-100 dark:border-slate-700 hover:border-indigo-100 dark:hover:border-indigo-900/50 transition-all duration-300 hover:-translate-y-1 group">
                  <div className="flex items-center gap-4 mb-4">
                     <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                        <Scale className="w-6 h-6" />
                     </div>
                     <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Avg Weight</span>
                  </div>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{avgWeight} <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">kg</span></p>
               </div>

               {/* ADG */}
               <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.15)] border border-slate-100 dark:border-slate-700 hover:border-emerald-100 dark:hover:border-emerald-900/50 transition-all duration-300 hover:-translate-y-1 group">
                  <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl group-hover:scale-110 transition-transform duration-300 ${adgTrend === 'good' ? 'bg-emerald-50 text-emerald-500' : adgTrend === 'moderate' ? 'bg-amber-50 text-amber-500' : 'bg-red-50 text-red-500'}`}>
                           <TrendingUp className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Daily Gain (30d)</span>
                     </div>
                  </div>
                  <p className={`text-3xl font-black ${adgTrend === 'good' ? 'text-emerald-600 dark:text-emerald-400' : adgTrend === 'moderate' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'} tracking-tight`}>
                     {avgDailyGain} <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">kg/day</span>
                  </p>
               </div>

               {/* Total Mass */}
               <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(6,182,212,0.15)] border border-slate-100 dark:border-slate-700 hover:border-cyan-100 dark:hover:border-cyan-900/50 transition-all duration-300 hover:-translate-y-1 group">
                  <div className="flex items-center gap-4 mb-4">
                     <div className="p-3 bg-cyan-50 dark:bg-cyan-900/30 rounded-2xl text-cyan-500 dark:text-cyan-400 group-hover:scale-110 transition-transform duration-300">
                        <BarChart3 className="w-6 h-6" />
                     </div>
                     <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Live Mass</span>
                  </div>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{currentStockWeight.toLocaleString()} <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">kg</span></p>
               </div>
            </div>
         </div>

         <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            {/* Total Weight Card */}
            <div className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] hover:shadow-[0_8px_30px_rgb(232,121,249,0.15)] border border-slate-100 dark:border-slate-700 hover:border-purple-200 dark:hover:border-purple-900/50 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-full">
               <div className="flex justify-between items-start mb-2">
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                     <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
               </div>
               <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">Total Weight</p>
                  <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 truncate">{currentStockWeight.toLocaleString()} <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500">kg</span></p>
               </div>
            </div>

            {/* Status Types Card */}
            <div className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] hover:shadow-[0_8px_30px_rgb(34,211,238,0.15)] border border-slate-100 dark:border-slate-700 hover:border-cyan-200 dark:hover:border-cyan-900/50 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-full">
               <div className="flex justify-between items-start mb-2">
                  <div className="p-3 bg-cyan-50 dark:bg-cyan-900/30 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                     <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
               </div>
               <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">Status Types</p>
                  <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100">{statusDistribution.length} <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500">Types</span></p>
               </div>
            </div>

            {/* Vaccines Card */}
            <div className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] hover:shadow-[0_8px_30px_rgb(248,113,113,0.15)] border border-slate-100 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-900/50 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-full">
               <div className="flex justify-between items-start mb-2">
                  <div className={`p-3 rounded-2xl group-hover:scale-110 transition-transform duration-300 ${pendingVaccinations > 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                     <Syringe className="w-5 h-5" />
                  </div>
               </div>
               <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">Vaccines Due</p>
                  <p className={`text-xl sm:text-2xl font-black ${pendingVaccinations > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{pendingVaccinations}</p>
               </div>
            </div>

            {/* Feed Alerts Card */}
            <div className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] hover:shadow-[0_8px_30px_rgb(251,191,36,0.15)] border border-slate-100 dark:border-slate-700 hover:border-amber-200 dark:hover:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-full">
               <div className="flex justify-between items-start mb-2">
                  <div className={`p-3 rounded-2xl group-hover:scale-110 transition-transform duration-300 ${lowStockItems.length > 0 ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                     <Zap className="w-5 h-5" />
                  </div>
               </div>
               <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">Feed Alerts</p>
                  <p className={`text-xl sm:text-2xl font-black ${lowStockItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{lowStockItems.length}</p>
               </div>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 flex flex-col transition-all duration-300 hover:shadow-lg">
               <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                  <div>
                     <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        Growth Trajectory
                     </h3>
                     <p className="text-sm text-slate-400 dark:text-slate-500 ml-4">Top 5 performers weight trend</p>
                  </div>
                  <span className="text-xs bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full font-bold uppercase tracking-wider w-fit">Last 90 Days</span>
               </div>
               <div className="flex-1 min-h-[220px] sm:min-h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={growthData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                           <linearGradient id="colorWeightNew" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#f1f5f9'} />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomGrowthTooltip />} />
                        {activeCount > 0 && Object.keys(growthData[0] || {}).filter(k => k !== 'name').map((key, idx) => (
                           <Area
                              key={key}
                              type="monotone"
                              dataKey={key}
                              stroke={`hsl(${(idx * 45) + 150}, 70%, 45%)`}
                              fillOpacity={1}
                              fill={`url(#colorWeightNew)`}
                              strokeWidth={3}
                              activeDot={{ r: 6, strokeWidth: 4, stroke: "#fff", fill: `hsl(${(idx * 45) + 150}, 70%, 45%)` }}
                           />
                        ))}
                     </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 flex flex-col transition-all duration-300 hover:shadow-lg">
               <div className="flex justify-between items-center mb-6">
                  <div>
                     <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        Feed Inventory
                     </h3>
                     <p className="text-sm text-slate-400 dark:text-slate-500 ml-4">Current stock levels</p>
                  </div>
                  <span className={`text-xs px-4 py-1.5 rounded-full font-bold uppercase tracking-wider ${lowStockItems.length > 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                     {lowStockItems.length > 0 ? `${lowStockItems.length} Low` : 'All Good'}
                  </span>
               </div>
               <div className="flex-1 min-h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={feedData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDarkMode ? '#334155' : '#f1f5f9'} />
                        <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" width={90} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomFeedTooltip />} cursor={{ fill: isDarkMode ? '#1e293b' : '#f8fafc', radius: 8 }} />
                        <Bar dataKey="stock" name="Stock (kg)" radius={[0, 8, 8, 0]} barSize={24}>
                           {feedData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.status === 'critical' ? '#ef4444' : entry.status === 'warning' ? '#f59e0b' : '#10b981'} />
                           ))}
                        </Bar>
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
         </div>

         {statusDistribution.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700">
               <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                  Herd Status Distribution
               </h3>
               <div className="flex flex-wrap gap-4 justify-center">
                  {statusDistribution.map((status, idx) => (
                     <div key={idx} className="group flex items-center gap-4 bg-white dark:bg-slate-900/50 px-5 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                        <div className="w-3 h-3 rounded-full ring-4 ring-white dark:ring-slate-800 shadow-sm" style={{ backgroundColor: status.color }}></div>
                        <div>
                           <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{status.name}</p>
                           <p className="text-xs text-slate-400 font-medium">{status.value} heads <span className="text-slate-300 mx-1">•</span> {totalCattle > 0 ? ((status.value / totalCattle) * 100).toFixed(0) : 0}%</p>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         )}

         {branchDistribution.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-700">
               <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  Branch Location Distribution
               </h3>
               <div className="flex flex-wrap gap-4 justify-center">
                  {branchDistribution.map((branch, idx) => (
                     <div key={idx} className="group flex items-center gap-4 bg-white dark:bg-slate-900/50 px-5 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                        <div className="w-3 h-3 rounded-full ring-4 ring-white dark:ring-slate-800 shadow-sm" style={{ backgroundColor: branch.color }}></div>
                        <div>
                           <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{branch.name}</p>
                           <p className="text-xs text-slate-400 font-medium">{branch.value} heads <span className="text-slate-300 mx-1">•</span> {totalCattle > 0 ? ((branch.value / totalCattle) * 100).toFixed(0) : 0}%</p>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         )}

         {showFinance && activeCount > 0 && (
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50/80 via-purple-50/80 to-pink-50/80 dark:from-indigo-950/20 dark:to-purple-950/20 p-8 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-indigo-100/50 dark:border-indigo-900/30 transition-all duration-500 hover:shadow-xl">
               <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-indigo-200/20 to-purple-200/20 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

               <div className="relative z-10 flex items-center gap-4 mb-8">
                  <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl text-white shadow-lg shadow-indigo-500/30">
                     <BarChart3 size={24} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Feed Cost vs Weight Gain ROI</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Financial performance analysis of your active herd</p>
                  </div>
               </div>

               <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-white dark:bg-slate-800/80 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                     <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-2">Total Feed Cost</p>
                     <p className="text-2xl font-black text-red-500 dark:text-red-400 tracking-tight">{currencySymbol} {formatCurrency(totalFeedCostAll)}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800/80 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                     <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-2">Weight Gained</p>
                     <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{totalWeightGained.toLocaleString()} <span className="text-sm text-slate-400 font-bold">kg</span></p>
                  </div>
                  <div className="bg-white dark:bg-slate-800/80 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                     <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-2">Cost/kg Gained</p>
                     <p className="text-2xl font-black text-slate-800 dark:text-slate-200 tracking-tight">{currencySymbol} {avgCostPerKgGained}</p>
                  </div>
                  <div className={`p-5 rounded-2xl shadow-lg shadow-emerald-500/20 backdrop-blur-md border border-white/20 ${parseFloat(roiPercent) >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white' : 'bg-gradient-to-br from-red-500 to-rose-600 text-white'}`}>
                     <p className="text-xs text-white/90 font-bold uppercase tracking-widest mb-2">ROI</p>
                     <p className="text-3xl font-black tracking-tight">{roiPercent}%</p>
                  </div>
               </div>

               <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 shadow-sm border border-slate-200/50 dark:border-slate-700/50 transition-colors">
                  <div className="flex items-center justify-between text-sm mb-4">
                     <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Investment Breakdown</span>
                     <span className={`font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wide ${valueCreated >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                        Net: {currencySymbol} {formatCurrency(Math.abs(valueCreated))} {valueCreated >= 0 ? 'Gain' : 'Loss'}
                     </span>
                  </div>
                  <div className="space-y-3">
                     <div className="flex justify-between items-center text-sm group">
                        <span className="text-slate-600 dark:text-slate-400 font-medium group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">Purchase Cost</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{currencySymbol} {formatCurrency(totalPurchaseCost)}</span>
                     </div>
                     <div className="flex justify-between items-center text-sm group">
                        <span className="text-slate-600 dark:text-slate-400 font-medium group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">Estimated Feed Cost</span>
                        <span className="font-bold text-red-500 dark:text-red-400">- {currencySymbol} {formatCurrency(totalFeedCostAll)}</span>
                     </div>
                     <div className="border-t border-slate-200 dark:border-slate-700/50 pt-3 flex justify-between items-center text-sm">
                        <span className="text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-xs">Total Investment</span>
                        <span className="font-black text-slate-900 dark:text-white">{currencySymbol} {formatCurrency(totalPurchaseCost + totalFeedCostAll)}</span>
                     </div>
                     <div className="flex justify-between items-center text-sm pt-1">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">Current Herd Value <span className="text-xs text-slate-400 font-normal">(@ {currencySymbol}{herdValueRate}/kg)</span></span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">{currencySymbol} {formatCurrency(totalCurrentValue)}</span>
                     </div>
                     <div className="border-t border-slate-200 dark:border-slate-700/50 pt-3 mt-2 flex justify-between items-center text-sm group">
                        <span className="text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-xs">Projected Harvest Profit <span className="text-xs font-normal normal-case">({harvestReadyStock.length} heads)</span></span>
                        <span className={`font-black ${projectedHarvestProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{currencySymbol} {formatCurrency(projectedHarvestProfit)}</span>
                     </div>
                  </div>
               </div>

               {roiData.length > 0 && roiData.length <= 10 && (
                  <div className="mt-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 shadow-sm border border-slate-200/50 dark:border-slate-700/50 overflow-hidden transition-colors">
                     <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-4">Individual Animal ROI (Top 10)</p>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                           <thead>
                              <tr className="text-slate-400 dark:text-slate-500 text-xs border-b border-slate-200 dark:border-slate-700">
                                 <th className="text-left py-3 font-bold uppercase tracking-wider">Tag</th>
                                 <th className="text-right py-3 font-bold uppercase tracking-wider">Days</th>
                                 <th className="text-right py-3 font-bold uppercase tracking-wider">Gained</th>
                                 <th className="text-right py-3 font-bold uppercase tracking-wider">Feed Cost</th>
                                 <th className="text-right py-3 font-bold uppercase tracking-wider">Cost/kg</th>
                              </tr>
                           </thead>
                           <tbody>
                              {sortedRoiData.slice(0, 10).map((r, idx) => (
                                 <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-white dark:hover:bg-slate-700/30 transition-colors group">
                                    <td className="py-3 font-bold text-slate-700 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-indigo-400 transition-colors">{r.tagNumber}</td>
                                    <td className="text-right text-slate-600 dark:text-slate-400">{r.daysOnFarm}</td>
                                    <td className={`text-right font-bold ${r.weightGained > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>+{r.weightGained} kg</td>
                                    <td className="text-right text-red-500 dark:text-red-400 font-medium">{currencySymbol} {r.totalFeedCost.toLocaleString()}</td>
                                    <td className="text-right font-bold">
                                       {r.costPerKgGained === -1 ? (
                                          <span className="text-rose-500 dark:text-rose-400 text-xs uppercase tracking-wider bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-md">No Gain</span>
                                       ) : (
                                          <span className="text-slate-800 dark:text-slate-200">{currencySymbol} {r.costPerKgGained}</span>
                                       )}
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
               )}
            </div>
         )}
      </div>
   );
};
