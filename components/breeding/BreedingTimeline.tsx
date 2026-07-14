
import React, { useEffect, useState } from 'react';
import { Loader2, Calendar, Activity, Baby, CheckCircle2, History, Sparkles, CalendarClock } from 'lucide-react';
import { PregnancyCycle, BreedingEvent } from '../../types';
import { useTheme } from '../../services/ThemeContext';

interface BreedingTimelineProps {
    animalId: string;
}

export function BreedingTimeline({ animalId }: BreedingTimelineProps) {
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ cycles: PregnancyCycle[], events: BreedingEvent[] } | null>(null);

    const token = localStorage.getItem('farmxpert_token');
    const tenantId = localStorage.getItem('x-tenant-id') || '7bca8694-9bb3-4e40-abdb-4cbaad99e009'; // Fallback for dev

    useEffect(() => {
        fetchTimeline();
    }, [animalId]);

    const fetchTimeline = async () => {
        setLoading(true);
        try {
            // Using existing API that returns events
            const res = await fetch(`/api/breeding/events?tenantId=${tenantId}&animalId=${animalId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId
                }
            });
            if (res.ok) {
                const rawEvents = await res.json();
                // Map snake_case to camelCase
                const events: BreedingEvent[] = rawEvents.map((e: any) => ({
                    ...e,
                    id: e.id,
                    eventType: e.event_type,
                    eventDate: e.event_date,
                    animalId: e.animal_id,
                    tenantId: e.tenant_id,
                    details: e.details
                }));
                // Sort by date desc
                const sortedEvents = events.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
                setData({ cycles: [], events: sortedEvents });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getPredictions = (events: BreedingEvent[]) => {
        if (!events || events.length === 0) return [];

        // Find latest meaningful event
        // We look for the most recent insemination/service
        const lastService = events.find(e =>
            ['SERVICE_AI', 'SERVICE_NATURAL', 'EMBRYO_TRANSFER'].includes(e.eventType)
        );

        if (!lastService) return [];

        const serviceDate = new Date(lastService.eventDate);
        const predictions = [];

        // Check if there are any "finalizing" events AFTER this service
        const newerEvents = events.filter(e => new Date(e.eventDate) > serviceDate);
        const hasCalved = newerEvents.some(e => e.eventType === 'CALVING');
        const hasAbortion = newerEvents.some(e => ['ABORTION', 'STILLBIRTH'].includes(e.eventType));
        const hasNegativePregCheck = newerEvents.some(e => e.eventType === 'PREG_CHECK' && e.details?.result === 'NEGATIVE');

        // If calved, aborted, or confirmed negative, don't predict
        if (hasCalved || hasAbortion || hasNegativePregCheck) return [];

        // 1. Suggested Preg Check (+30 days)
        // Only if no preg check has happened yet
        const hasPregCheck = newerEvents.some(e => e.eventType === 'PREG_CHECK');
        if (!hasPregCheck) {
            const checkDate = new Date(serviceDate);
            checkDate.setDate(checkDate.getDate() + 30);
            predictions.push({
                type: 'PREDICTION_PREG_CHECK',
                label: 'Suggested Pregnancy Check',
                date: checkDate,
                icon: <CalendarClock className="w-4 h-4 text-purple-600" />,
                colorClass: "bg-purple-50 border-dashed border-purple-200"
            });
        }

        // 2. Expected Calving (+280 days)
        const calvingDate = new Date(serviceDate);
        calvingDate.setDate(calvingDate.getDate() + 280);

        // Only show if not already pregnant checked negative (handled above)
        // If confirmed pregnant, we DEFINITELY show this. 
        // If status unknown (no preg check), we still show it as "Expected if successful"

        predictions.push({
            type: 'PREDICTION_CALVING',
            label: 'Expected Calving Date',
            date: calvingDate,
            icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
            colorClass: "bg-emerald-50 border-dashed border-emerald-200"
        });

        // Sort predictions by date ASC
        return predictions.sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
    if (!data) return <div className="p-4 text-center text-slate-500">No data available</div>;

    const predictions = getPredictions(data.events);

    return (
        <div className="space-y-8 animate-fade-in pl-2">
            <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <div className="bg-white dark:bg-slate-700 p-2 rounded-lg">
                    <History className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                </div>
                Reproductive History
            </h3>

            <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-2 sm:ml-3.5 space-y-6 sm:space-y-8 pl-6 sm:pl-8 py-2">

                {/* Predictions Section */}
                {predictions.map((pred, idx) => (
                    <div key={`pred-${idx}`} className="relative group">
                        <div className={`absolute -left-[37px] sm:-left-[45px] top-1 w-7 h-7 sm:w-9 sm:h-9 rounded-xl border-2 flex items-center justify-center ${pred.colorClass} ring-4 ring-white dark:ring-slate-900 z-10 shadow-sm transition-transform group-hover:scale-110`}>
                            {/* Smaller icon on mobile */}
                            <div className="scale-75 sm:scale-100">{pred.icon}</div>
                        </div>
                        <div className={`p-4 sm:p-5 rounded-2xl border ${pred.colorClass.replace('bg-', 'bg-opacity-50 ')} transition-all hover:shadow-md relative`}>
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                <div>
                                    <h4 className="font-bold text-slate-800 dark:text-slate-200 flex flex-wrap items-center gap-2 text-sm sm:text-base">
                                        {pred.label}
                                        <span className="text-[10px] uppercase bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-bold tracking-wider shadow-sm border border-slate-100 dark:border-slate-700">Estimated</span>
                                    </h4>
                                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{pred.date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Actual Events */}
                {data.events.map((event, idx) => {
                    const isLatest = idx === 0 && predictions.length === 0;
                    let icon = <Activity className="w-5 h-5 text-slate-500" />;
                    let colorClass = "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600";

                    if (event.eventType === 'HEAT') {
                        icon = <Activity className="w-5 h-5 text-orange-500" />;
                        colorClass = "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/30";
                    } else if (event.eventType.includes('SERVICE') || event.eventType === 'EMBRYO_TRANSFER') {
                        icon = <Activity className="w-5 h-5 text-emerald-500" />;
                        colorClass = "bg-emerald-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30";
                    } else if (event.eventType === 'PREG_CHECK') {
                        icon = <CheckCircle2 className="w-5 h-5 text-purple-500" />;
                        colorClass = "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/30";
                    } else if (event.eventType === 'CALVING') {
                        icon = <Baby className="w-5 h-5 text-emerald-500" />;
                        colorClass = "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30";
                    } else if (event.eventType === 'LACTATION_START') {
                        icon = <Activity className="w-5 h-5 text-cyan-500" />;
                        colorClass = "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800/30";
                    } else if (event.eventType === 'DRY_OFF') {
                        icon = <Activity className="w-5 h-5 text-slate-500" />;
                        colorClass = "bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600";
                    }

                    return (
                        <div key={event.id} className="relative group">
                            <div className={`absolute -left-[37px] sm:-left-[45px] top-1 w-7 h-7 sm:w-9 sm:h-9 rounded-xl border-2 flex items-center justify-center ${colorClass} ${isLatest ? 'ring-4 ring-emerald-100 dark:ring-emerald-900/30' : 'ring-4 ring-white dark:ring-slate-900'} z-10 shadow-sm transition-transform group-hover:scale-110`}>
                                <div className="scale-75 sm:scale-100">{icon}</div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all relative group-hover:border-slate-300 dark:group-hover:border-slate-600">
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-base sm:text-lg flex flex-wrap items-center gap-2">{event.eventType.replace(/_/g, ' ')}</h4>
                                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{new Date(event.eventDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                    </div>
                                    {event.details && (
                                        <div className="flex flex-wrap items-center sm:flex-col sm:items-end gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                                            {event.details.bullId && (
                                                <span className="text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-600 whitespace-nowrap">
                                                    Bull: {event.details.bullId}
                                                </span>
                                            )}
                                            {event.details.result && (
                                                <span className={`text-xs px-2 py-1 rounded-lg font-bold border whitespace-nowrap ${event.details.result === 'POSITIVE'
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30'
                                                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/30'}`}>
                                                    {event.details.result}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {event.details?.notes && (
                                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                                        <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{event.details.notes}"</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {data.events.length === 0 && (
                    <div className="text-slate-400 italic text-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                        No recorded events found in history.
                    </div>
                )}
            </div>
        </div>
    );
}
