import React, { useState, useEffect } from 'react';
import { Shield, Eye, Database, Plus, Edit2, Trash2, LogIn, Clock, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { AuditLog, Tenant } from '../types';

interface ActivityLogsProps {
    tenant: Tenant;
}

export const ActivityLogs: React.FC<ActivityLogsProps> = ({ tenant }) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const fetchLogs = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.logs.list(tenant.id, page, 50);
            setLogs(response.data || []);
            setTotalPages(response.pagination.totalPages);
            setTotalCount(response.pagination.total);
        } catch (err: any) {
            console.error("Failed to load logs:", err);
            setError("Failed to load activity logs.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [tenant.id, page]);

    const getActionStyles = (action: string) => {
        switch (action.toUpperCase()) {
            case 'CREATE':
                return { icon: <Plus size={14} />, color: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30', label: 'Added' };
            case 'UPDATE':
                return { icon: <Edit2 size={14} />, color: 'bg-blue-50 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30', label: 'Updated' };
            case 'DELETE':
                return { icon: <Trash2 size={14} />, color: 'bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/30', label: 'Deleted' };
            case 'LOGIN':
                return { icon: <LogIn size={14} />, color: 'bg-purple-50 text-purple-800 dark:bg-purple-950/20 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30', label: 'Login' };
            default:
                return { icon: <Database size={14} />, color: 'bg-slate-50 text-slate-800 dark:bg-slate-900/20 dark:text-slate-300 border border-slate-150 dark:border-slate-700', label: action };
        }
    };

    const getEntityStyles = (entity: string) => {
        switch (entity.toUpperCase()) {
            case 'CATTLE': return 'text-amber-705 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30';
            case 'TENANT': return 'text-emerald-705 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30';
            case 'FEED': return 'text-indigo-705 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30';
            default: return 'text-slate-700 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800';
        }
    };

    const formatMessage = (log: AuditLog) => {
        if (!log.details) return <span className="text-slate-400 italic">System synchronization</span>;
        if (log.details.message) return log.details.message;

        // Smart formatting based on entity known properties
        if (log.entity_type === 'CATTLE' && log.details.tagNumber) {
            return `Modified animal tag ${log.details.tagNumber}`;
        }

        return "Status adjusted";
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <Shield className="text-emerald-500" />
                        Security & Activity Audit Trail
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">
                        Track user actions, configurations, and data modifications across your farm.
                    </p>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all font-bold shadow-sm active:scale-95"
                >
                    <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                    Refresh Latest
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm overflow-hidden">
                {error ? (
                    <div className="p-8 text-center text-red-500">
                        {error}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200/60 dark:border-slate-700/60">
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Timestamp</th>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">User</th>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Action Type</th>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Module</th>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {isLoading && logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-450">
                                            Loading audit history...
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-455">
                                            No activity logs found for this farm yet.
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => {
                                        const actionSty = getActionStyles(log.action_type);
                                        return (
                                            <tr key={log.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-700/20 transition-colors group">
                                                <td className="px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2 whitespace-nowrap">
                                                    <Clock size={14} className="text-slate-400 dark:text-slate-500" />
                                                    {new Date(log.created_at).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="font-bold text-slate-900 dark:text-slate-100">{log.user_name || 'System Auto'}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{log.user_email || 'System Background Process'}</div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${actionSty.color}`}>
                                                        {actionSty.icon}
                                                        {actionSty.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getEntityStyles(log.entity_type)}`}>
                                                        {log.entity_type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                        {formatMessage(log)}
                                                    </div>
                                                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate max-w-xs group-hover:max-w-none group-hover:whitespace-normal transition-all" title={JSON.stringify(log.details)}>
                                                        Object ID: {log.entity_id}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Controls */}
                {!isLoading && totalPages > 1 && (
                    <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, totalCount)} of {totalCount} events
                        </span>
                        <div className="flex gap-2">
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
