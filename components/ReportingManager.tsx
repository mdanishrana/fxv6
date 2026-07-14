import React, { useState } from 'react';
import { useTheme } from '../services/ThemeContext';
import { BarChart3, TrendingUp, PieChart, Download, Calendar, Filter } from 'lucide-react';
import { ExpenseReport } from './reports/ExpenseReport';
import { HerdGrowthReport } from './reports/HerdGrowthReport';
import { AnimalCostReport } from './reports/AnimalCostReport';
import { ReportsHub } from './ReportsHub';
import { Cattle, Tenant, UserRole } from '../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type ReportType = 'EXPENSES' | 'GROWTH' | 'ANIMAL_COSTS' | 'EXPORTS';

interface ReportingManagerProps {
    tenantId: string;
    tenant: Tenant;
    cattle: Cattle[];
    userRole: UserRole;
}

export const ReportingManager: React.FC<ReportingManagerProps> = ({ tenantId, tenant, cattle, userRole }) => {
    const { isDarkMode } = useTheme();
    const [activeReport, setActiveReport] = useState<ReportType>('EXPENSES');
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [isExporting, setIsExporting] = useState(false);

    const handleExportPDF = async () => {
        if (activeReport === 'EXPORTS') {
            alert('Please use the specific export buttons inside the Data Exports tab.');
            return;
        }

        const input = document.getElementById('report-content');
        if (!input) return;

        try {
            setIsExporting(true);
            const canvas = await html2canvas(input, {
                scale: 2,
                backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                logging: false,
                useCORS: true
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
            pdf.save(`Farm_Report_${activeReport}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <BarChart3 className="text-violet-600 dark:text-violet-400" />
                        Reports & Analytics
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Deep dive into your farm's financial and operational performance.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={18} />
                        {isExporting ? 'Exporting...' : 'Export PDF'}
                    </button>
                    <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 shadow-sm">
                        <Calendar size={18} className="text-slate-400" />
                        <span className="text-sm font-medium">{dateRange.start} - {dateRange.end}</span>
                    </div>
                </div>
            </div>

            {/* Report Navigation */}
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveReport('EXPENSES')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${activeReport === 'EXPENSES'
                        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                >
                    <PieChart size={18} />
                    Expense Breakdown
                </button>
                <button
                    onClick={() => setActiveReport('GROWTH')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${activeReport === 'GROWTH'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                >
                    <TrendingUp size={18} />
                    Herd Growth
                </button>
                <button
                    onClick={() => setActiveReport('ANIMAL_COSTS')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeReport === 'ANIMAL_COSTS'
                        ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                >
                    <PieChart size={18} />
                    Animal Cost Breakdown
                </button>
                <button
                    onClick={() => setActiveReport('EXPORTS')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeReport === 'EXPORTS'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                >
                    <Download size={18} />
                    Data Exports
                </button>
            </div>

            {/* Content Area */}
            <div id="report-content" className="min-h-[500px] p-2 rounded-xl bg-white dark:bg-slate-900">
                {activeReport === 'EXPENSES' && (
                    <ExpenseReport tenantId={tenantId} startDate={dateRange.start} endDate={dateRange.end} />
                )}
                {activeReport === 'GROWTH' && (
                    <HerdGrowthReport tenantId={tenantId} startDate={dateRange.start} endDate={dateRange.end} />
                )}
                {activeReport === 'ANIMAL_COSTS' && (
                    <AnimalCostReport tenant={{ id: tenantId }} />
                )}
                {activeReport === 'EXPORTS' && (
                    <ReportsHub tenant={tenant} cattle={cattle} userRole={userRole} />
                )}
            </div>
        </div>
    );
};
