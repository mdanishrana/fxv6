import React from 'react';
import { Cattle, Tenant, UserRole } from '../types';
import { BarChart3, Printer, DollarSign, ShieldCheck, FileSpreadsheet, Download, Syringe } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { FCRReport } from './reports/FCRReport';
import { QurbaniProjectionReport } from './reports/QurbaniProjectionReport';

type ReportsHubTab = 'EXPORTS' | 'FCR' | 'QURBANI';

interface ReportsHubProps {
    cattle: Cattle[];
    tenant: Tenant;
    userRole: UserRole;
}

export const ReportsHub: React.FC<ReportsHubProps> = ({ cattle, tenant, userRole }) => {
    const [activeTab, setActiveTab] = React.useState<ReportsHubTab>('EXPORTS');

    // Derived states
    const activeCattle = cattle.filter(c => ['Active', 'Quarantine', 'Ready for Sale'].includes(c.status));
    const soldCattle = cattle.filter(c => c.status === 'Sold');
    const currencySymbol = tenant.currency === 'PKR' ? 'Rs.' :
        tenant.currency === 'USD' ? '$' :
            tenant.currency === 'EUR' ? '€' :
                tenant.currency === 'GBP' ? '£' :
                    tenant.currency === 'INR' ? '₹' : 'Rs.';
    const weightUnit = tenant.weightUnit || 'kg';
    const canSeeFinancials = (tenant.modules.includes('FINANCE') || tenant.modules.includes('CORE')) && (userRole === 'OWNER' || userRole === 'MANAGER');

    const handlePrintInventory = () => {
        const doc = new jsPDF();

        // Premium Header Background
        doc.setFillColor(16, 185, 129); // Emerald 500
        doc.rect(0, 0, doc.internal.pageSize.width, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text(`${tenant.name || 'Farm'}`, 14, 22);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`OFFICIAL HERD INVENTORY REPORT`, 14, 32);
        
        doc.setTextColor(100, 116, 139); // Slate 500
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 50);
        
        // Summary Box
        doc.setFillColor(241, 245, 249);
        doc.rect(14, 55, 80, 20, 'F');
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Active Heads: ${activeCattle.length}`, 18, 67);

        const tableColumn = ["Tag #", "Type", "Breed", "Gender", "Current Wt.", "Status", "Owner"];
        const tableRows = activeCattle.map(c => [
            c.tagNumber,
            c.type,
            c.breed,
            c.gender,
            `${c.currentWeight} kg`,
            c.status,
            c.ownerName
        ]);

        (doc as any).autoTable({
            startY: 85,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129] }, // Emerald 500
        });

        doc.save(`Herd_Inventory_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handlePrintSales = () => {
        if (!canSeeFinancials) return;

        const doc = new jsPDF();

        // Premium Header Background
        doc.setFillColor(59, 130, 246); // Blue 500
        doc.rect(0, 0, doc.internal.pageSize.width, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text(`${tenant.name || 'Farm'}`, 14, 22);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`SALES & REVENUE REPORT`, 14, 32);
        
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 50);

        let totalRevenue = 0;
        let totalCost = 0;

        const tableColumn = ["Tag #", "Sale Date", "Purchase Price", "Sale Revenue", "Gross Margin"];
        const tableRows = soldCattle.map(c => {
            const saleTx = c.transactions?.find(t => t.type === 'SALE');
            const revenue = saleTx ? saleTx.amount : 0;
            const cost = Number(c.purchasePrice) || 0;
            const margin = revenue - cost;

            totalRevenue += revenue;
            totalCost += cost;

            return [
                c.tagNumber,
                saleTx ? new Date(saleTx.date).toLocaleDateString() : 'Unknown',
                `${currencySymbol} ${cost.toLocaleString()}`,
                `${currencySymbol} ${revenue.toLocaleString()}`,
                `${currencySymbol} ${margin.toLocaleString()}`
            ];
        });
        
        // Summary Box
        doc.setFillColor(239, 246, 255); // Blue 50
        doc.rect(14, 55, 180, 25, 'F');
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Animals Sold: ${soldCattle.length}`, 18, 65);
        doc.text(`Gross Margin YTD: ${currencySymbol} ${(totalRevenue - totalCost).toLocaleString()}`, 18, 73);

        (doc as any).autoTable({
            startY: 90,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] },
            foot: [
                ['TOTALS', '', `${currencySymbol} ${totalCost.toLocaleString()}`, `${currencySymbol} ${totalRevenue.toLocaleString()}`, `${currencySymbol} ${(totalRevenue - totalCost).toLocaleString()}`]
            ],
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
        });

        doc.save(`Sales_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handleExportCSV = () => {
        const headers = [
            'Tag Number', 'Name', 'Breed', 'Gender', 'Teeth', 'Status',
            'Current Weight (kg)', 'Target Weight (kg)', 'Daily Gain Goal (kg)',
            'Entry Date', 'Entry Weight', 'Purchase Price',
            'Owner Name', 'Owner Mobile', 'Package',
            'Vaccination Status', 'Notes',
            'Weight History', 'Vaccination History'
        ];

        const csvContent = [
            headers.join(','),
            ...cattle.map(c => {
                const wHist = c.weightHistory.map(w => `${w.date}:${w.weight}`).join(' | ');
                const vHist = c.vaccinationHistory.map(v => `${v.date}:${v.vaccineName}`).join(' | ');

                return [
                    c.tagNumber,
                    c.name || '',
                    c.breed,
                    c.gender,
                    c.teeth,
                    c.status,
                    c.currentWeight,
                    c.targetWeight,
                    c.dailyTargetGain || '',
                    c.entryDate,
                    c.entryWeight,
                    c.purchasePrice,
                    `"${c.ownerName}"`,
                    c.ownerMobile || '',
                    c.monthlyPackageId,
                    c.vaccinationStatus ? 'Yes' : 'No',
                    `"${(c.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                    `"${wHist}"`,
                    `"${vHist}"`
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `farm_dataset_full_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6 animate-fade-in relative z-10 w-full">

            {/* Reports Hub Sub-Navigation */}
            <div className="flex gap-2 p-1.5 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl overflow-x-auto w-fit mb-8 border border-white/50 dark:border-slate-800/50 shadow-sm">
                <button
                    onClick={() => setActiveTab('EXPORTS')}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'EXPORTS'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm shadow-slate-200/50 dark:shadow-none'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                        }`}
                >
                    <Download size={18} className={activeTab === 'EXPORTS' ? 'text-blue-500' : ''} /> Default Exports
                </button>
                <button
                    onClick={() => setActiveTab('FCR')}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'FCR'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm shadow-slate-200/50 dark:shadow-none'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                        }`}
                >
                    <BarChart3 size={18} className={activeTab === 'FCR' ? 'text-indigo-500' : ''} /> Feed Efficiency (FCR)
                </button>
                <button
                    onClick={() => setActiveTab('QURBANI')}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'QURBANI'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm shadow-slate-200/50 dark:shadow-none'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                        }`}
                >
                    <DollarSign size={18} className={activeTab === 'QURBANI' ? 'text-emerald-500' : ''} /> Qurbani Projections
                </button>
            </div>

            {/* Active Render Area */}
            {activeTab === 'EXPORTS' && (
                <>
                    {/* Live KPI Widgets for Command Center */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl shadow-sm hover:shadow-[0_8px_30px_rgb(16,185,129,0.15)] border border-white/50 dark:border-slate-800/50 hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-all duration-300 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-4 -mt-4 blur-2xl"></div>
                            <div className="relative z-10">
                                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Total Active Inventory</p>
                                <p className="text-4xl font-black text-slate-800 dark:text-white tracking-tight">{activeCattle.length}</p>
                            </div>
                        </div>
                        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl shadow-sm hover:shadow-[0_8px_30px_rgb(59,130,246,0.15)] border border-white/50 dark:border-slate-800/50 hover:border-blue-200 dark:hover:border-blue-900/50 transition-all duration-300 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-4 -mt-4 blur-2xl"></div>
                            <div className="relative z-10">
                                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Animals Sold</p>
                                <p className="text-4xl font-black text-slate-800 dark:text-white tracking-tight">{soldCattle.length}</p>
                            </div>
                        </div>
                        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl shadow-sm hover:shadow-[0_8px_30px_rgb(245,158,11,0.15)] border border-white/50 dark:border-slate-800/50 hover:border-amber-200 dark:hover:border-amber-900/50 transition-all duration-300 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-4 -mt-4 blur-2xl"></div>
                            <div className="relative z-10">
                                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Avg Current Weight</p>
                                <p className="text-4xl font-black text-slate-800 dark:text-white tracking-tight">{activeCattle.length > 0 ? Math.round(activeCattle.reduce((sum, c) => sum + c.currentWeight, 0) / activeCattle.length) : 0} <span className="text-lg font-bold text-slate-500">kg</span></p>
                            </div>
                        </div>
                        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl shadow-sm hover:shadow-[0_8px_30px_rgb(168,85,247,0.15)] border border-white/50 dark:border-slate-800/50 hover:border-purple-200 dark:hover:border-purple-900/50 transition-all duration-300 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-400/20 to-transparent rounded-bl-full -mr-4 -mt-4 blur-2xl"></div>
                            <div className="relative z-10">
                                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Gross Margin YTD</p>
                                <p className="text-3xl font-black text-slate-800 dark:text-white tracking-tight text-wrap max-w-[150px]">
                                    {canSeeFinancials ? (
                                        <>
                                            <span className="text-lg text-emerald-500 mr-1">{currencySymbol}</span>
                                            {soldCattle.reduce((sum, c) => sum + ((c.transactions?.find(t => t.type === 'SALE')?.amount || 0) - (Number(c.purchasePrice) || 0)), 0).toLocaleString()}
                                        </>
                                    ) : 'Locked'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

                        {/* Inventory PDF Area */}
                        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-8 rounded-3xl shadow-sm hover:shadow-[0_8px_30px_rgb(16,185,129,0.15)] border border-white/50 dark:border-slate-800/50 hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-all duration-300 hover:-translate-y-1 group flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/10 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 rounded-2xl shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                                        <Printer size={28} />
                                    </div>
                                    <h4 className="font-black tracking-tight text-xl text-slate-900 dark:text-slate-100">Herd Inventory</h4>
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium text-sm leading-relaxed">
                                    Generate a clean, printable PDF of all currently active cattle on the farm. Includes weights, breed, owners, and primary attributes.
                                </p>
                            </div>
                            <button
                                onClick={handlePrintInventory}
                                className="w-full py-4 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-white/20 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-2xl font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 relative z-10"
                            >
                                <Download size={18} /> Download PDF
                            </button>
                        </div>

                        {/* Sales PDF Area */}
                        <div className={`bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-8 rounded-3xl shadow-sm border transition-all duration-300 flex flex-col justify-between relative overflow-hidden ${canSeeFinancials ? 'hover:shadow-[0_8px_30px_rgb(59,130,246,0.15)] border-white/50 dark:border-slate-800/50 hover:border-blue-200 dark:hover:border-blue-900/50 hover:-translate-y-1 group' : 'border-white/30 dark:border-slate-800/30 opacity-60'}`}>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/10 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className={`p-4 rounded-2xl transition-transform ${canSeeFinancials ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 group-hover:scale-110' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
                                        <DollarSign size={28} />
                                    </div>
                                    <h4 className="font-black tracking-tight text-xl text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        Sales & Revenue
                                        {!canSeeFinancials && <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-full text-slate-500 font-bold uppercase tracking-wider">Locked</span>}
                                    </h4>
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium text-sm leading-relaxed">
                                    {canSeeFinancials
                                        ? "Generate a financial breakdown of sold animals, automatically calculating the gross margin per head based on purchase price vs exact sale revenue."
                                        : "Financial reporting requires the active Finance module or Owner/Manager level permissions."}
                                </p>
                            </div>
                            <button
                                onClick={handlePrintSales}
                                disabled={!canSeeFinancials}
                                className="w-full py-4 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-white/20 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 relative z-10"
                            >
                                <Download size={18} /> Download PDF
                            </button>
                        </div>

                        {/* Full Data CSV Dump */}
                        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-8 rounded-3xl shadow-sm hover:shadow-[0_8px_30px_rgb(168,85,247,0.15)] border border-white/50 dark:border-slate-800/50 hover:border-purple-200 dark:hover:border-purple-900/50 transition-all duration-300 hover:-translate-y-1 group flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/10 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="bg-gradient-to-br from-purple-500 to-pink-600 text-white p-4 rounded-2xl shadow-lg shadow-purple-500/30 group-hover:scale-110 transition-transform">
                                        <FileSpreadsheet size={28} />
                                    </div>
                                    <h4 className="font-black tracking-tight text-xl text-slate-900 dark:text-slate-100">Full DB Export</h4>
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium text-sm leading-relaxed">
                                    Download the complete raw dataset for the entire farm inventory. This includes historical weights, vaccination histories, and notes in an Excel-ready CSV format.
                                </p>
                            </div>
                            <button
                                onClick={handleExportCSV}
                                className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-2xl font-bold shadow-lg shadow-purple-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 relative z-10"
                            >
                                <Download size={18} /> Export to CSV
                            </button>
                        </div>
                    </div>

                </>
            )}



            {activeTab === 'FCR' && (
                <FCRReport cattle={cattle} />
            )}

            {activeTab === 'QURBANI' && (
                <QurbaniProjectionReport cattle={cattle} tenant={tenant} />
            )}

        </div>
    );
};
