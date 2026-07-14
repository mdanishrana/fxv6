import React, { useState, useEffect, useMemo } from 'react';
import { Download, Filter, FileText, Search, Mail, Loader2, Wallet, ListChecks } from 'lucide-react';
import { api } from '../../services/api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CostItem {
    id: string;
    category: string;
    amount: number;
    notes: string;
    date: string;
    tagNumber: string;
    animalName: string | null;
}

interface AnimalCostReportProps {
    tenant: any; // Using any for now to avoid circular typing issues, but usually Tenant
}

export const AnimalCostReport: React.FC<AnimalCostReportProps> = ({ tenant }) => {
    const [costs, setCosts] = useState<CostItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        if (!tenant) return;
        const fetchCosts = async () => {
            setLoading(true);
            try {
                const res = await api.reports.getAnimalCosts(tenant.id);
                setCosts(res.costs || []);
            } catch (err) {
                console.error("Failed to fetch animal costs:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchCosts();
    }, [tenant]);

    const filteredCosts = useMemo(() => {
        return costs.filter(c => {
            const matchesSearch = searchTerm === '' ||
                (c.tagNumber && c.tagNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (c.animalName && c.animalName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (c.notes && c.notes.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesCategory = categoryFilter === 'ALL' || c.category === categoryFilter;
            return matchesSearch && matchesCategory;
        });
    }, [costs, searchTerm, categoryFilter]);

    const totalCost = filteredCosts.reduce((sum, item) => sum + item.amount, 0);

    const handleExportPDF = () => {
        setExporting(true);
        setTimeout(() => {
            try {
                const doc = new jsPDF();

                // Header
                doc.setFontSize(20);
                doc.setTextColor(40, 40, 40);
                doc.text('Animal Cost Breakdown Report', 14, 22);

                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
                doc.text(`Farm: ${tenant?.name || 'FarmXpert'}`, 14, 36);

                // Summary Block
                doc.setFillColor(245, 247, 250);
                doc.rect(14, 42, 182, 20, 'F');
                doc.setFontSize(12);
                doc.setTextColor(30, 41, 59);
                doc.text(`Total Filtered Cost: Rs. ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 20, 54);

                // Table Data
                const tableColumn = ["Date", "Tag Number", "Category", "Description", "Amount (Rs.)"];
                const tableRows = filteredCosts.map(item => [
                    new Date(item.date).toISOString().split('T')[0],
                    item.tagNumber,
                    item.category,
                    item.notes || '-',
                    item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })
                ]);

                autoTable(doc, {
                    startY: 70,
                    head: [tableColumn],
                    body: tableRows,
                    theme: 'grid',
                    headStyles: { fillColor: [79, 70, 229] },
                    styles: { fontSize: 9, cellPadding: 4 },
                    alternateRowStyles: { fillColor: [248, 250, 252] }
                });

                doc.save('animal_cost_report.pdf');
            } catch (err) {
                console.error("PDF Export failed", err);
                alert("Failed to generate PDF. Check console for details.");
            } finally {
                setExporting(false);
            }
        }, 500); // Small timeout to show loading state
    };

    const handleEmail = () => {
        const subject = encodeURIComponent(`Animal Cost Breakdown Report - ${new Date().toLocaleDateString()}`);
        let body = `Animal Cost Breakdown Report (Filtered Data)
Total Records: ${filteredCosts.length}
Total Cost: Rs. ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

`;
        if (filteredCosts.length > 0) {
            body += "Details:\n";
            filteredCosts.slice(0, 100).forEach(c => {
                body += `- Date: ${new Date(c.date).toISOString().split('T')[0]}, Tag: ${c.tagNumber}, Category: ${c.category}, Amount: Rs. ${c.amount}, Notes: ${c.notes || 'N/A'}\n`;
            });
            if (filteredCosts.length > 100) body += "\n(Report truncated to first 100 items for email. Please export to PDF for full report.)";
        } else {
            body += "No records found.";
        }

        window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Loader2 size={32} className="animate-spin text-indigo-500" />
                    <p>Loading cost data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <FileText size={20} className="text-indigo-500" />
                        Cost Breakdown Ledger
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Detailed view of every expense linked to specific animals.</p>
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                    <button
                        onClick={handleExportPDF}
                        disabled={exporting || filteredCosts.length === 0}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium text-sm rounded-xl transition-colors disabled:opacity-50"
                    >
                        {exporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        Export PDF
                    </button>
                    {/* Placeholder for Email feature as per requirements, could open a modal later */}
                    <button
                        onClick={handleEmail}
                        disabled={filteredCosts.length === 0}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-xl transition-colors disabled:opacity-50"
                        title="Send Summary via Email"
                    >
                        <Mail size={18} />
                        Email
                    </button>
                </div>
            </div>

            {/* Summary Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* Count Widget */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 flex items-center shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl mr-4 text-emerald-600 dark:text-indigo-400">
                        <ListChecks size={24} />
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Records Found</p>
                        <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{filteredCosts.length}</h4>
                    </div>
                </div>

                {/* Average Cost Widget */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 flex items-center shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl mr-4 text-emerald-600 dark:text-emerald-400">
                        <FileText size={24} />
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Average Cost</p>
                        <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                            Rs. {(filteredCosts.length > 0 ? totalCost / filteredCosts.length : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h4>
                    </div>
                </div>

                {/* Highest Cost Widget */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 flex items-center shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl mr-4 text-rose-600 dark:text-rose-400">
                        <Wallet size={24} />
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Highest Expense</p>
                        <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                            Rs. {(filteredCosts.length > 0 ? Math.max(...filteredCosts.map(c => c.amount)) : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h4>
                    </div>
                </div>

                {/* Grand Total Widget */}
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white flex items-center shadow-md hover:shadow-lg transition-shadow">
                    <div className="p-3 bg-white/20 rounded-xl mr-4 backdrop-blur-sm">
                        <Wallet size={24} className="text-white" />
                    </div>
                    <div>
                        <p className="text-indigo-100 text-xs font-medium uppercase tracking-wider mb-1">Total Filtered Cost</p>
                        <h4 className="text-2xl font-bold">
                            Rs. {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h4>
                    </div>
                </div>
            </div>

            {/* Filters Row */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1 flex items-center">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="text-slate-400" size={18} />
                    </div>
                    <input
                        type="text"
                        placeholder="Search by Tag or Name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200 shadow-inner"
                    />
                </div>
                <div className="relative md:w-72 flex items-center">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Filter className="text-slate-400" size={18} />
                    </div>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all appearance-none text-sm text-slate-800 dark:text-slate-200 shadow-inner"
                    >
                        <option value="ALL">All Categories</option>
                        <option value="MEDICAL">Medical</option>
                        <option value="VACCINATION">Vaccination</option>
                        <option value="LABOR">Labor</option>
                        <option value="FEED">Feed (Calculated)</option>
                        <option value="OTHER">Other</option>
                    </select>
                </div>
            </div>


            {/* Data Table */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Tag Number</th>
                                <th className="px-6 py-4">Category</th>
                                <th className="px-6 py-4">Description</th>
                                <th className="px-6 py-4 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {filteredCosts.length > 0 ? (
                                filteredCosts.map((item) => (
                                    <tr key={item.id} className="hover:bg-white dark:hover:bg-slate-700/20 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                            {new Date(item.date).toISOString().split('T')[0]}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 px-2 py-1 rounded-md">
                                                {item.tagNumber}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium 
                                                ${item.category === 'MEDICAL' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                                                    item.category === 'VACCINATION' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                                                        item.category === 'LABOR' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400' :
                                                            'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={item.notes}>
                                            {item.notes || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-slate-800 dark:text-slate-200">
                                            Rs. {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                        No cost records found matching your current filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
}
