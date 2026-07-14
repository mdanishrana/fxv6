import React, { useMemo, useState, useEffect } from 'react';
import { Cattle, VaccinationRecord, MedicalItem } from '../../types';
import { Syringe, AlertCircle, CheckCircle2, Clock, CalendarPlus, X } from 'lucide-react';
import { api } from '../../services/api';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { PAKISTAN_PROTOCOLS } from '../VaccinationProtocols';

interface VaccinationReportProps {
    cattle: Cattle[];
    tenant: any;
}

export const VaccinationReport: React.FC<VaccinationReportProps> = ({ cattle, tenant }) => {
    
    const [selectedCattleIds, setSelectedCattleIds] = useState<string[]>([]);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkForm, setBulkForm] = useState({ date: new Date().toISOString().split('T')[0], name: '', provider: 'STOCK' as 'STOCK' | 'DOCTOR', status: 'COMPLETED' as 'SCHEDULED' | 'COMPLETED' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [typeFilter, setTypeFilter] = useState<string>('All');
    const [medicalInventory, setMedicalInventory] = useState<MedicalItem[]>([]);

    useEffect(() => {
        if (tenant?.id) {
            api.medical.list(tenant.id).then(data => {
                setMedicalInventory(data || []);
            }).catch(console.error);
        }
    }, [tenant?.id]);

    const upcomingVaccinations = useMemo(() => {
        const today = new Date();
        const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const sixtyDays = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
        
        const schedule: any[] = [];
        
        cattle.filter(c => ['Active', 'Quarantine'].includes(c.status)).forEach(c => {
            if (c.vaccinationHistory && c.vaccinationHistory.length > 0) {
                const latestByVaccine = new Map<string, any>();
                c.vaccinationHistory.forEach(v => {
                    const existing = latestByVaccine.get(v.vaccineName);
                    if (!existing || new Date(v.date) > new Date(existing.date)) {
                        latestByVaccine.set(v.vaccineName, v);
                    }
                });

                latestByVaccine.forEach(v => {
                    let needsBoosterDate: Date | null = null;
                    let targetVaccine = v.vaccineName;

                    if (v.status === 'SCHEDULED') {
                        needsBoosterDate = new Date(v.date);
                    } else if (v.status === 'COMPLETED') {
                        if (v.nextBoosterDate) {
                            needsBoosterDate = new Date(v.nextBoosterDate);
                            targetVaccine = `${v.vaccineName} (Booster)`;
                        } else {
                            const lastDate = new Date(v.date);
                            needsBoosterDate = new Date(lastDate.getTime() + 365 * 24 * 60 * 60 * 1000);
                            targetVaccine = `${v.vaccineName} (Predicted Booster)`;
                        }
                    }

                    if (needsBoosterDate) {
                        let urgency = 'OK';
                        if (needsBoosterDate < today) urgency = 'OVERDUE';
                        else if (needsBoosterDate <= thirtyDays) urgency = '30_DAYS';
                        else if (needsBoosterDate <= sixtyDays) urgency = '60_DAYS';

                        if (urgency !== 'OK') {
                            schedule.push({
                                id: `${c.id}-${v.id}-${urgency}`,
                                cattleId: c.id,
                                animalType: c.type,
                                tagNumber: c.tagNumber,
                                breed: c.breed,
                                dueDate: needsBoosterDate.toLocaleDateString(),
                                urgency,
                                lastVaccine: targetVaccine
                            });
                        }
                    }
                });
            } else {
                // Never vaccinated
                schedule.push({
                    id: `${c.id}-never-vax`,
                    cattleId: c.id,
                    animalType: c.type,
                    tagNumber: c.tagNumber,
                    breed: c.breed,
                    dueDate: today.toLocaleDateString(),
                    urgency: 'OVERDUE',
                    lastVaccine: 'None Recorded'
                });
            }
        });
        
        return schedule
            .filter(v => {
                if (typeFilter === 'All') return true;
                if (typeFilter === 'Cattle') return ['Cow', 'Bull', 'Calf'].includes(v.animalType);
                if (typeFilter === 'Small') return ['Goat', 'Sheep'].includes(v.animalType);
                return v.animalType === typeFilter;
            })
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }, [cattle, typeFilter]);

    const handlePrintSchedule = () => {
        const doc = new jsPDF();

        // Premium Header Background
        doc.setFillColor(225, 29, 72); // Rose 600
        doc.rect(0, 0, doc.internal.pageSize.width, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text(`${tenant.name || 'Farm'}`, 14, 22);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`VACCINATION COMPLIANCE SCHEDULE`, 14, 32);
        
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 50);

        const tableColumn = ["Tag #", "Breed", "Last Vaccine", "Next Due Date", "Status"];
        const tableRows = upcomingVaccinations.map(v => [
            v.tagNumber,
            v.breed,
            v.lastVaccine,
            v.dueDate,
            v.urgency === 'OVERDUE' ? 'OVERDUE' : v.urgency === '30_DAYS' ? 'Due in < 30 Days' : 'Due in < 60 Days'
        ]);

        (doc as any).autoTable({
            startY: 60,
            head: [tableColumn],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [225, 29, 72] }, // Rose 600
        });

        doc.save(`Vaccination_Schedule_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handleBulkSubmit = async () => {
        setIsSubmitting(true);
        try {
            await Promise.all(selectedCattleIds.map(async (cattleId) => {
                const targetCattle = cattle.find(c => c.id === cattleId);
                if (!targetCattle) return;

                const selectedMedicalItem = medicalInventory.find(m => m.name === bulkForm.name);

                const newRecord: VaccinationRecord = {
                    id: crypto.randomUUID(),
                    date: bulkForm.date,
                    vaccineName: bulkForm.name,
                    batchNumber: selectedMedicalItem?.batchNumber,
                    medicalItemId: selectedMedicalItem?.id,
                    type: 'VACCINE',
                    provider: bulkForm.provider,
                    status: bulkForm.status
                };

                if (bulkForm.status === 'COMPLETED' && bulkForm.provider === 'STOCK' && selectedMedicalItem) {
                    await api.cattle.addMedicalRecord(tenant.id, targetCattle.id, {
                        medicalItemId: selectedMedicalItem.id,
                        date: bulkForm.date,
                        notes: `Bulk Administered`,
                        dose: 1,
                        name: bulkForm.name,
                        type: 'VACCINE',
                        provider: bulkForm.provider,
                        status: bulkForm.status
                    });
                } else {
                    const updatedHistory = [...(targetCattle.vaccinationHistory || []), newRecord];
                    await api.cattle.update(tenant.id, targetCattle.id, {
                        vaccinationHistory: updatedHistory
                    });
                }
            }));
            
            window.location.reload();
        } catch (error) {
            console.error("Bulk scheduling failed", error);
            alert("Failed to bulk schedule vaccines.");
            setIsSubmitting(false);
        }
    };

    const selectedAnimalTypes = useMemo(() => {
        const types = new Set<string>();
        selectedCattleIds.forEach(id => {
            const cattleItem = cattle.find(c => c.id === id);
            if (cattleItem) types.add(cattleItem.type);
        });
        return Array.from(types);
    }, [selectedCattleIds, cattle]);

    const isOnlyCattle = selectedAnimalTypes.length > 0 && selectedAnimalTypes.every(t => ['Cow', 'Bull', 'Calf'].includes(t));
    const isOnlySmall = selectedAnimalTypes.length > 0 && selectedAnimalTypes.every(t => ['Goat', 'Sheep'].includes(t));

    const availableVaccines = useMemo(() => {
        return medicalInventory.filter(item => {
            // Allow if type is VACCINE or if type is missing (legacy)
            if (item.type === 'MEDICINE') return false;
            
            let tAnimal = item.targetAnimal || 'Both';
            if (!item.targetAnimal) {
                const nameUpper = item.name.toUpperCase();
                if (nameUpper.includes('FMD') || nameUpper.includes('LSD') || nameUpper.includes('HS') || nameUpper.includes('BQ') || nameUpper.includes('CHOR MAR') || nameUpper.includes('GAL GHOTU') || nameUpper.includes('MUNH KHUR')) tAnimal = 'Cow';
                if (nameUpper.includes('PPR') || nameUpper.includes('ET') || nameUpper.includes('ANTARI MAAR')) tAnimal = 'Goat';
            }
            
            let matchesAnimal = true;
            if (isOnlyCattle && tAnimal === 'Goat') {
                matchesAnimal = false;
            } else if (isOnlySmall && tAnimal === 'Cow') {
                matchesAnimal = false;
            }
            
            return matchesAnimal;
        });
    }, [medicalInventory, isOnlyCattle, isOnlySmall]);

    const availableDoctorVaccines = useMemo(() => {
        return PAKISTAN_PROTOCOLS.filter(p => {
            if (isOnlyCattle) return p.target === "Cows / Buffalos";
            if (isOnlySmall) return p.target === "Goats / Sheep";
            return true;
        });
    }, [isOnlyCattle, isOnlySmall]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] border border-slate-200/60 dark:border-slate-700/60">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div className="flex items-center gap-4">
                        <div className="bg-rose-100 dark:bg-rose-900/30 p-4 rounded-2xl text-rose-600 dark:text-rose-400">
                            <Syringe size={32} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Vaccination Compliance Schedule</h3>
                            <div className="flex items-center gap-4 mt-2">
                                <p className="text-slate-500 text-sm">Predictive booster tracking based on 12-month cycles.</p>
                                <select 
                                    value={typeFilter}
                                    onChange={(e) => {
                                        setTypeFilter(e.target.value);
                                        setSelectedCattleIds([]); // Clear selection when filter changes
                                    }}
                                    className="px-3 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                                >
                                    <option value="All">All Animals</option>
                                    <option value="Cattle">Cattle (Cows/Bulls/Calves)</option>
                                    <option value="Small">Small Ruminants (Goats/Sheep)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedCattleIds.length > 0 && (
                            <button 
                                onClick={() => setShowBulkModal(true)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center gap-2"
                            >
                                <CalendarPlus size={20} />
                                Bulk Schedule ({selectedCattleIds.length})
                            </button>
                        )}
                        <button 
                            onClick={handlePrintSchedule}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-rose-600/20 active:scale-95"
                        >
                            Export PDF Schedule
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 p-5 rounded-2xl flex items-center gap-4">
                        <AlertCircle className="text-rose-500" size={32} />
                        <div>
                            <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{upcomingVaccinations.filter(v => v.urgency === 'OVERDUE').length}</p>
                            <p className="text-xs uppercase font-bold text-rose-500">Overdue Boosters</p>
                        </div>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-5 rounded-2xl flex items-center gap-4">
                        <Clock className="text-amber-500" size={32} />
                        <div>
                            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{upcomingVaccinations.filter(v => v.urgency === '30_DAYS').length}</p>
                            <p className="text-xs uppercase font-bold text-amber-500">Due in 30 Days</p>
                        </div>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 p-5 rounded-2xl flex items-center gap-4">
                        <CheckCircle2 className="text-emerald-500" size={32} />
                        <div>
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                                {cattle.filter(c => ['Active', 'Quarantine'].includes(c.status)).length - upcomingVaccinations.length}
                            </p>
                            <p className="text-xs uppercase font-bold text-emerald-500">Fully Protected</p>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 text-sm">
                                <th className="pb-3 font-semibold px-4 w-12">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedCattleIds.length === upcomingVaccinations.length && upcomingVaccinations.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedCattleIds(upcomingVaccinations.map(v => v.cattleId));
                                            } else {
                                                setSelectedCattleIds([]);
                                            }
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                </th>
                                <th className="pb-3 font-semibold px-4">Tag Number</th>
                                <th className="pb-3 font-semibold px-4">Breed</th>
                                <th className="pb-3 font-semibold px-4">Last Vaccine</th>
                                <th className="pb-3 font-semibold px-4">Due Date</th>
                                <th className="pb-3 font-semibold px-4 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {upcomingVaccinations.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-400">All cattle are up to date on vaccinations.</td>
                                </tr>
                            ) : (
                                upcomingVaccinations.map(v => (
                                    <tr key={v.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="py-4 px-4">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedCattleIds.includes(v.cattleId)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedCattleIds(prev => [...prev, v.cattleId]);
                                                    } else {
                                                        setSelectedCattleIds(prev => prev.filter(id => id !== v.cattleId));
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                            />
                                        </td>
                                        <td className="py-4 px-4 font-bold text-slate-800 dark:text-slate-200">{v.tagNumber}</td>
                                        <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{v.breed}</td>
                                        <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{v.lastVaccine}</td>
                                        <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{v.dueDate}</td>
                                        <td className="py-4 px-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                v.urgency === 'OVERDUE' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400' :
                                                v.urgency === '30_DAYS' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' :
                                                'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                                            }`}>
                                                {v.urgency === 'OVERDUE' ? 'Overdue' : v.urgency === '30_DAYS' ? '< 30 Days' : '< 60 Days'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk Schedule Modal */}
            {showBulkModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 relative">
                        <button onClick={() => setShowBulkModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                            <X size={24} />
                        </button>
                        
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-3 rounded-2xl text-indigo-600 dark:text-indigo-400">
                                <CalendarPlus size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Bulk Record Vaccines</h3>
                                <p className="text-sm text-slate-500">For {selectedCattleIds.length} selected animals</p>
                            </div>
                        </div>

                        <div className="space-y-4 mb-8">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Provider</label>
                                <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl mb-4">
                                    <button
                                        onClick={() => setBulkForm({ ...bulkForm, provider: 'STOCK', name: '' })}
                                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors ${bulkForm.provider === 'STOCK' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        From Stock
                                    </button>
                                    <button
                                        onClick={() => setBulkForm({ ...bulkForm, provider: 'DOCTOR', name: '' })}
                                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors ${bulkForm.provider === 'DOCTOR' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        Doctor Provided
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status</label>
                                <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl mb-4">
                                    <button
                                        onClick={() => setBulkForm({ ...bulkForm, status: 'COMPLETED' })}
                                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors ${bulkForm.status === 'COMPLETED' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        Completed (Administered)
                                    </button>
                                    <button
                                        onClick={() => setBulkForm({ ...bulkForm, status: 'SCHEDULED' })}
                                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors ${bulkForm.status === 'SCHEDULED' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        Scheduled (Future)
                                    </button>
                                </div>
                            </div>
                            
                            {bulkForm.provider === 'STOCK' ? (
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Vaccine Name (From Inventory)</label>
                                        <span className="text-[10px] text-slate-400">Debug: total {medicalInventory.length}, valid {availableVaccines.length}</span>
                                    </div>
                                    <select 
                                        value={bulkForm.name}
                                        onChange={(e) => setBulkForm({ ...bulkForm, name: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                    >
                                        <option value="" disabled>Select a vaccine...</option>
                                        {availableVaccines.map(v => (
                                            <option key={v.id} value={v.name}>{v.name} {v.batchNumber ? `(Batch: ${v.batchNumber})` : ''}</option>
                                        ))}
                                    </select>
                                    {availableVaccines.length === 0 && (
                                        <p className="text-xs text-rose-500 mt-2 relative z-10">No active vaccines found in inventory for the selected animal types.</p>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Standard Protocol Vaccines</label>
                                    <select 
                                        value={bulkForm.name}
                                        onChange={(e) => setBulkForm({ ...bulkForm, name: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                    >
                                        <option value="" disabled>Select a protocol vaccine...</option>
                                        {availableDoctorVaccines.map(p => (
                                            <option key={p.disease} value={p.disease}>{p.disease}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Schedule Date</label>
                                <input 
                                    type="date"
                                    value={bulkForm.date}
                                    onChange={(e) => setBulkForm({ ...bulkForm, date: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowBulkModal(false)}
                                className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleBulkSubmit}
                                disabled={isSubmitting || !bulkForm.name}
                                className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                            >
                                {isSubmitting ? 'Saving...' : 'Save Record'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
