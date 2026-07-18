import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle, AlertTriangle, Loader2, Beef } from 'lucide-react';

interface DueAnimal {
    cattleId: string;
    tagNumber: string;
    ownerName: string;
    totalDue: number;
    monthsDue: number;
    status: 'PENDING' | 'OVERDUE';
    oldestDueDate: string;
}

interface Props {
    token: string;
}

const REASON_MESSAGES: Record<string, string> = {
    NOT_FOUND: "This link isn't recognized. It may have been copied incorrectly.",
    EXPIRED: 'This link has expired. Monthly billing review links stay valid for 45 days.',
    INVALID_REQUEST: 'This link is missing required information.',
    SERVER_ERROR: 'Something went wrong on our end. Please try again from the app.'
};

export const PaymentReviewPage: React.FC<Props> = ({ token }) => {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [farmName, setFarmName] = useState('');
    const [currency, setCurrency] = useState('PKR');
    const [animals, setAnimals] = useState<DueAnimal[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);
    const [lastSettled, setLastSettled] = useState<string[] | null>(null);
    const [lastFailed, setLastFailed] = useState<{ tagNumber: string; reason: string }[] | null>(null);

    const loadList = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`/api/payment-review?token=${encodeURIComponent(token)}`);
            const data = await res.json();
            if (!res.ok || !data.ok) {
                setLoadError(data.reason || 'SERVER_ERROR');
            } else {
                setFarmName(data.farmName);
                setCurrency(data.currency);
                setAnimals(data.animals);
            }
        } catch (err) {
            setLoadError('SERVER_ERROR');
        }
        setLoading(false);
    };

    useEffect(() => {
        loadList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const toggle = (cattleId: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(cattleId)) next.delete(cattleId); else next.add(cattleId);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === animals.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(animals.map(a => a.cattleId)));
        }
    };

    const handleConfirm = async () => {
        if (selected.size === 0) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/payment-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, cattleIds: Array.from(selected) })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                const succeededIds = new Set<string>(data.results.filter((r: any) => r.ok).map((r: any) => r.cattleId));
                const failed = data.results
                    .filter((r: any) => !r.ok)
                    .map((r: any) => ({
                        tagNumber: animals.find(a => a.cattleId === r.cattleId)?.tagNumber || r.cattleId,
                        reason: r.reason
                    }));

                setLastSettled(animals.filter(a => succeededIds.has(a.cattleId)).map(a => a.tagNumber));
                setLastFailed(failed.length > 0 ? failed : null);
                setAnimals(prev => prev.filter(a => !succeededIds.has(a.cattleId)));
                setSelected(new Set());
            } else {
                alert(data.reason || 'Something went wrong confirming these payments.');
            }
        } catch (err) {
            alert('Something went wrong confirming these payments.');
        }
        setSubmitting(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                <Loader2 className="animate-spin text-emerald-500" size={40} />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
                    <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-6">
                        {loadError === 'EXPIRED' ? <AlertTriangle size={40} /> : <XCircle size={40} />}
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">Link Not Valid</h1>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                        {REASON_MESSAGES[loadError] || 'This link could not be processed.'}
                    </p>
                    <a href="/" className="inline-block mt-8 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5 transition-transform">
                        Go to FarmXpert
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
            <div className="max-w-3xl mx-auto">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Review This Cycle's Payments</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{farmName}</p>
                </div>

                {lastSettled && lastSettled.length > 0 && (
                    <div className="mb-4 flex items-start gap-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-2xl p-4">
                        <CheckCircle2 size={22} className="shrink-0 mt-0.5" />
                        <p className="text-sm leading-relaxed">
                            Marked <strong>{lastSettled.join(', ')}</strong> as received. The animal owner(s) have been notified automatically.
                        </p>
                    </div>
                )}

                {lastFailed && lastFailed.length > 0 && (
                    <div className="mb-6 flex items-start gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl p-4">
                        <XCircle size={22} className="shrink-0 mt-0.5" />
                        <p className="text-sm leading-relaxed">
                            Could not confirm <strong>{lastFailed.map(f => f.tagNumber).join(', ')}</strong> - they're still marked pending. Try again, or check the app directly.
                        </p>
                    </div>
                )}

                {animals.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                            <Beef size={30} />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">All caught up</h2>
                        <p className="text-slate-500 dark:text-slate-400">No animals have a payment due right now.</p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={selected.size === animals.length}
                                    onChange={toggleAll}
                                    className="w-4 h-4 rounded accent-emerald-500"
                                />
                                Select all ({animals.length})
                            </label>
                            <span className="text-sm text-slate-400">{selected.size} selected</span>
                        </div>

                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {animals.map(a => (
                                <li
                                    key={a.cattleId}
                                    onClick={() => toggle(a.cattleId)}
                                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(a.cattleId)}
                                        onChange={() => toggle(a.cattleId)}
                                        onClick={e => e.stopPropagation()}
                                        className="w-4 h-4 rounded accent-emerald-500 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-800 dark:text-white">{a.tagNumber}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${a.status === 'OVERDUE' ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                                                {a.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{a.ownerName} &middot; {a.monthsDue} month(s) due</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-bold text-slate-800 dark:text-white">{currency} {a.totalDue.toLocaleString()}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <div className="p-5 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={handleConfirm}
                                disabled={selected.size === 0 || submitting}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-0.5 transition-transform"
                            >
                                {submitting ? <Loader2 className="animate-spin" size={18} /> : <Clock size={18} />}
                                {submitting ? 'Confirming...' : `Confirm ${selected.size || ''} Selected as Received`}
                            </button>
                        </div>
                    </div>
                )}

                <p className="text-center text-xs text-slate-400 mt-6">
                    This link stays valid for the rest of the billing cycle - feel free to come back and tick off more animals as payments come in.
                </p>
            </div>
        </div>
    );
};
