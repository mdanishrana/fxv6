import React, { useMemo, useRef, useState } from 'react';
import { Cattle } from '../types';
import { Beef, Download, AlertTriangle, Droplets, TrendingUp } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface PedigreeTreeProps {
    cattle: Cattle[];
    mainAnimal: Cattle;
    onSelectAnimal: (cattle: Cattle) => void;
    tenant?: any;
}

const PedigreeNode = ({ animal, fallbackTag, label, isMain, onClick }: { animal?: Cattle, fallbackTag?: string, label: string, isMain?: boolean, onClick?: () => void }) => {
    if (!animal) {
        return (
            <div className={`w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center opacity-60 min-h-[160px] ${isMain ? '' : 'hover:scale-105'} transition-transform duration-300`}>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">{label}</span>
                <span className="text-sm font-medium text-slate-500 break-words text-center w-full whitespace-normal">{fallbackTag || 'Unknown'}</span>
            </div>
        );
    }

    return (
        <div 
            onClick={onClick}
            className={`w-full min-h-[160px] py-4 bg-white dark:bg-slate-800 rounded-xl px-2 flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all border-2 relative group 
                ${isMain ? 'border-emerald-500 shadow-emerald-500/20 shadow-lg scale-110 z-10' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-indigo-500/20 hover:shadow-lg hover:scale-105'}`}
        >
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/5 dark:to-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10 flex flex-col items-center w-full">
                <div className="relative">
                    {animal.imageUrl ? (
                        <img src={animal.imageUrl} alt={animal.tagNumber} className="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-sm mb-1.5 transition-transform group-hover:scale-110" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 flex items-center justify-center border-2 border-white dark:border-slate-700 shadow-sm mb-1.5 transition-transform group-hover:scale-110">
                            <Beef size={20} />
                        </div>
                    )}
                    {/* Gender Indicator */}
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-sm ${animal.gender === 'Male' ? 'bg-blue-500' : 'bg-pink-500'}`}>
                        <span className="text-[8px] font-bold text-white">{animal.gender === 'Male' ? 'M' : 'F'}</span>
                    </div>
                </div>
                
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 mt-2 text-center w-full whitespace-normal">{label}</span>
                <span className="text-sm font-black text-slate-800 dark:text-slate-100 break-words text-center w-full whitespace-normal leading-normal">{animal.tagNumber}</span>
                
                {/* Stats row */}
                <div className="flex gap-2 mt-1 w-full justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                    {animal.gender === 'Female' && animal.currentDailyMilkYield ? (
                        <span className="flex items-center gap-1 text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                            <Droplets size={10} /> {animal.currentDailyMilkYield} L
                        </span>
                    ) : null}
                    {animal.gender === 'Male' && animal.dailyTargetGain ? (
                        <span className="flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                            <TrendingUp size={10} /> {animal.dailyTargetGain} kg/d
                        </span>
                    ) : null}
                </div>
            </div>
            
            {/* Status Badge */}
            <span className={`absolute top-2 right-2 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded z-10 ${
                animal.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' :
                animal.status === 'Sold' ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' :
                'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
            }`}>
                {animal.status}
            </span>
        </div>
    );
};

export const PedigreeTree: React.FC<PedigreeTreeProps> = ({ cattle, mainAnimal, onSelectAnimal, tenant }) => {
    const treeRef = useRef<HTMLDivElement>(null);
    const [isPrinting, setIsPrinting] = useState(false);

    // Find ancestors
    const sire = useMemo(() => cattle.find(c => c.tagNumber === mainAnimal.fatherTag), [cattle, mainAnimal]);
    const dam = useMemo(() => cattle.find(c => c.tagNumber === mainAnimal.motherTag), [cattle, mainAnimal]);

    const paternalGrandSire = useMemo(() => sire ? cattle.find(c => c.tagNumber === sire.fatherTag) : undefined, [cattle, sire]);
    const paternalGrandDam = useMemo(() => sire ? cattle.find(c => c.tagNumber === sire.motherTag) : undefined, [cattle, sire]);

    const maternalGrandSire = useMemo(() => dam ? cattle.find(c => c.tagNumber === dam.fatherTag) : undefined, [cattle, dam]);
    const maternalGrandDam = useMemo(() => dam ? cattle.find(c => c.tagNumber === dam.motherTag) : undefined, [cattle, dam]);

    const calves = useMemo(() => cattle.filter(c => c.fatherTag === mainAnimal.tagNumber || c.motherTag === mainAnimal.tagNumber || c.parentTag === mainAnimal.tagNumber), [cattle, mainAnimal]);

    // Inbreeding Check (2 Gens)
    const isInbred = useMemo(() => {
        const paternalTags = [sire?.tagNumber, sire?.fatherTag, sire?.motherTag, paternalGrandSire?.tagNumber, paternalGrandDam?.tagNumber].filter(Boolean);
        const maternalTags = [dam?.tagNumber, dam?.fatherTag, dam?.motherTag, maternalGrandSire?.tagNumber, maternalGrandDam?.tagNumber].filter(Boolean);
        return paternalTags.some(tag => maternalTags.includes(tag));
    }, [sire, dam, paternalGrandSire, paternalGrandDam, maternalGrandSire, maternalGrandDam]);

    const handlePrint = async () => {
        if (!treeRef.current) return;
        setIsPrinting(true);
        
        // Wait for React to render the print header and layout changes
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const element = treeRef.current;
            const originalOverflow = element.style.overflow;
            const originalWidth = element.style.width;
            
            element.style.overflow = 'visible';
            element.style.width = '1400px'; // Force wide enough canvas to prevent flex squishing
            
            const canvas = await html2canvas(element, { 
                scale: 2, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                windowWidth: 1400
            });
            
            element.style.overflow = originalOverflow;
            element.style.width = originalWidth;
            
            const imgData = canvas.toDataURL('image/png', 1.0);
            const pdf = new jsPDF('landscape', 'pt', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${mainAnimal.tagNumber}_Pedigree_Certificate.pdf`);
        } catch (error) {
            console.error("PDF generation failed:", error);
            alert("Failed to generate PDF. Please try again.");
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <div className="w-full bg-slate-50/50 dark:bg-slate-900/20 rounded-3xl p-6 md:p-12 overflow-x-auto border border-slate-200/60 dark:border-slate-800/60 shadow-inner relative">
            
            {/* Action Bar */}
            <div className="absolute top-4 right-4 z-20">
                <button 
                    onClick={handlePrint}
                    disabled={isPrinting}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-md disabled:opacity-50"
                >
                    <Download size={16} /> {isPrinting ? 'Generating PDF...' : 'Print Certificate'}
                </button>
            </div>

            <div 
                id="pedigree-tree-container" 
                ref={treeRef} 
                className={`flex flex-col items-center relative transition-all ${
                    isPrinting 
                    ? 'px-16 pt-16 pb-28 min-w-[1400px] bg-white border-[12px] border-double border-slate-300' 
                    : 'pb-8 pt-10 px-8 min-w-[900px] bg-slate-50/50 dark:bg-slate-900/20 rounded-3xl'
                }`}
            >
                
                {/* Print Header */}
                {isPrinting && (
                    <div className="absolute top-8 left-12 right-12 flex justify-between items-center pb-6 mb-8 border-b-2 border-slate-200">
                        <div className="flex items-center gap-3">
                            {tenant?.logoUrl || tenant?.logo ? (
                                <img src={tenant.logoUrl || tenant.logo} alt="Farm Logo" className="w-16 h-16 object-contain" />
                            ) : (
                                <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl">
                                    {tenant?.name?.charAt(0) || 'F'}
                                </div>
                            )}
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">{tenant?.name || 'Farm Pedigree'}</h2>
                                <p className="text-md text-slate-500 mt-1">Official Certificate of Ancestry</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <h3 className="text-lg font-bold text-indigo-600">{mainAnimal.tagNumber}</h3>
                            <p className="text-sm text-slate-500">{mainAnimal.breed} • {mainAnimal.gender}</p>
                        </div>
                    </div>
                )}

                {isInbred && !isPrinting && (
                    <div className="mb-8 flex items-center gap-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-4 py-2 rounded-xl text-sm font-bold shadow-sm border border-amber-200 dark:border-amber-800/50 animate-pulse mt-4">
                        <AlertTriangle size={18} /> Potential Inbreeding Detected in Lineage
                    </div>
                )}
                
                {/* GRANDPARENTS ROW */}
                <div className={`flex gap-16 justify-center w-full ${isPrinting ? 'mt-24' : 'mt-4'}`}>
                    {/* PATERNAL SIDE */}
                    <div className="flex flex-col items-center">
                        <div className="flex gap-4">
                            <div className="w-40"><PedigreeNode animal={paternalGrandSire} label="Grand Sire" onClick={() => paternalGrandSire && onSelectAnimal(paternalGrandSire)} /></div>
                            <div className="w-40"><PedigreeNode animal={paternalGrandDam} label="Grand Dam" onClick={() => paternalGrandDam && onSelectAnimal(paternalGrandDam)} /></div>
                        </div>
                        {/* Bracket */}
                        <div className="flex flex-col items-center w-[11rem]">
                            <svg className="w-full h-10 mt-2" viewBox="0 0 100 40" preserveAspectRatio="none">
                                <path d="M 0,0 C 0,20 50,20 50,40 M 100,0 C 100,20 50,20 50,40" fill="none" stroke="currentColor" strokeWidth="3" className="text-indigo-300 dark:text-indigo-800" strokeLinecap="round" />
                            </svg>
                        </div>
                        {/* PARENT: SIRE */}
                        <div className="w-48 mt-1">
                            <PedigreeNode animal={sire} fallbackTag={mainAnimal.fatherTag} label="Sire (Father)" onClick={() => sire && onSelectAnimal(sire)} />
                        </div>
                    </div>

                    {/* MATERNAL SIDE */}
                    <div className="flex flex-col items-center">
                        <div className="flex gap-4">
                            <div className="w-40"><PedigreeNode animal={maternalGrandSire} label="Grand Sire" onClick={() => maternalGrandSire && onSelectAnimal(maternalGrandSire)} /></div>
                            <div className="w-40"><PedigreeNode animal={maternalGrandDam} label="Grand Dam" onClick={() => maternalGrandDam && onSelectAnimal(maternalGrandDam)} /></div>
                        </div>
                        {/* Bracket */}
                        <div className="flex flex-col items-center w-[11rem]">
                            <svg className="w-full h-10 mt-2" viewBox="0 0 100 40" preserveAspectRatio="none">
                                <path d="M 0,0 C 0,20 50,20 50,40 M 100,0 C 100,20 50,20 50,40" fill="none" stroke="currentColor" strokeWidth="3" className="text-pink-300 dark:text-pink-900/70" strokeLinecap="round" />
                            </svg>
                        </div>
                        {/* PARENT: DAM */}
                        <div className="w-48 mt-1">
                            <PedigreeNode animal={dam} fallbackTag={mainAnimal.motherTag} label="Dam (Mother)" onClick={() => dam && onSelectAnimal(dam)} />
                        </div>
                    </div>
                </div>

                {/* PARENTS TO MAIN ANIMAL BRACKET */}
                <div className="flex flex-col items-center w-[16rem]">
                    <svg className="w-full h-12 mt-4" viewBox="0 0 100 40" preserveAspectRatio="none">
                        <path d="M 0,0 C 0,20 50,20 50,40 M 100,0 C 100,20 50,20 50,40" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-300 dark:text-emerald-700/80" strokeLinecap="round" />
                    </svg>
                </div>

                {/* MAIN ANIMAL */}
                <div className="w-56 relative z-10">
                    <PedigreeNode animal={mainAnimal} label="Selected Animal" isMain />
                </div>

                {/* MAIN ANIMAL TO CALVES BRACKET */}
                {calves.length > 0 && (
                    <div className="flex flex-col items-center w-full">
                        <svg className="w-[2px] h-8 mt-2" viewBox="0 0 2 40" preserveAspectRatio="none">
                            <path d="M 1,0 L 1,40" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-300 dark:text-emerald-700/80" strokeLinecap="round" />
                        </svg>
                        
                        <div className="flex gap-4 justify-center relative">
                            {calves.length > 1 && (
                                <div className="absolute top-0 left-[50%] right-[50%] border-t-2 border-emerald-300 dark:border-emerald-700/80 -translate-x-[50%]" style={{ width: `${(calves.length - 1) * 11}rem` }}></div>
                            )}
                            {calves.map(calf => (
                                <div key={calf.id} className="w-40 flex flex-col items-center">
                                    {calves.length > 1 ? (
                                        <svg className="w-[2px] h-6" viewBox="0 0 2 30" preserveAspectRatio="none">
                                            <path d="M 1,0 L 1,30" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-300 dark:text-emerald-700/80" />
                                        </svg>
                                    ) : (
                                        <svg className="w-[2px] h-6" viewBox="0 0 2 30" preserveAspectRatio="none">
                                            <path d="M 1,0 L 1,30" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-300 dark:text-emerald-700/80" />
                                        </svg>
                                    )}
                                    <div className="w-full">
                                        <PedigreeNode animal={calf} label="Offspring" onClick={() => onSelectAnimal(calf)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Print Footer */}
                {isPrinting && (
                    <div className="absolute bottom-8 left-12 right-12 flex justify-between items-center pt-4 border-t-2 border-slate-200">
                        <div className="text-sm text-slate-500 font-medium">
                            Generated by <span className="font-bold text-emerald-600">FarmXpert</span> Software
                        </div>
                        <div className="flex items-center gap-2">
                            <img src="/logo.png" alt="FarmXpert" className="h-8 object-contain" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

