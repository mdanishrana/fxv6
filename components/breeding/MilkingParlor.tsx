import React, { useState, useEffect } from 'react';
import { Loader2, Save, Droplet, Calendar, Search, Trash2, Clock, Inbox } from 'lucide-react';

interface MilkingParlorProps {
    tenantId: string;
    cattleList: any[];
}

export function MilkingParlor({ tenantId, cattleList }: MilkingParlorProps) {
    const [milkingDate, setMilkingDate] = useState(new Date().toISOString().split('T')[0]);
    const [logs, setLogs] = useState<Record<string, { id?: string; morning: string; evening: string; notes: string }>>({});
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPregnant, setFilterPregnant] = useState<'ALL' | 'PREGNANT'>('ALL');

    // History log list state
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [historyDate, setHistoryDate] = useState(''); // defaults to showing all logs

    // Fetch active logs for the selected date on date change
    useEffect(() => {
        const fetchLogsForDate = async () => {
            try {
                const token = localStorage.getItem('farmxpert_token');
                const res = await fetch(`/api/breeding/milk-logs-by-date?date=${milkingDate}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId }
                });
                if (res.ok) {
                    const data = await res.json();
                    const loadedLogs: Record<string, { id?: string; morning: string; evening: string; notes: string }> = {};
                    data.forEach((row: any) => {
                        loadedLogs[row.animal_id] = {
                            id: row.id,
                            morning: row.morning_yield || '',
                            evening: row.evening_yield || '',
                            notes: row.notes || ''
                        };
                    });
                    setLogs(loadedLogs);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchLogsForDate();
    }, [milkingDate, tenantId]);

    // Fetch history logs list
    const fetchHistoryLogs = async () => {
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(`/api/breeding/milk-logs-by-date?date=${historyDate}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId }
            });
            if (res.ok) {
                setHistoryLogs(await res.json());
            }
        } catch (err) {
            console.error('Failed to load history logs', err);
        }
    };

    useEffect(() => {
        fetchHistoryLogs();
    }, [historyDate, tenantId]);

    // Filter to only mature females with an ACTIVE lactation cycle
    const milkingCows = cattleList.filter(c =>
        (c.type?.toUpperCase() === 'COW' || c.gender?.toUpperCase() === 'FEMALE')
        && c.status?.toUpperCase() === 'ACTIVE'
        && Boolean(c.isLactating)
    ).filter(c => 
        filterPregnant === 'ALL' || c.isPregnant
    ).filter(c =>
        c.tagNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleBulkSave = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('farmxpert_token');
            const payloadArray = Object.entries(logs).map(([animalId, data]) => ({
                animalId,
                logDate: milkingDate,
                morning: data.morning ? parseFloat(data.morning) : undefined,
                evening: data.evening ? parseFloat(data.evening) : undefined,
                notes: data.notes
            })).filter(log => typeof log.morning !== 'undefined' || typeof log.evening !== 'undefined' || log.notes);

            if (payloadArray.length === 0) {
                alert("No valid entries to save.");
                setSaving(false);
                return;
            }

            const res = await fetch('/api/breeding/milk-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId },
                body: JSON.stringify({ logs: payloadArray, logDate: milkingDate })
            });

            if (res.ok) {
                alert('Milk logs saved successfully! Rolling averages updated.');
                // Refresh logs for this date to get database IDs and latest states
                const refreshRes = await fetch(`/api/breeding/milk-logs-by-date?date=${milkingDate}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId }
                });
                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    const loadedLogs: Record<string, { id?: string; morning: string; evening: string; notes: string }> = {};
                    data.forEach((row: any) => {
                        loadedLogs[row.animal_id] = {
                            id: row.id,
                            morning: row.morning_yield || '',
                            evening: row.evening_yield || '',
                            notes: row.notes || ''
                        };
                    });
                    setLogs(loadedLogs);
                }
                // Refresh history list too
                fetchHistoryLogs();
            } else {
                alert('Failed to save batch.');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred while saving.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteLog = async (logId: string, animalId: string) => {
        if (!confirm("Are you sure you want to delete this milking log entry? This will re-calculate the rolling average.")) return;
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(`/api/breeding/milk-logs/${logId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId }
            });
            if (res.ok) {
                setLogs(prev => {
                    const updated = { ...prev };
                    delete updated[animalId];
                    return updated;
                });
                // Refresh history logs view
                fetchHistoryLogs();
                alert('Milking log deleted successfully!');
            } else {
                alert('Failed to delete log entry.');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleInputChange = (animalId: string, field: 'morning' | 'evening' | 'notes', value: string) => {
        setLogs(prev => ({
            ...prev,
            [animalId]: {
                ...prev[animalId] || { morning: '', evening: '', notes: '' },
                [field]: value
            }
        }));
    };

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            {/* Daily Milking Batch Sheet */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/30 dark:bg-slate-800/50 backdrop-blur-sm">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Droplet className="text-blue-500" /> Daily Milking Sheet
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">Batch enter morning and evening yields for the active milking herd.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-auto">
                            <select
                                className="w-full pl-3 pr-8 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-200 cursor-pointer"
                                value={filterPregnant}
                                onChange={e => setFilterPregnant(e.target.value as 'ALL' | 'PREGNANT')}
                            >
                                <option value="ALL">All Lactating</option>
                                <option value="PREGNANT">🤰 Lactating & Pregnant</option>
                            </select>
                        </div>
                        <div className="relative w-full sm:w-auto">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search animals..."
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="relative w-full sm:w-auto">
                            <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="date"
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={milkingDate}
                                onChange={(e) => setMilkingDate(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={handleBulkSave}
                            disabled={saving}
                            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Batch
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-700/30 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-700 uppercase tracking-wider text-xs">
                            <tr>
                                <th className="px-6 py-4">Animal</th>
                                <th className="px-6 py-4">Morning Yield (L)</th>
                                <th className="px-6 py-4">Evening Yield (L)</th>
                                <th className="px-6 py-4">Notes (Optional)</th>
                                <th className="px-6 py-4 shrink-0 text-right">Running Avg.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {milkingCows.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No active milking cows found.</td></tr>
                            ) : (
                                milkingCows.map(cow => (
                                    <tr key={cow.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                                        <td className="px-6 py-3">
                                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                                {cow.tagNumber}
                                                {cow.isPregnant && <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full">Pregnant</span>}
                                            </div>
                                            <div className="text-xs text-slate-500">{cow.breed}</div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="number" step="0.1" placeholder="0.0"
                                                className="w-24 p-2 text-center border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800 dark:text-slate-100"
                                                value={logs[cow.id]?.morning || ''}
                                                onChange={(e) => handleInputChange(cow.id, 'morning', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="number" step="0.1" placeholder="0.0"
                                                className="w-24 p-2 text-center border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800 dark:text-slate-100"
                                                value={logs[cow.id]?.evening || ''}
                                                onChange={(e) => handleInputChange(cow.id, 'evening', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="text" placeholder="Observations..."
                                                className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                value={logs[cow.id]?.notes || ''}
                                                onChange={(e) => handleInputChange(cow.id, 'notes', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-800/30 whitespace-nowrap">
                                                    {cow.currentDailyMilkYield || '0.00'} L
                                                </span>
                                                {logs[cow.id]?.id && (
                                                    <button
                                                        onClick={() => handleDeleteLog(logs[cow.id].id!, cow.id)}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                                                        title="Delete Log"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Milking History Logs Section */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/30 dark:bg-slate-800/50">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Clock className="text-slate-600 dark:text-slate-400" /> Milking History Logs
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">View and filter previous milking registers by date.</p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Date Filter:</span>
                        <div className="relative w-full sm:w-48">
                            <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="date"
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={historyDate}
                                onChange={e => setHistoryDate(e.target.value)}
                            />
                        </div>
                        {historyDate && (
                            <button
                                onClick={() => setHistoryDate('')}
                                className="px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-700/30 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-700 uppercase tracking-wider text-xs">
                            <tr>
                                <th className="px-6 py-4">Log Date</th>
                                <th className="px-6 py-4">Animal Tag</th>
                                <th className="px-6 py-4 text-right">Morning (L)</th>
                                <th className="px-6 py-4 text-right">Evening (L)</th>
                                <th className="px-6 py-4 text-right">Total (L)</th>
                                <th className="px-6 py-4">Observations</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {historyLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center">
                                            <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                                            <p className="font-medium">No historical milk logs found.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                historyLogs.map(log => {
                                    const logDateStr = new Date(log.log_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                                    const m = parseFloat(log.morning_yield) || 0;
                                    const ev = parseFloat(log.evening_yield) || 0;
                                    const tot = parseFloat(log.total_yield) || 0;
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                                            <td className="px-6 py-3 font-medium text-slate-800 dark:text-slate-200">
                                                {logDateStr}
                                            </td>
                                            <td className="px-6 py-3 font-bold text-slate-800 dark:text-slate-100">
                                                {log.tag_number || 'Unknown'}
                                            </td>
                                            <td className="px-6 py-3 text-right font-mono">
                                                {m.toFixed(1)} L
                                            </td>
                                            <td className="px-6 py-3 text-right font-mono">
                                                {ev.toFixed(1)} L
                                            </td>
                                            <td className="px-6 py-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                                                {tot.toFixed(1)} L
                                            </td>
                                            <td className="px-6 py-3 text-slate-500 max-w-xs truncate">
                                                {log.notes || '-'}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <button
                                                    onClick={() => handleDeleteLog(log.id, log.animal_id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                                                    title="Delete Log"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
