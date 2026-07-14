import React, { useState, useEffect } from 'react';
import { X, Save, Search, Calendar, Activity, Baby } from 'lucide-react';
import { api } from '../../services/api';
import { Cattle } from '../../types';
import { useTheme } from '../../services/ThemeContext';

interface AddBreedingEventModalProps {
    onClose: () => void;
    onSuccess: () => void;
    tenantId: string;
    initialData?: any; // For editing
    preSelectedAnimalId?: string;
}

export function AddBreedingEventModal({ onClose, onSuccess, tenantId, initialData, preSelectedAnimalId }: AddBreedingEventModalProps) {
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(false);
    const [cattle, setCattle] = useState<Cattle[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isEditMode, setIsEditMode] = useState(false);
    const [semenList, setSemenList] = useState<any[]>([]);
    const [embryoList, setEmbryoList] = useState<any[]>([]);

    const [formData, setFormData] = useState({
        animalId: '',
        eventType: 'SERVICE_AI',
        eventDate: new Date().toISOString().split('T')[0],
        details: {
            technician: '',
            bullId: '',
            notes: '',
            result: '',
            pregnancyStage: '',
            confirmationMethod: '',
            confirmedBy: '',
            outcomeType: ''
        },
        calfDetails: {
            tagNumber: '',
            name: '',
            gender: 'FEMALE',
            breed: '',
            weight: '',
            sireCode: ''
        },
        cycleId: ''
    });

    useEffect(() => {
        loadCattle();
        loadGenetics(); // Fetch genetics data
        if (initialData) {
            setIsEditMode(true);
            setFormData({
                animalId: initialData.animal_id,
                eventType: initialData.event_type,
                eventDate: new Date(initialData.event_date).toISOString().split('T')[0],
                details: initialData.details || {},
                calfDetails: initialData.details?.calfDetails || { tagNumber: '', name: '', gender: 'FEMALE', breed: '', weight: '', sireCode: '' },
                cycleId: initialData.cycle_id || ''
            });
            // Pre-set search term to find the animal easily
            setSearchTerm(initialData.tag_number || '');
        } else if (preSelectedAnimalId) {
            setFormData(prev => ({ ...prev, animalId: preSelectedAnimalId }));
        }
    }, [initialData, preSelectedAnimalId]);

    const loadCattle = async () => {
        try {
            const data = await api.cattle.list(tenantId);

            // Filter only FEMALE cattle for breeding
            const females = data.filter((c: any) => {
                const g = c.gender?.toUpperCase();
                const t = c.type?.toUpperCase();
                const isValidGender = ['FEMALE', 'COW', 'HEIFER', 'F'].includes(g);
                const isValidType = ['COW', 'HEIFER'].includes(t);
                const isMale = ['MALE', 'BULL', 'STEER', 'M'].includes(g) || ['BULL', 'STEER'].includes(t);
                return (isValidGender || isValidType) && !isMale;
            });

            setCattle(females);
        } catch (err) {
            console.error('Failed to load cattle', err);
        }
    };

    const loadGenetics = async () => {
        try {
            const token = localStorage.getItem('farmxpert_token');
            const headers = { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId };

            const [semenRes, embryoRes] = await Promise.all([
                fetch('/api/genetics/semen', { headers }),
                fetch('/api/genetics/embryos', { headers })
            ]);

            if (semenRes.ok) setSemenList(await semenRes.json());
            if (embryoRes.ok) setEmbryoList(await embryoRes.json());
        } catch (err) {
            console.error('Failed to load genetics', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const endpoint = isEditMode && initialData?.id
                ? `/api/breeding/events/${initialData.id}`
                : '/api/breeding/events';

            const method = isEditMode ? 'PUT' : 'POST';

            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId
                },
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || 'Failed to save breeding event');
            } else {
                onSuccess();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('Error saving event');
        } finally {
            setLoading(false);
        }
    };

    const filteredCattle = cattle.filter(c => {
        const matchesSearch = c.tagNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase()));

        // Pregnancy Lock: Disable pregnant cows for service events
        if (['SERVICE_AI', 'SERVICE_NATURAL', 'EMBRYO_TRANSFER'].includes(formData.eventType)) {
            if (c.isPregnant) return false;
        }

        return matchesSearch;
    });

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl ring-1 ring-black/5 w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-white dark:bg-slate-800/50 sticky top-0 z-10 backdrop-blur-md">
                    <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <Activity size={20} />
                        </div>
                        {isEditMode ? 'Edit Breeding Event' : 'Record Breeding Event'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">

                    {/* Animal Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Select Cow</label>
                        {!formData.animalId ? (
                            <div className="relative group">
                                <Search className="absolute left-3 top-3 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search by Tag or Name..."
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 shadow-sm transition-all"
                                    autoFocus
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-xl max-h-56 overflow-y-auto z-20 animate-in fade-in zoom-in-95 duration-100">
                                        {filteredCattle.length > 0 ? filteredCattle.map(cow => (
                                            <button
                                                key={cow.id}
                                                type="button"
                                                className="w-full text-left px-4 py-3 hover:bg-white dark:hover:bg-slate-700/50 text-sm flex justify-between items-center text-slate-800 dark:text-slate-200 border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors"
                                                onClick={() => {
                                                    setFormData({ ...formData, animalId: cow.id });
                                                    setSearchTerm('');
                                                }}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
                                                        {cow.tagNumber.substring(0, 2)}
                                                    </div>
                                                    <span className="font-bold">{cow.tagNumber}</span>
                                                </div>
                                                <span className="text-slate-400 text-xs flex items-center gap-1">
                                                    {cow.isPregnant && <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-200 dark:border-purple-800/30">PREGNANT</span>}
                                                    {cow.breed}
                                                </span>
                                            </button>
                                        )) : (
                                            <div className="p-4 text-center text-sm text-slate-400">
                                                No eligible cows found
                                                {['SERVICE_AI', 'SERVICE_NATURAL', 'EMBRYO_TRANSFER'].includes(formData.eventType) ? ' (Pregnant cows are hidden)' : ''}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl">
                                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-sm">
                                        {cattle.find(c => c.id === formData.animalId)?.tagNumber.substring(0, 2)}
                                    </div>
                                    {cattle.find(c => c.id === formData.animalId)?.tagNumber}
                                    {cattle.find(c => c.id === formData.animalId)?.isPregnant &&
                                        <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-200 dark:border-purple-800/30">PREGNANT</span>
                                    }
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, animalId: '' })}
                                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 px-2 py-1 rounded-lg transition-colors"
                                >
                                    Change
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Event Type */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Event Type</label>
                            <div className="relative">
                                <select
                                    className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm appearance-none"
                                    value={formData.eventType}
                                    onChange={e => {
                                        setFormData({ ...formData, eventType: e.target.value, animalId: '' }); // Reset animal on type change to enforce lock
                                    }}
                                >
                                    <option value="SERVICE_AI">Artificial Insemination</option>
                                    <option value="SERVICE_NATURAL">Natural Service</option>
                                    <option value="EMBRYO_TRANSFER">Embryo Transfer</option>
                                    <option value="PREG_CHECK">Pregnancy Check</option>
                                    <option value="CALVING">Calving (Birth)</option>
                                    <option value="ABORTION">Abortion/Loss</option>
                                    <option value="LACTATION_START">Lactation Start</option>
                                    <option value="DRY_OFF">Lactation End (Dry Off)</option>
                                </select>
                                <div className="absolute right-3 top-3 pointer-events-none text-slate-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        </div>

                        {/* Date */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Date</label>
                            <div className="relative group">
                                <Calendar className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                                <input
                                    type="date"
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm transition-all"
                                    value={formData.eventDate}
                                    onChange={e => setFormData({ ...formData, eventDate: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Dynamic Fields based on Type */}
                    {(formData.eventType === 'SERVICE_AI' || formData.eventType === 'SERVICE_NATURAL' || formData.eventType === 'EMBRYO_TRANSFER') && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                {formData.eventType === 'SERVICE_NATURAL' ? 'Bull Tag ID' :
                                    formData.eventType === 'EMBRYO_TRANSFER' ? 'Embryo Code' : 'Bull / Semen Code'}
                            </label>
                            <input
                                type="text"
                                list={formData.eventType === 'SERVICE_AI' ? "semen-options" : formData.eventType === 'EMBRYO_TRANSFER' ? "embryo-options" : undefined}
                                placeholder={formData.eventType === 'SERVICE_NATURAL' ? "Enter Bull Tag" : "Select or Enter Code"}
                                className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 shadow-sm transition-all"
                                value={formData.details.bullId}
                                onChange={e => setFormData({
                                    ...formData,
                                    details: { ...formData.details, bullId: e.target.value }
                                })}
                            />
                            {/* Datalists for Suggestions */}
                            {formData.eventType === 'SERVICE_AI' && (
                                <datalist id="semen-options">
                                    {semenList.filter(s => s.status === 'AVAILABLE').map(s => (
                                        <option key={s.id} value={s.code}>{s.bull_name} ({s.breed})</option>
                                    ))}
                                </datalist>
                            )}
                            {formData.eventType === 'EMBRYO_TRANSFER' && (
                                <datalist id="embryo-options">
                                    {embryoList.filter(e => e.status === 'AVAILABLE').map(e => (
                                        <option key={e.id} value={e.code}>{e.bull_name} x {e.donor_cow} ({e.breed})</option>
                                    ))}
                                </datalist>
                            )}
                        </div>
                    )}

                    {formData.eventType === 'PREG_CHECK' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Check Result</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <label className={`flex items-center justify-center gap-2 cursor-pointer p-3 rounded-xl border transition-all ${formData.details.result === 'POSITIVE' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700/50'}`}>
                                        <input
                                            type="radio"
                                            name="preg_result"
                                            checked={formData.details.result === 'POSITIVE'}
                                            onChange={() => setFormData({
                                                ...formData,
                                                details: { ...formData.details, result: 'POSITIVE' }
                                            })}
                                            className="hidden"
                                        />
                                        <span className="flex items-center gap-2"><Activity size={18} /> Pregnant</span>
                                    </label>
                                    <label className={`flex items-center justify-center gap-2 cursor-pointer p-3 rounded-xl border transition-all ${formData.details.result === 'NEGATIVE' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 font-bold shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700/50'}`}>
                                        <input
                                            type="radio"
                                            name="preg_result"
                                            checked={formData.details.result === 'NEGATIVE'}
                                            onChange={() => setFormData({
                                                ...formData,
                                                details: { ...formData.details, result: 'NEGATIVE' }
                                            })}
                                            className="hidden"
                                        />
                                        <span className="flex items-center gap-2"><X size={18} /> Not Pregnant</span>
                                    </label>
                                </div>
                            </div>

                            {/* Enhanced Outcome Flow for Positive Pregnancy */}
                            {formData.details.result === 'POSITIVE' && (
                                <div className="p-5 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 space-y-4 animate-in fade-in slide-in-from-top-1">
                                    <h4 className="text-xs font-rubik font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-widest flex items-center gap-2">
                                        <div className="h-px w-8 bg-emerald-300 dark:bg-emerald-700"></div>
                                        Pregnancy Details
                                        <div className="h-px flex-1 bg-emerald-300 dark:bg-emerald-700"></div>
                                    </h4>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Conception Method</label>
                                        <select
                                            className="w-full p-2.5 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-slate-800 dark:text-slate-100"
                                            value={formData.details.outcomeType || ''}
                                            onChange={e => setFormData({
                                                ...formData,
                                                details: { ...formData.details, outcomeType: e.target.value }
                                            })}
                                        >
                                            <option value="">Select how it was conceived...</option>
                                            <option value="AI">Artificial Insemination (AI)</option>
                                            <option value="EMBRYO">Embryo Transfer</option>
                                            <option value="NATURAL">Natural Service</option>
                                        </select>
                                    </div>

                                    {/* AI Details */}
                                    {formData.details.outcomeType === 'AI' && (
                                        <div className="space-y-1.5 animate-in fade-in">
                                            <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Semen Code</label>
                                            <input
                                                type="text"
                                                list="semen-options-preg"
                                                className="w-full p-2.5 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                                placeholder="Enter Semen Code"
                                                value={formData.details.bullId || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    details: { ...formData.details, bullId: e.target.value }
                                                })}
                                            />
                                            <datalist id="semen-options-preg">
                                                {semenList.filter(s => s.status === 'AVAILABLE').map(s => (
                                                    <option key={s.id} value={s.code}>{s.bull_name} ({s.breed})</option>
                                                ))}
                                            </datalist>
                                        </div>
                                    )}

                                    {/* Embryo Details */}
                                    {formData.details.outcomeType === 'EMBRYO' && (
                                        <div className="space-y-1.5 animate-in fade-in">
                                            <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Embryo Code</label>
                                            <input
                                                type="text"
                                                list="embryo-options-preg"
                                                className="w-full p-2.5 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                                placeholder="Enter Embryo Code"
                                                value={formData.details.bullId || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    details: { ...formData.details, bullId: e.target.value }
                                                })}
                                            />
                                            <datalist id="embryo-options-preg">
                                                {embryoList.filter(e => e.status === 'AVAILABLE').map(e => (
                                                    <option key={e.id} value={e.code}>{e.bull_name} x {e.donor_cow} ({e.breed})</option>
                                                ))}
                                            </datalist>
                                        </div>
                                    )}

                                    {/* Common Confirmation Details */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-emerald-200/50 dark:border-emerald-800/30">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Pregnancy Stage</label>
                                            <select
                                                className="w-full p-2.5 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-slate-800 dark:text-slate-100"
                                                value={formData.details.pregnancyStage || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    details: { ...formData.details, pregnancyStage: e.target.value }
                                                })}
                                            >
                                                <option value="">Select Stage...</option>
                                                <option value="Early">Early (0-3 months)</option>
                                                <option value="Mid">Mid (3-6 months)</option>
                                                <option value="Late">Late (6+ months)</option>
                                            </select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Method</label>
                                            <select
                                                className="w-full p-2.5 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-slate-800 dark:text-slate-100"
                                                value={formData.details.confirmationMethod || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    details: { ...formData.details, confirmationMethod: e.target.value }
                                                })}
                                            >
                                                <option value="">Select Method...</option>
                                                <option value="Ultrasound">Ultrasound</option>
                                                <option value="Rectal Palpation">Rectal Palpation</option>
                                                <option value="Blood Test">Blood Test</option>
                                                <option value="Visual Observation">Visual Observation</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Confirmed By</label>
                                        <input
                                            type="text"
                                            className="w-full p-2.5 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-slate-800 dark:text-slate-100 placeholder-emerald-800/30"
                                            placeholder="e.g. Dr. Smith"
                                            value={formData.details.confirmedBy || ''}
                                            onChange={e => setFormData({
                                                ...formData,
                                                details: { ...formData.details, confirmedBy: e.target.value }
                                            })}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {formData.eventType === 'CALVING' && (
                        <div className="space-y-4 p-5 bg-purple-50 dark:bg-purple-900/10 rounded-2xl border border-purple-100 dark:border-purple-800/30 animate-in fade-in slide-in-from-top-2">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-2">
                                <Baby size={18} className="text-purple-600 dark:text-purple-400" />
                                <span className="font-rubik text-purple-900 dark:text-purple-200 text-xs font-bold uppercase tracking-widest">Register New Calf</span>
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Calf Tag ID</label>
                                    <input
                                        type="text"
                                        className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:bg-slate-800 dark:text-slate-100"
                                        placeholder="e.g. C-101"
                                        value={formData.calfDetails.tagNumber}
                                        onChange={e => setFormData({
                                            ...formData,
                                            calfDetails: { ...formData.calfDetails, tagNumber: e.target.value }
                                        })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Gender</label>
                                    <select
                                        className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:text-slate-100"
                                        value={formData.calfDetails.gender}
                                        onChange={e => setFormData({
                                            ...formData,
                                            calfDetails: { ...formData.calfDetails, gender: e.target.value }
                                        })}
                                    >
                                        <option value="FEMALE">Female (Heifer)</option>
                                        <option value="MALE">Male (Bull)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Breed</label>
                                    <input
                                        type="text"
                                        className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:bg-slate-800 dark:text-slate-100"
                                        placeholder="e.g. Holstein"
                                        value={formData.calfDetails.breed}
                                        onChange={e => setFormData({
                                            ...formData,
                                            calfDetails: { ...formData.calfDetails, breed: e.target.value }
                                        })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Birth Weight (kg)</label>
                                    <input
                                        type="number"
                                        className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:bg-slate-800 dark:text-slate-100"
                                        placeholder="0"
                                        value={formData.calfDetails.weight}
                                        onChange={e => setFormData({
                                            ...formData,
                                            calfDetails: { ...formData.calfDetails, weight: e.target.value }
                                        })}
                                    />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Sire / Semen Code (Optional)</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            list="calving-sire-options"
                                            className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:bg-slate-800 dark:text-slate-100"
                                            placeholder="Select or enter bull/semen code"
                                            value={formData.calfDetails.sireCode || ''}
                                            onChange={e => setFormData({
                                                ...formData,
                                                calfDetails: { ...formData.calfDetails, sireCode: e.target.value }
                                            })}
                                        />
                                        <datalist id="calving-sire-options">
                                            {semenList.map(s => (
                                                <option key={s.id} value={s.code}>{s.bull_name} ({s.breed})</option>
                                            ))}
                                            {embryoList.map(e => (
                                                <option key={e.id} value={e.code}>{e.bull_name} x {e.donor_cow} (Embryo)</option>
                                            ))}
                                        </datalist>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">If the mother was pregnant when purchased, you can link the father's genetics here.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notes / Technician</label>
                        <textarea
                            className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm min-h-[80px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 shadow-sm transition-all resize-none"
                            placeholder="Add any additional details or technician name..."
                            value={formData.details.notes}
                            onChange={e => setFormData({
                                ...formData,
                                details: { ...formData.details, notes: e.target.value }
                            })}
                        />
                    </div>

                    <div className="pt-6 flex gap-3 border-t border-slate-100 dark:border-slate-700/50">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-white dark:hover:bg-slate-600 transition-colors shadow-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !formData.animalId}
                            className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-sm hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transform active:scale-[0.98]"
                        >
                            {loading ? (
                                <>Saving...</>
                            ) : (
                                <><Save size={18} /> Save Event</>
                            )}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
