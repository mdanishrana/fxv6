
import React, { useState, useEffect } from 'react';
import { BreedingStats, Tenant } from '../types';
import { BreedingDashboard } from './breeding/BreedingDashboard';
import { BreedingTimeline } from './breeding/BreedingTimeline';
import { AddBreedingEventModal } from './breeding/AddBreedingEventModal';
import { MilkingParlor } from './breeding/MilkingParlor';
import { MilkSales } from './breeding/MilkSales';
import { Loader2, Plus, Trash2, Edit, Search, Baby, Dna, Activity, FileText, Clock, Check, X, Syringe, Droplet } from 'lucide-react';
import { api } from '../services/api';
import { useTheme } from '../services/ThemeContext';

interface BreedingManagerProps {
    tenant: Tenant;
}

export default function BreedingManager({ tenant }: BreedingManagerProps) {
    const { isDarkMode, t } = useTheme();
    const [view, setView] = useState<'dashboard' | 'records' | 'timeline' | 'milking' | 'sales'>('dashboard');
    const [stats, setStats] = useState<BreedingStats | null>(null);
    const [upcoming, setUpcoming] = useState([]);
    const [milkStats, setMilkStats] = useState<any>(null);
    const [gestationStats, setGestationStats] = useState<any>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editEvent, setEditEvent] = useState<any>(null);

    // Search state for Timeline view
    const [cattleList, setCattleList] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredCattle, setFilteredCattle] = useState<any[]>([]);

    // Search state for Events Log view
    const [eventSearchTerm, setEventSearchTerm] = useState('');
    const [filterPregnant, setFilterPregnant] = useState<'ALL' | 'PREGNANT'>('ALL');

    const token = localStorage.getItem('farmxpert_token');

    // Fetch Helper Functions
    const fetchCattle = async () => {
        try {
            const data = await api.cattle.list(tenant.id);
            // Filter females
            const females = data.filter((c: any) => {
                const g = c.gender?.toUpperCase();
                const t = c.type?.toUpperCase();
                return ['FEMALE', 'COW', 'HEIFER', 'F'].includes(g) || ['COW', 'HEIFER'].includes(t);
            });
            setCattleList(females);
        } catch (err) {
            console.error('Failed to load cattle', err);
        }
    };

    const fetchEvents = async () => {
        try {
            const res = await fetch(`/api/breeding/events?tenantId=${tenant.id}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id }
            });
            if (res.ok) {
                setEvents(await res.json());
            }
        } catch (err) {
            console.error('Failed to fetch events', err);
        }
    };

    const fetchDashboardData = async () => {
        try {
            const [dashboardRes, milkStatsRes, gestationRes] = await Promise.all([
                fetch('/api/breeding/dashboard', {
                    headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id }
                }),
                fetch('/api/breeding/milk-stats', {
                    headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id }
                }),
                fetch('/api/breeding/gestation-stats', {
                    headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id }
                })
            ]);

            if (dashboardRes.ok) {
                const data = await dashboardRes.json();
                setStats(data.stats);
                setUpcoming(data.upcomingCalvings);
            }

            if (milkStatsRes.ok) {
                setMilkStats(await milkStatsRes.json());
            }

            if (gestationRes.ok) {
                setGestationStats(await gestationRes.json());
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Effects
    useEffect(() => {
        fetchDashboardData();
        if (view === 'records') fetchEvents();
        if (view === 'timeline' || view === 'milking') fetchCattle();
    }, [view, tenant.id]);

    useEffect(() => {
        let list = cattleList;
        if (filterPregnant === 'PREGNANT') {
            list = list.filter(c => c.isPregnant);
        }

        if (searchTerm) {
            setFilteredCattle(list.filter(c =>
                c.tagNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase()))
            ));
        } else if (filterPregnant === 'PREGNANT') {
            setFilteredCattle(list);
        } else {
            setFilteredCattle([]);
        }
    }, [searchTerm, cattleList, filterPregnant]);

    const filteredEvents = events.filter(evt => {
        if (!eventSearchTerm) return true;
        const term = eventSearchTerm.toLowerCase();
        return (
            evt.tag_number.toLowerCase().includes(term) ||
            (evt.animal_name && evt.animal_name.toLowerCase().includes(term)) ||
            evt.event_type.toLowerCase().includes(term) ||
            (evt.details?.result && evt.details.result.toLowerCase().includes(term))
        );
    });

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-[1920px] mx-auto pb-10">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                <div className="w-full lg:w-auto">
                    <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent flex items-center gap-3">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl">
                            <Dna className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        Breeding & Reproduction
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 sm:ml-14 text-sm">Manage herd genetics, pregnancy cycles, and calving events.</p>
                </div>
                <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4 w-full xl:w-auto">
                    <div className="flex bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-1.5 rounded-2xl w-full xl:w-auto overflow-x-auto no-scrollbar shadow-sm border border-white/20 dark:border-slate-700/50">
                        <button
                            onClick={() => setView('dashboard')}
                            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${view === 'dashboard' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm transform scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'}`}
                        >
                            <Activity size={16} /> Dashboard
                        </button>
                        <button
                            onClick={() => setView('records')}
                            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${view === 'records' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm transform scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'}`}
                        >
                            <FileText size={16} /> Events Log
                        </button>
                        <button
                            onClick={() => setView('timeline')}
                            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${view === 'timeline' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm transform scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'}`}
                        >
                            <Clock size={16} /> Timeline <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full ml-1 font-black hidden sm:inline-block border border-emerald-200 dark:border-emerald-800/50 shadow-sm">BETA</span>
                        </button>
                        <button
                            onClick={() => setView('milking')}
                            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${view === 'milking' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm transform scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'}`}
                        >
                            <Droplet size={16} /> Milking
                        </button>
                        <button
                            onClick={() => setView('sales')}
                            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${view === 'sales' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm transform scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'}`}
                        >
                            <Droplet size={16} className="text-emerald-500" /> {t('milk_sales')}
                        </button>
                    </div>
                    <button
                        onClick={() => {
                            setEditEvent(null);
                            setShowAddModal(true);
                        }}
                        className="w-full xl:w-auto bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 hover:-translate-y-1 active:scale-95 font-bold whitespace-nowrap"
                    >
                        <Plus size={18} /> Record Event
                    </button>
                </div>
            </div>

            {view === 'milking' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <MilkingParlor tenantId={tenant.id} cattleList={cattleList} />
                </div>
            )}

            {view === 'sales' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <MilkSales tenantId={tenant.id} />
                </div>
            )}

            {view === 'dashboard' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <BreedingDashboard 
                        stats={stats || { open_cycles: 0, pregnant_cows: 0, recent_calvings: 0 }} 
                        upcomingCalvings={upcoming} 
                        milkStats={milkStats} 
                        gestationStats={gestationStats}
                    />
                </div>
            )}

            {view === 'records' && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/30 dark:bg-slate-800/50 backdrop-blur-sm">
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">All Recorded Events</h3>
                        <div className="w-full sm:w-auto">
                            <input
                                type="text"
                                value={eventSearchTerm}
                                onChange={(e) => setEventSearchTerm(e.target.value)}
                                placeholder="Search events..."
                                className="w-full sm:w-64 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white dark:bg-slate-700/30 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-700 uppercase tracking-wider text-xs">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Event Type</th>
                                    <th className="px-6 py-4">Animal</th>
                                    <th className="px-6 py-4">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {filteredEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-16 text-center text-slate-500 dark:text-slate-400">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="bg-white dark:bg-slate-800 p-4 rounded-full mb-4 border border-slate-100 dark:border-slate-700">
                                                    <FileText className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                                                </div>
                                                <p className="font-medium text-lg text-slate-600 dark:text-slate-300">
                                                    {events.length === 0 ? "No events found" : "No results for your search"}
                                                </p>
                                                <p className="text-sm mt-1">
                                                    {events.length === 0 ? "Start by recording a breeding event." : "Try adjusting your search terms."}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEvents.map((evt) => (
                                        <tr key={evt.id} className="group hover:bg-white dark:hover:bg-slate-700/20 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-1 h-8 bg-slate-200 dark:bg-slate-700 rounded-full group-hover:bg-emerald-500 transition-colors"></div>
                                                    {new Date(evt.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold tracking-wide shadow-sm border
                                                    ${evt.event_type === 'CALVING' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800/30' :
                                                        evt.event_type === 'PREG_CHECK' ? 'bg-emerald-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800/30' :
                                                            evt.event_type === 'HEAT' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-800/30' :
                                                                evt.event_type === 'SERVICE_AI' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800/30' :
                                                                    evt.event_type === 'LACTATION_START' ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-100 dark:border-cyan-800/30' :
                                                                        evt.event_type === 'DRY_OFF' ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600' :
                                                                            'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                                                    {evt.event_type.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                                        {evt.tag_number.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800 dark:text-slate-100">{evt.tag_number}</div>
                                                        {evt.animal_name && <div className="text-xs text-slate-500 dark:text-slate-400">{evt.animal_name}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                                                <div className="flex justify-between items-center bg-white dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50 group-hover:border-emerald-100 dark:group-hover:border-emerald-900/30 transition-colors">
                                                    <span className="text-xs font-medium">
                                                        {evt.event_type === 'PREG_CHECK' && (
                                                            <span className="flex items-center gap-1.5">Result:
                                                                <span className={`px-2 py-0.5 rounded-md text-xs font-bold flex items-center gap-1 ${evt.details?.result === 'POSITIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                                    {evt.details?.result === 'POSITIVE' ? <Check size={12} /> : <X size={12} />}
                                                                    {evt.details?.result || 'N/A'}
                                                                </span>
                                                            </span>
                                                        )}
                                                        {evt.event_type === 'CALVING' && (
                                                            <span className="flex items-center gap-1">
                                                                <Baby size={14} className="text-purple-500" />
                                                                Calf: <span className="font-mono font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 px-1.5 rounded">{evt.details?.calfDetails?.tagNumber || '-'}</span>
                                                            </span>
                                                        )}
                                                        {evt.event_type === 'HEAT' && (
                                                            <span className="flex items-center gap-1"><Search size={14} /> Obs: {evt.details?.observedBy || '-'}</span>
                                                        )}
                                                        {evt.event_type === 'SERVICE_AI' && (
                                                            <span className="flex items-center gap-1"><Syringe size={14} /> Bull: {evt.details?.bullTag || '-'}</span>
                                                        )}
                                                    </span>
                                                    <div className="flex gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => {
                                                                setEditEvent(evt);
                                                                setShowAddModal(true);
                                                            }}
                                                            className="text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 p-1.5 rounded-lg transition-all"
                                                            title="Edit Event"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete this event? This will re-calculate pregnancy status.')) {
                                                                    try {
                                                                        const res = await fetch(`/api/breeding/events/${evt.id}`, {
                                                                            method: 'DELETE',
                                                                            headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id }
                                                                        });
                                                                        if (res.ok) {
                                                                            // Refresh ALL views to ensure consistency
                                                                            fetchEvents();
                                                                            fetchDashboardData();
                                                                            fetchCattle(); // Updates Timeline/Search caches
                                                                        }
                                                                    } catch (err) { console.error(err); }
                                                                }
                                                            }}
                                                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-lg transition-all"
                                                            title="Delete Event Log"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {view === 'timeline' && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm min-h-[500px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {!selectedAnimalId ? (
                        <div className="text-center py-20 px-4">
                            <div className="max-w-xl mx-auto">
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50/50 dark:ring-emerald-900/10">
                                    <Search className="h-10 w-10 text-emerald-500" />
                                </div>
                                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Find an Animal</h3>
                                <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto">Search by tag number or name to view detailed reproductive history, upcoming cycles, and predictions.</p>

                                <div className="relative max-w-lg mx-auto group flex gap-2">
                                    <div className="relative w-1/3">
                                        <select
                                            value={filterPregnant}
                                            onChange={(e) => setFilterPregnant(e.target.value as 'ALL' | 'PREGNANT')}
                                            className="w-full px-3 py-3.5 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-lg shadow-slate-200/20 dark:shadow-none transition-all cursor-pointer text-sm font-semibold"
                                        >
                                            <option value="ALL">All Females</option>
                                            <option value="PREGNANT">🤰 Pregnant</option>
                                        </select>
                                    </div>
                                    <div className="relative w-2/3">
                                        <Search className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                                        <input
                                            type="text"
                                            placeholder="Enter Tag Number..."
                                            className="w-full pl-12 pr-4 py-3.5 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-lg shadow-slate-200/20 dark:shadow-none transition-all"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    {(searchTerm || filterPregnant === 'PREGNANT') && filteredCattle.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl max-h-80 overflow-y-auto z-20 text-left animate-in fade-in zoom-in-95 duration-150">
                                            {filteredCattle.map(cow => (
                                                <button
                                                    key={cow.id}
                                                    className="w-full text-left px-5 py-4 hover:bg-white dark:hover:bg-slate-700/50 border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors group/item"
                                                    onClick={() => {
                                                        setSelectedAnimalId(cow.id);
                                                        setSearchTerm('');
                                                        setFilterPregnant('ALL');
                                                    }}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm group-hover/item:bg-emerald-100 group-hover/item:text-emerald-600 transition-colors">
                                                                {cow.tagNumber.substring(0, 2)}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-slate-800 dark:text-slate-100 text-lg">{cow.tagNumber}</div>
                                                                <div className="text-xs text-slate-400">{cow.breed} • {cow.category || 'Cow'}</div>
                                                            </div>
                                                        </div>
                                                        {cow.isPregnant && (
                                                            <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                                                                <Baby size={14} /> Pregnant
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {searchTerm && filteredCattle.length === 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl p-6 text-center z-20">
                                            <p className="text-slate-500 font-medium">No results found for "{searchTerm}"</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 pb-6 border-b border-slate-100 dark:border-slate-700 gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="h-16 w-16 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-2xl shadow-inner border border-emerald-200/50 dark:border-emerald-700/30">
                                        {cattleList.find(c => c.id === selectedAnimalId)?.tagNumber.substring(0, 2)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-2xl text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                            {cattleList.find(c => c.id === selectedAnimalId)?.tagNumber}
                                            {cattleList.find(c => c.id === selectedAnimalId)?.isPregnant && (
                                                <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-lg text-xs font-bold border border-purple-200 dark:border-purple-800/50 flex items-center gap-1">
                                                    <Baby size={14} /> Pregnant
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-slate-500 font-medium flex items-center gap-2 mt-1">
                                            <Activity size={16} className="text-emerald-500" /> Reproductive History Timeline
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setEditEvent(null);
                                            setShowAddModal(true);
                                        }}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                                    >
                                        <Plus size={18} /> Add Event
                                    </button>
                                    <button
                                        onClick={() => setSelectedAnimalId(null)}
                                        className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-xl font-bold text-sm transition-all"
                                    >
                                        Change Animal
                                    </button>
                                </div>
                            </div>
                            <BreedingTimeline animalId={selectedAnimalId} />
                        </div>
                    )}
                </div>
            )}

            {showAddModal && (
                <AddBreedingEventModal
                    onClose={() => {
                        setShowAddModal(false);
                        setEditEvent(null);
                    }}
                    onSuccess={() => {
                        fetchDashboardData();
                        if (view === 'records') fetchEvents();
                        if (view === 'milking' || view === 'timeline') fetchCattle();
                    }}
                    tenantId={tenant.id}
                    initialData={editEvent}
                    preSelectedAnimalId={selectedAnimalId || undefined}
                />
            )}
        </div>
    );
}
