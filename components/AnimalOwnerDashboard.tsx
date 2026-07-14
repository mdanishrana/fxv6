import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Beef, TrendingUp, Activity, DollarSign, Scale, Calendar, Camera, Syringe, FileText, ChevronDown, ChevronUp, RefreshCw, Target, Heart, Award, BarChart3, AlertTriangle } from 'lucide-react';

class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
          <p>Something went wrong displaying this section.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

interface AnimalOwnerDashboardProps {
  userEmail: string;
  userName?: string;
  tenantId: string;
  authToken: string;
  isDarkMode: boolean;
}

interface AnimalData {
  id: string;
  tagNumber: string;
  name: string;
  type: string;
  breed: string;
  status: string;
  entryDate: string;
  entryWeight: number;
  currentWeight: number;
  targetWeight: number;
  dailyTargetGain: number;
  weightHistory: Array<{ date: string; weight: number }>;
  vaccinationHistory: Array<{ date: string; vaccineName: string; notes?: string }>;
  photos: Array<{ url: string; caption?: string; date: string }>;
  monthlyCharges: number;
}

interface CostBreakdown {
  purchaseCost: number;
  feedCost: number;
  medicalCost: number;
  vaccinationCost: number;
  laborCost: number;
  otherCost: number;
  grandTotal: number;
  daysOnFarm: number;
  feedCostPerDay: number;
  packageName: string;
}

