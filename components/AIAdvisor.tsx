import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Cattle, FeedItem, UserRole } from '../types';
import { getFarmingAdvice, analyzeGrowthTrends } from '../services/geminiService';
import { useTheme } from '../services/ThemeContext';
import { Send, Bot, User, Sparkles, Loader2, Lock, TrendingUp, DollarSign, Weight, Activity, ArrowUpRight, ArrowDownRight, BarChart3, PieChart, LineChart } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area
} from 'recharts';

interface AIAdvisorProps {
  cattle: Cattle[];
  feed: FeedItem[];
  userRole: UserRole;
  tenant: any; // Add tenant prop here
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export const AIAdvisor: React.FC<AIAdvisorProps> = ({ cattle, feed, userRole, tenant }) => {
  const { isDarkMode } = useTheme();
  const [activeView, setActiveView] = useState<'dashboard' | 'copilot'>('dashboard');

  // --- KPI Calculations ---
  const kpis = useMemo(() => {
    const totalHead = cattle.length;
    const activeCattle = cattle.filter(c => c.status === 'Active');

    // Estimated Herd Value (simple calculation based on weight * market rate assumption)
    // Assuming avg rate ~1200 /kg for live weight (user can configure later)
    const marketRate = 1200;
    const totalWeight = activeCattle.reduce((sum, c) => sum + (Number(c.currentWeight) || 0), 0);
    const estimatedValue = totalWeight * marketRate;

    // Growth Rate (Avg Daily Gain)
    // Filter animals with valid entry & current weight and days on farm > 0
    let totalAdg = 0;
    let adgCount = 0;

    activeCattle.forEach(c => {
      if (c.currentWeight && c.entryWeight && c.entryDate) {
        const days = Math.max(1, Math.floor((new Date().getTime() - new Date(c.entryDate).getTime()) / (1000 * 3600 * 24)));
        const gain = (Number(c.currentWeight) - Number(c.entryWeight)) / days;
        if (gain > 0 && gain < 3) { // Filter realistic gains
          totalAdg += gain;
          adgCount++;
        }
      }
    });

    const avgDailyGain = adgCount > 0 ? (totalAdg / adgCount).toFixed(2) : '0.00';

    // Simulated Monthly Expense (Feed Cost)
    // This would ideally come from Transaction history, but estimating for demo
    const estimatedMonthlyFeedCost = activeCattle.length * 300 * 30; // ~300 per day/animal * 30 days

    return {
      totalHead,
      estimatedValue,
      avgDailyGain,
      estimatedMonthlyFeedCost
    };
  }, [cattle]);

  // --- Chart Data Preparation ---
  const weightTrendData = useMemo(() => {
    // Mocking trend data based on current weights for visualization
    // In production, this would use c.weightHistory
    return [
      { month: 'Jan', avgWeight: 250 },
      { month: 'Feb', avgWeight: 265 },
      { month: 'Mar', avgWeight: 285 },
      { month: 'Apr', avgWeight: 310 },
      { month: 'May', avgWeight: 340 },
      { month: 'Jun', avgWeight: 380 },
    ];
  }, [cattle]);

  const financialData = useMemo(() => {
    return [
      { name: 'Jan', Revenue: 0, Expense: 450000 },
      { name: 'Feb', Revenue: 120000, Expense: 480000 },
      { name: 'Mar', Revenue: 0, Expense: 460000 },
      { name: 'Apr', Revenue: 0, Expense: 510000 },
      { name: 'May', Revenue: 850000, Expense: 490000 }, // Sales event
      { name: 'Jun', Revenue: 0, Expense: 530000 },
    ];
  }, []);


  // --- Copilot State ---
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      text: 'I have analyzed your herd performance. Your average daily gain is steady at ' + kpis.avgDailyGain + ' kg/day. Would you like a deeper analysis of feed costs?',
      timestamp: Date.now()
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeView]);

  if (userRole === 'LABOR') {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-8 text-center">
        <div className="bg-slate-100 p-4 rounded-full mb-4">
          <Lock size={32} className="text-slate-500" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Access Restricted</h3>
        <p className="text-slate-500 max-w-md">
          Analytics are limited to Farm Owners and Managers.
        </p>
      </div>
    );
  }

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const responseText = await getFarmingAdvice(input, { cattle: cattle.slice(0, 20), feed });

    const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', text: responseText, timestamp: Date.now() };
    setMessages(prev => [...prev, aiMsg]);
    setIsLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header & Toggle Card */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
        <div className="w-full lg:w-auto">
            <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent flex items-center gap-3">
              <Sparkles className="text-fuchsia-500" />
              AI Advisor & Analytics
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 text-sm">Real-time insights powered by Gemini AI</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-2 rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-sm">
                <button
                onClick={() => setActiveView('dashboard')}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 w-full sm:w-auto ${activeView === 'dashboard'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                    }`}
                >
                <BarChart3 size={18} />
                Dashboard
                </button>
                <button
                onClick={() => setActiveView('copilot')}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 w-full sm:w-auto ${activeView === 'copilot'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                    }`}
                >
                <Bot size={18} />
                Copilot Chat
                </button>
            </div>
        </div>
      </div>

      <div>
        {activeView === 'dashboard' ? (
          <div className="space-y-6">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Avg. Daily Gain (Blue/Indigo theme) */}
              <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.08)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.18)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                <div className="flex items-start justify-between mb-6 relative">
                  <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                    <Weight size={24} />
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide flex items-center gap-1">
                    <ArrowUpRight size={12} /> +12%
                  </span>
                </div>
                <div className="relative">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Avg. Daily Gain</p>
                  <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                    {kpis.avgDailyGain} <span className="text-sm text-slate-400 font-medium">kg/day</span>
                  </h3>
                  <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-2 font-medium">Average weight growth rate</p>
                </div>
              </div>

              {/* Estimated Herd Value (Amber/Gold theme) */}
              <div className="group bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(251,191,36,0.08)] hover:shadow-[0_8px_30px_rgb(251,191,36,0.18)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                <div className="flex items-start justify-between mb-6 relative">
                  <div className="p-3 bg-white dark:bg-slate-800 border border-amber-100 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                    <DollarSign size={24} />
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide flex items-center gap-1">
                    <ArrowUpRight size={12} /> +5%
                  </span>
                </div>
                <div className="relative">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Estimated Herd Value</p>
                  <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                    {(kpis.estimatedValue / 1000000).toFixed(1)}M <span className="text-sm text-slate-400 font-medium">{tenant.currency || 'PKR'}</span>
                  </h3>
                  <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-2 font-medium">Estimated value based on weight</p>
                </div>
              </div>

              {/* Total Head Count (Teal/Emerald theme) */}
              <div className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(16,185,129,0.08)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.18)] border border-emerald-100 dark:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                <div className="flex items-start justify-between mb-6 relative">
                  <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                    <Activity size={24} />
                  </div>
                  <span className="text-[10px] bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Active</span>
                </div>
                <div className="relative">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Head Count</p>
                  <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                    {kpis.totalHead}
                  </h3>
                  <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-2 font-medium">Currently active livestock heads</p>
                </div>
              </div>

              {/* Monthly Feed Cost (Rose/Red theme) */}
              <div className="group bg-gradient-to-br from-rose-50 via-red-50 to-rose-50 dark:from-rose-950/40 dark:to-red-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(239,68,68,0.08)] hover:shadow-[0_8px_30px_rgb(239,68,68,0.18)] border border-rose-100 dark:border-rose-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-rose-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                <div className="flex items-start justify-between mb-6 relative">
                  <div className="p-3 bg-white dark:bg-slate-800 border border-rose-100 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                    <TrendingUp size={24} />
                  </div>
                  <span className="text-[10px] bg-rose-100 text-rose-850 dark:bg-rose-900/30 dark:text-rose-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide flex items-center gap-1">
                    Est.
                  </span>
                </div>
                <div className="relative">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Monthly Feed Cost</p>
                  <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                    {(kpis.estimatedMonthlyFeedCost / 1000).toFixed(0)}k <span className="text-sm text-slate-400 font-medium">{tenant.currency || 'PKR'}</span>
                  </h3>
                  <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-2 font-medium">Estimated nutrition expenses</p>
                </div>
              </div>
            </div>

            {/* Charts Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Weight Trend Chart */}
              <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center justify-between">
                  Growth Trajectory
                  <button className="text-xs text-emerald-500 font-medium px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full hover:bg-emerald-100 transition-colors">
                    View Report
                  </button>
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weightTrendData}>
                      <defs>
                        <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} vertical={false} />
                      <XAxis
                        dataKey="month"
                        stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                        tick={{ fontSize: 12, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                        tick={{ fontSize: 12, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                        labelStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b', fontWeight: 'bold' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="avgWeight"
                        stroke="#10b981"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorWeight)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Financial Overview Chart */}
              <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center justify-between">
                  Financial Overview
                  <button className="text-xs text-emerald-500 font-medium px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full hover:bg-emerald-100 transition-colors">
                    View Report
                  </button>
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={financialData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                        tick={{ fontSize: 12, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                        tick={{ fontSize: 12, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{
                          backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                        labelStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* AI Insight Teaser */}
            <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-3xl p-8 text-white shadow-lg shadow-violet-500/30 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden group mt-6">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-700"></div>
              <div className="relative z-10 flex-1">
                <h3 className="text-2xl font-bold mb-3 flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                    <Sparkles size={24} className="text-yellow-300" />
                  </div>
                  Farm Intelligence Insight
                </h3>
                <p className="text-violet-100 text-lg leading-relaxed max-w-2xl">
                  "Based on current growth trends, your herd is on track to reach optimal sale weight by early June. Consider adjusting the protein ratio in your 'Starter Mix' to accelerate gains by 5%."
                </p>
              </div>
              <button
                onClick={() => setActiveView('copilot')}
                className="relative z-10 px-8 py-4 bg-white text-emerald-600 font-bold rounded-xl hover:bg-emerald-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center gap-2 whitespace-nowrap group-hover:scale-105"
              >
                <Bot size={20} />
                Ask Gemini Assistant
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-14rem)]">
            {/* Chat Interface */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-900/10">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} group animate-fade-in`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${msg.role === 'user'
                    ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 border border-slate-200 dark:border-slate-700'
                    }`}>
                    {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl px-6 py-4 text-sm shadow-sm backdrop-blur-sm ${msg.role === 'user'
                    ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-br-none'
                    : 'bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none shadow-sm'
                    }`}>
                    <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                  <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-none px-6 py-4 text-sm text-slate-500 italic shadow-sm backdrop-blur-sm">
                    Analyzing farm data...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-white dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 sticky bottom-0 z-20">
              <div className="flex items-center gap-3 max-w-4xl mx-auto bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-emerald-500/50 focus-within:border-emerald-500 transition-all shadow-inner">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask Gemini about herd health, rations, or market trends..."
                  className="flex-1 bg-transparent border-none px-4 py-2 focus:ring-0 outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 font-medium"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white p-3 rounded-xl shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all transform hover:scale-105 active:scale-95"
                >
                  <Send size={20} />
                </button>
              </div>
              <p className="text-center text-[10px] text-slate-400 mt-3 font-medium">
                Gemini AI can make mistakes. Verify critical farm decisions.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const KPICard = ({ title, value, subtext, trend, trendUp, icon: Icon, color, inverseTrend }: any) => {
  const { isDarkMode } = useTheme();

  // Determine trend color
  let trendColorClass = '';

  if (inverseTrend) {
    trendColorClass = trendUp ? 'text-red-500' : 'text-emerald-500';
  } else {
    trendColorClass = trendUp ? 'text-emerald-500' : 'text-red-500';
  }

  const colorMap: any = {
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-emerald-600 dark:text-blue-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-emerald-600 dark:text-indigo-400',
  }

  return (
    <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${colorMap[color]} group-hover:scale-110 transition-transform`}>
          <Icon size={22} />
        </div>
        {trend && (
          <div className={`text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-900/50 flex items-center gap-1 ${trendColorClass}`}>
            {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {trend}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{title}</p>
        <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{value}</h3>
        {subtext && <p className="text-xs text-slate-400 mt-1 font-medium">{subtext}</p>}
      </div>
    </div>
  );
};