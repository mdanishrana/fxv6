import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { VaccinationReport } from './reports/VaccinationReport';
import { Cattle, Tenant } from '../types';

interface VaccinationProtocolsProps {
    cattle: Cattle[];
    tenant: Tenant;
}

export const PAKISTAN_PROTOCOLS = [
    {
            disease: "Foot and Mouth Disease (FMD)",
            localName: "Munh Khur",
            target: "Cows / Buffalos",
            frequency: "Every 6 Months",
            notes: "Critical. Highly contagious."
        },
        {
            disease: "Haemorrhagic Septicaemia (HS)",
            localName: "Gal Ghotu",
            target: "Cows / Buffalos",
            frequency: "Pre-Monsoon & Winter",
            notes: "Fatal. Must vaccinate before rains."
        },
        {
            disease: "Black Quarter (BQ)",
            localName: "Chor Mar",
            target: "Cows / Buffalos",
            frequency: "Annually",
            notes: "Usually before monsoon."
        },
        {
            disease: "Lumpy Skin Disease (LSD)",
            localName: "Lumpy",
            target: "Cows / Buffalos",
            frequency: "Annually",
            notes: "Viral disease spread by insects."
        },
        {
            disease: "Peste des Petits Ruminants (PPR)",
            localName: "Goat Plague",
            target: "Goats / Sheep",
            frequency: "Annually",
            notes: "Highly fatal for small ruminants."
        },
        {
            disease: "Enterotoxemia (ET)",
            localName: "Antari Maar",
            target: "Goats / Sheep",
            frequency: "Every 6 Months",
            notes: "Triggered by sudden feed changes."
        }
    ];

export const VaccinationProtocols: React.FC<VaccinationProtocolsProps> = ({ cattle, tenant }) => {

    return (
        <div className="space-y-8 animate-fade-in relative z-10 w-full">
            {/* Master List of Pakistan Protocols */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-sm border border-slate-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-4 mb-6">
                    <div className="bg-emerald-100 dark:bg-emerald-900/30 p-4 rounded-2xl text-emerald-600 dark:text-emerald-400">
                        <ShieldAlert size={32} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pakistan Standard Protocols</h3>
                        <p className="text-slate-500 text-sm">Mandatory vaccination schedule for local diseases.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {PAKISTAN_PROTOCOLS.map((protocol, idx) => (
                        <div key={idx} className="border border-slate-200 dark:border-slate-700 p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 hover:border-emerald-500/30 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-slate-800 dark:text-slate-200">{protocol.disease}</h4>
                                <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{protocol.target.includes('Goat') ? 'Goat' : 'Cow'}</span>
                            </div>
                            <p className="text-emerald-600 dark:text-emerald-400 text-sm font-bold mb-3 italic">"{protocol.localName}"</p>
                            <div className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
                                <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                    <span>Frequency:</span>
                                    <span className="font-semibold">{protocol.frequency}</span>
                                </div>
                                <div className="pt-1 text-xs">
                                    {protocol.notes}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Vaccination Schedule Engine */}
            <VaccinationReport cattle={cattle} tenant={tenant} />
        </div>
    );
};