export const AnimalOwnerDashboard: React.FC<AnimalOwnerDashboardProps> = ({
  userEmail,
  userName,
  tenantId,
  authToken,
  isDarkMode
}) => {
  const [animals, setAnimals] = useState<AnimalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAnimal, setExpandedAnimal] = useState<string | null>(null);
  const [costBreakdowns, setCostBreakdowns] = useState<Record<string, CostBreakdown>>({});
  const [loadingCosts, setLoadingCosts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchMyAnimals();
  }, [userEmail, tenantId]);

  const fetchMyAnimals = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/cattle/my-animals`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'X-Tenant-Id': tenantId
        }
      });

      if (!res.ok) {
        throw new Error('Failed to fetch animals');
      }

      const data = await res.json();
      setAnimals(data);
    } catch (err) {
      console.error('Error fetching animals:', err);
      setError('Unable to load your animals. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCostBreakdown = async (animalId: string) => {
    if (costBreakdowns[animalId]) return;

    try {
      setLoadingCosts(prev => ({ ...prev, [animalId]: true }));
      const res = await fetch(`/api/cattle/${animalId}/costs`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'X-Tenant-Id': tenantId
        }
      });

      if (res.ok) {
        const data = await res.json();
        setCostBreakdowns(prev => ({ ...prev, [animalId]: data.summary || data })); // fallback safely
      }
    } catch (err) {
      console.error('Error fetching cost breakdown:', err);
    } finally {
      setLoadingCosts(prev => ({ ...prev, [animalId]: false }));
    }
  };

  const toggleAnimal = (animalId: string) => {
    if (expandedAnimal === animalId) {
      setExpandedAnimal(null);
    } else {
      setExpandedAnimal(animalId);
      fetchCostBreakdown(animalId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-gradient-to-r from-green-500 to-emerald-500 text-white';
      case 'Sick': return 'bg-gradient-to-r from-red-500 to-rose-500 text-white';
      case 'Sold': return 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white';
      case 'Booked (Qurbani)': return 'bg-gradient-to-r from-purple-500 to-violet-500 text-white';
      default: return 'bg-white0 text-white';
    }
  };

  const calculateWeightGain = (animal: AnimalData) => {
    const current = animal?.currentWeight || 0;
    const entry = animal?.entryWeight || 0;
    return current - entry;
  };

  const calculateDaysOnFarm = (entryDate: string | undefined | null) => {
    if (!entryDate) return 0;
    try {
      const entry = new Date(entryDate);
      if (isNaN(entry.getTime())) return 0;
      const today = new Date();
      return Math.floor((today.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  const calculateWeightProgress = (animal: AnimalData) => {
    const target = animal?.targetWeight || 0;
    const entry = animal?.entryWeight || 0;
    const current = animal?.currentWeight || 0;
    if (!target || target <= entry) return 0;
    const progress = ((current - entry) / (target - entry)) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('en-PK', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  const formatCurrency = (amount: number | undefined | null) => {
    const safeAmount = typeof amount === 'number' ? amount : 0;
    return `Rs. ${safeAmount.toLocaleString()}`;
  };

  const getTotalStats = () => {
    const totalAnimals = animals.length;
    const totalWeightGain = animals.reduce((sum, a) => sum + calculateWeightGain(a), 0);
    const avgDaysOnFarm = animals.length > 0
      ? Math.round(animals.reduce((sum, a) => sum + calculateDaysOnFarm(a.entryDate), 0) / animals.length)
      : 0;
    const totalMonthlyCharges = animals.reduce((sum, a) => sum + (a.monthlyCharges || 0), 0);
    const activeAnimals = animals.filter(a => a.status === 'Active').length;

    return { totalAnimals, totalWeightGain, avgDaysOnFarm, totalMonthlyCharges, activeAnimals };
  };

  const WeightProgressChart: React.FC<{ animal: AnimalData }> = ({ animal }) => {
    try {
      const history = animal.weightHistory || [];
      const historyWeights = history.map(h => h?.weight || 0).filter(w => w > 0);
      const allWeights = [animal.entryWeight || 0, animal.currentWeight || 0, animal.targetWeight || 0, ...historyWeights].filter(w => w > 0);

      const maxWeight = allWeights.length > 0 ? Math.max(...allWeights) : animal.currentWeight || 100;
      const minWeight = (allWeights.length > 0 ? Math.min(...allWeights) : animal.entryWeight || 0) * 0.9;
      const range = maxWeight - minWeight || 1;

      const chartData = [
        { date: animal.entryDate || new Date().toISOString(), weight: animal.entryWeight || 0, label: 'Entry' },
        ...history.slice(-4).filter(h => h && h.date && h.weight),
        { date: new Date().toISOString(), weight: animal.currentWeight || 0, label: 'Current' }
      ];

      const safeFormatDate = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        try {
          return new Date(dateStr).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
        } catch {
          return '';
        }
      };

      return (
        <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/50' : 'bg-gradient-to-br from-emerald-50 to-teal-50'}`}>
          <div className="flex items-center justify-between mb-4">
            <h5 className={`font-medium flex items-center ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              <BarChart3 className="w-4 h-4 mr-2 text-emerald-600" />
              Weight Progress
            </h5>
            {(animal.targetWeight || 0) > 0 && (
              <span className={`text-xs px-2 py-1 rounded-full ${isDarkMode ? 'bg-emerald-900 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                Target: {animal.targetWeight} kg
              </span>
            )}
          </div>

          <div className="h-32 flex items-end justify-between gap-1">
            {chartData.map((point, idx) => {
              const weight = point?.weight || 0;
              const height = range > 0 ? ((weight - minWeight) / range) * 100 : 50;
              const isLast = idx === chartData.length - 1;
              const isFirst = idx === 0;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center">
                  <span className={`text-xs mb-1 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {weight}kg
                  </span>
                  <div
                    className={`w-full rounded-t-lg transition-all duration-300 ${isLast
                        ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                        : isFirst
                          ? 'bg-gradient-to-t from-blue-600 to-blue-400'
                          : 'bg-gradient-to-t from-teal-500 to-teal-300'
                      }`}
                    style={{ height: `${Math.max(Math.min(height, 100), 10)}%` }}
                  />
                  <span className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    {isFirst ? 'Entry' : isLast ? 'Now' : safeFormatDate(point?.date)}
                  </span>
                </div>
              );
            })}
          </div>

          {(animal.targetWeight || 0) > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Progress to Target</span>
                <span className={`font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  {calculateWeightProgress(animal).toFixed(1)}%
                </span>
              </div>
              <div className={`h-3 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all duration-500"
                  style={{ width: `${calculateWeightProgress(animal)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      );
    } catch (err) {
      console.error('WeightProgressChart error:', err);
      return (
        <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/50' : 'bg-white'}`}>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Unable to display weight chart</p>
        </div>
      );
    }
  };

  const CostPieChart: React.FC<{ costs: CostBreakdown }> = ({ costs }) => {
    if (!costs) {
      return <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>No cost data</p>;
    }

    const total = costs.grandTotal || 1;
    const segments = [
      { label: 'Purchase', value: costs.purchaseCost || 0, color: 'from-blue-500 to-blue-600' },
      { label: 'Feed', value: costs.feedCost || 0, color: 'from-green-500 to-green-600' },
      { label: 'Medical', value: costs.medicalCost || 0, color: 'from-red-500 to-red-600' },
      { label: 'Vaccination', value: costs.vaccinationCost || 0, color: 'from-purple-500 to-purple-600' },
      { label: 'Labor', value: costs.laborCost || 0, color: 'from-orange-500 to-orange-600' },
      { label: 'Other', value: costs.otherCost || 0, color: 'from-gray-500 to-gray-600' },
    ].filter(s => s.value > 0);

    return (
      <div className="space-y-2">
        {segments.map((segment, idx) => {
          const percentage = (segment.value / total) * 100;
          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>{segment.label}</span>
                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {formatCurrency(segment.value)} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${segment.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50'}`}>
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-200 animate-pulse" />
            <RefreshCw className="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-emerald-600" />
          </div>
          <p className={`mt-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Loading your animals...</p>
        </div>
      </div>
    );
  }

  const stats = getTotalStats();

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/50'}`}>
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                Welcome{userName ? `, ${userName}` : ''}!
              </h1>
              <p className="mt-2 text-emerald-100">
                Track your animals' progress, health, and investment
              </p>
            </div>
            <button
              onClick={fetchMyAnimals}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {animals.length > 0 && (
            <div className="mt-6 sm:mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
              <div className="bg-white/10 backdrop-blur rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex items-center gap-1.5 sm:gap-2 text-emerald-100 text-[10px] sm:text-sm">
                  <Beef className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">Animals</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-0.5 sm:mt-1">{stats.totalAnimals}</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex items-center gap-1.5 sm:gap-2 text-emerald-100 text-[10px] sm:text-sm">
                  <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">Active</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-0.5 sm:mt-1">{stats.activeAnimals}</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex items-center gap-1.5 sm:gap-2 text-emerald-100 text-[10px] sm:text-sm">
                  <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">Gain</span>
                </div>
                <p className="text-xl sm:text-3xl font-bold mt-0.5 sm:mt-1">+{stats.totalWeightGain}<span className="text-sm sm:text-lg">kg</span></p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex items-center gap-1.5 sm:gap-2 text-emerald-100 text-[10px] sm:text-sm">
                  <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">Days</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-0.5 sm:mt-1">{stats.avgDaysOnFarm}</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg sm:rounded-xl p-3 sm:p-4 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 sm:gap-2 text-emerald-100 text-[10px] sm:text-sm">
                  <DollarSign className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">Monthly</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold mt-0.5 sm:mt-1">{formatCurrency(stats.totalMonthlyCharges)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-700 rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={fetchMyAnimals}
              className="px-4 py-1 bg-red-200 hover:bg-red-300 rounded-lg text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {animals.length === 0 ? (
          <div className={`text-center py-16 rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
              <Beef className="w-12 h-12 text-emerald-600" />
            </div>
            <h3 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              No Animals Found
            </h3>
            <p className={`mt-3 max-w-md mx-auto ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              You don't have any animals registered yet. Contact the farm to register your animals.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {animals.map((animal) => (
              <div
                key={animal.id}
                className={`rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ${isDarkMode ? 'bg-gray-800' : 'bg-white'
                  } ${expandedAnimal === animal.id ? 'ring-2 ring-emerald-500' : ''}`}
              >
                <div
                  className={`p-6 cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-gray-750' : 'hover:bg-white'}`}
                  onClick={() => toggleAnimal(animal.id)}
                >
                  <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                        <Beef className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {animal.tagNumber}
                          </h3>
                          {animal.name && (
                            <span className={`text-sm px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'}`}>
                              {animal.name}
                            </span>
                          )}
                        </div>
                        <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {animal.breed} • {animal.type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <span className={`px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm ${getStatusColor(animal.status)}`}>
                        {animal.status}
                      </span>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-200'
                        }`}>
                        {expandedAnimal === animal.id ? (
                          <ChevronUp className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`} />
                        ) : (
                          <ChevronDown className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`} />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gradient-to-br from-blue-900/50 to-blue-800/30' : 'bg-gradient-to-br from-blue-50 to-blue-100'}`}>
                      <div className="flex items-center space-x-2">
                        <Scale className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-emerald-600'}`} />
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-blue-300' : 'text-emerald-600'}`}>Current Weight</span>
                      </div>
                      <p className={`text-2xl font-bold mt-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {animal.currentWeight} <span className="text-sm font-normal">kg</span>
                      </p>
                    </div>
                    <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gradient-to-br from-green-900/50 to-green-800/30' : 'bg-gradient-to-br from-green-50 to-emerald-100'}`}>
                      <div className="flex items-center space-x-2">
                        <TrendingUp className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>Weight Gain</span>
                      </div>
                      <p className={`text-2xl font-bold mt-2 ${calculateWeightGain(animal) >= 0 ? (isDarkMode ? 'text-green-400' : 'text-green-600') : 'text-red-500'}`}>
                        {calculateWeightGain(animal) >= 0 ? '+' : ''}{calculateWeightGain(animal)} <span className="text-sm font-normal">kg</span>
                      </p>
                    </div>
                    <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gradient-to-br from-purple-900/50 to-purple-800/30' : 'bg-gradient-to-br from-purple-50 to-violet-100'}`}>
                      <div className="flex items-center space-x-2">
                        <Calendar className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-purple-300' : 'text-purple-600'}`}>Days on Farm</span>
                      </div>
                      <p className={`text-2xl font-bold mt-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {calculateDaysOnFarm(animal.entryDate)} <span className="text-sm font-normal">days</span>
                      </p>
                    </div>
                    <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gradient-to-br from-amber-900/50 to-amber-800/30' : 'bg-gradient-to-br from-amber-50 to-orange-100'}`}>
                      <div className="flex items-center space-x-2">
                        <DollarSign className={`w-5 h-5 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`}>Monthly Charges</span>
                      </div>
                      <p className={`text-2xl font-bold mt-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {formatCurrency(animal.monthlyCharges || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {expandedAnimal === animal.id && (
                  <ErrorBoundary>
                    <div className={`border-t px-6 py-6 ${isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-white/50'}`}>
                      <div className="grid lg:grid-cols-2 gap-6">
                        <ErrorBoundary>
                          <WeightProgressChart animal={animal} />
                        </ErrorBoundary>

                        <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/50' : 'bg-white shadow-sm'}`}>
                          <h5 className={`font-medium flex items-center mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                            <DollarSign className="w-4 h-4 mr-2 text-amber-600" />
                            Cost Breakdown
                          </h5>
                          {loadingCosts[animal.id] ? (
                            <div className="flex items-center justify-center py-8">
                              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                            </div>
                          ) : costBreakdowns[animal.id] ? (
                            <div>
                              <CostPieChart costs={costBreakdowns[animal.id]} />
                              <div className={`mt-4 p-3 rounded-lg ${isDarkMode ? 'bg-amber-900/30' : 'bg-gradient-to-r from-amber-100 to-orange-100'}`}>
                                <div className="flex justify-between items-center">
                                  <span className={`font-medium ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>Total Investment</span>
                                  <span className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-amber-800'}`}>
                                    {formatCurrency(costBreakdowns[animal.id].grandTotal)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className={`text-sm text-center py-8 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              Cost data not available
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 grid md:grid-cols-2 gap-6">
                        <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/50' : 'bg-white shadow-sm'}`}>
                          <h5 className={`font-medium mb-4 flex items-center ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                            <Syringe className="w-4 h-4 mr-2 text-emerald-600" />
                            Vaccination History
                          </h5>
                          {animal.vaccinationHistory && animal.vaccinationHistory.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {animal.vaccinationHistory.slice(-5).reverse().map((record: { date: string; vaccineName: string; notes?: string }, idx: number) => (
                                <div
                                  key={idx}
                                  className={`p-3 rounded-lg ${isDarkMode ? 'bg-gray-600' : 'bg-emerald-50'}`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                        {record.vaccineName}
                                      </span>
                                      {record.notes && (
                                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                          {record.notes}
                                        </p>
                                      )}
                                    </div>
                                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                      {formatDate(record.date)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <Syringe className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                No vaccination records yet
                              </p>
                            </div>
                          )}
                        </div>

                        <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/50' : 'bg-white shadow-sm'}`}>
                          <h5 className={`font-medium mb-4 flex items-center ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                            <Activity className="w-4 h-4 mr-2 text-emerald-600" />
                            Animal Details
                          </h5>
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Entry Date</span>
                              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatDate(animal.entryDate)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Entry Weight</span>
                              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{animal.entryWeight} kg</span>
                            </div>
                            {animal.targetWeight > 0 && (
                              <div className="flex justify-between">
                                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Target Weight</span>
                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{animal.targetWeight} kg</span>
                              </div>
                            )}
                            {animal.dailyTargetGain > 0 && (
                              <div className="flex justify-between">
                                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Daily Target Gain</span>
                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{animal.dailyTargetGain} kg/day</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {animal.photos && animal.photos.length > 0 && (
                        <div className={`mt-6 p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/50' : 'bg-white shadow-sm'}`}>
                          <h5 className={`font-medium mb-4 flex items-center ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                            <Camera className="w-4 h-4 mr-2 text-pink-600" />
                            Photo Gallery
                          </h5>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                            {animal.photos.slice(0, 6).map((photo, idx) => (
                              <div key={idx} className="relative group">
                                <img
                                  src={photo.url}
                                  alt={photo.caption || `Photo ${idx + 1}`}
                                  className="w-full aspect-square object-cover rounded-lg shadow-sm group-hover:shadow-md transition-shadow"
                                />
                                {photo.caption && (
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-end p-2">
                                    <span className="text-white text-xs truncate">{photo.caption}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                            {animal.photos.length > 6 && (
                              <div className={`aspect-square rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                                <span className={`text-lg font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                  +{animal.photos.length - 6}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </ErrorBoundary>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
