
import React, { useState } from 'react';
import { Cattle, CattleStatus, QurbaniDetails, Tenant, UserRole } from '../types';
import { api } from '../services/api';
import { useTheme } from '../services/ThemeContext';
import { Search, Calendar, DollarSign, User, CheckCircle, Tag, Calculator, Filter, Printer, Truck, CreditCard } from 'lucide-react';

interface QurbaniManagerProps {
    cattle: Cattle[];
    setCattle: React.Dispatch<React.SetStateAction<Cattle[]>>;
    tenant?: Tenant;
    userRole: UserRole;
}

export const QurbaniManager: React.FC<QurbaniManagerProps> = ({ cattle, setCattle, tenant, userRole }) => {
    const { t } = useTheme();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'booked'>('all');
    const [selectedAnimal, setSelectedAnimal] = useState<Cattle | null>(null);
    const [activeTab, setActiveTab] = useState<'customer' | 'pricing' | 'delivery'>('customer');
    const [marketRate, setMarketRate] = useState<number>(1200);
    const [bookingForm, setBookingForm] = useState<QurbaniDetails>({
        isBooked: true,
        customerName: '',
        customerPhone: '',
        agreedPrice: 0,
        advancePayment: 0,
        deliveryDate: '',
        qurbaniDay: 1
    });

    const canManageFinancials = userRole === 'OWNER' || userRole === 'MANAGER';

    // Filter for animals based on search and status
    const qurbaniStock = cattle.filter(c => {
        const matchesSearch = c.tagNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.breed.toLowerCase().includes(searchTerm.toLowerCase());

        const isAvailable = c.status === CattleStatus.ACTIVE || c.status === CattleStatus.READY_FOR_SALE;
        const isBooked = c.status === CattleStatus.BOOKED_QURBANI;

        // Only include relevant statuses for Qurbani (Exclude regular SOLD, SICK, QUARANTINE unless filtered otherwise)
        const isRelevant = isAvailable || isBooked;

        if (!isRelevant) return false;
        if (!matchesSearch) return false;

        if (statusFilter === 'available') {
            return isAvailable;
        }
        if (statusFilter === 'booked') {
            return isBooked;
        }
        return true; // 'all' includes both Available and Booked
    });

    const stats = {
        sold: cattle.filter(c => c.status === CattleStatus.SOLD).length,
        reserved: cattle.filter(c => c.status === CattleStatus.BOOKED_QURBANI).length,
        revenue: cattle.reduce((acc, c) => acc + (c.qurbaniDetails?.agreedPrice || 0), 0)
    };

    const handleOpenBooking = (animal: Cattle) => {
        if (userRole === 'LABOR') {
            alert("Access Denied: Only Managers and Owners can handle bookings.");
            return;
        }

        setSelectedAnimal(animal);
        setActiveTab('customer'); // Default tab

        if (animal.qurbaniDetails?.isBooked) {
            setBookingForm(animal.qurbaniDetails);
        } else {
            setBookingForm({
                isBooked: true,
                customerName: '',
                customerPhone: '',
                agreedPrice: Math.round(animal.currentWeight * marketRate),
                advancePayment: 0,
                deliveryDate: '',
                qurbaniDay: 1
            });
        }
    };

    const handleSaveBooking = async () => {
        if (!selectedAnimal) return;

        try {
            await api.cattle.update(tenant?.id || '', selectedAnimal.id, {
                status: CattleStatus.BOOKED_QURBANI,
                qurbaniDetails: bookingForm
            });

            setCattle(prev => prev.map(c => {
                if (c.id === selectedAnimal.id) {
                    return {
                        ...c,
                        status: CattleStatus.BOOKED_QURBANI,
                        qurbaniDetails: bookingForm
                    };
                }
                return c;
            }));
            setSelectedAnimal(null);
        } catch (error) {
            console.error('Failed to save booking:', error);
            alert('Failed to save booking. Please try again.');
        }
    };

    const handleCancelBooking = async () => {
        if (!selectedAnimal) return;
        if (userRole === 'MANAGER') {
            alert("Please contact Owner to cancel a booking once confirmed.");
            return;
        }

        if (window.confirm('Are you sure you want to cancel this Qurbani booking?')) {
            try {
                // Here we actually pass qurbaniDetails: null so the backend can clear it, but typing might require undefined in frontend
                await api.cattle.update(tenant?.id || '', selectedAnimal.id, {
                    status: CattleStatus.ACTIVE,
                    qurbaniDetails: {
                        isBooked: false,
                        customerName: '',
                        customerPhone: '',
                        agreedPrice: 0,
                        advancePayment: 0,
                        deliveryDate: '',
                        qurbaniDay: 1
                    }
                });

                setCattle(prev => prev.map(c => {
                    if (c.id === selectedAnimal.id) {
                        return {
                            ...c,
                            status: CattleStatus.ACTIVE,
                            qurbaniDetails: undefined
                        };
                    }
                    return c;
                }));
                setSelectedAnimal(null);
            } catch (error) {
                console.error('Failed to cancel booking:', error);
                alert('Failed to cancel booking. Please try again.');
            }
        }
    }

    const recalculatePrice = () => {
        if (selectedAnimal) {
            setBookingForm(prev => ({
                ...prev,
                agreedPrice: Math.round(selectedAnimal.currentWeight * marketRate)
            }));
        }
    };

    const handlePrintInvoice = () => {
        if (!selectedAnimal) return;

        const balance = (bookingForm.agreedPrice || 0) - (bookingForm.advancePayment || 0);
        const farmName = tenant?.name || "FarmXpert Farms";

        const printContent = `
      <html>
        <head>
          <title>Qurbani Invoice - ${selectedAnimal.tagNumber}</title>
          <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #333; }
            .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
            .farm-info h1 { margin: 0; font-size: 28px; color: #10b981; }
            .details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .details-table th { text-align: left; padding: 10px; border-bottom: 2px solid #eee; }
            .details-table td { padding: 15px 10px; border-bottom: 1px solid #f5f5f5; }
            .totals-box { width: 300px; background: #f9fafb; border-radius: 8px; padding: 20px; float: right; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .final-row { display: flex; justify-content: space-between; margin-top: 10px; border-top: 2px solid #ddd; font-weight: bold; font-size: 18px; padding-top: 10px;}
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="farm-info"><h1>${farmName}</h1><p>Booking Invoice</p></div>
          </div>
          <p><strong>Customer:</strong> ${bookingForm.customerName} (${bookingForm.customerPhone})</p>
          <p><strong>Tag:</strong> ${selectedAnimal.tagNumber} | <strong>Weight:</strong> ${selectedAnimal.currentWeight}kg</p>
          
          <div class="totals-box">
             <div class="total-row"><span>Price</span><span>Rs. ${bookingForm.agreedPrice?.toLocaleString()}</span></div>
             <div class="total-row"><span>Advance</span><span>Rs. ${bookingForm.advancePayment?.toLocaleString()}</span></div>
             <div class="final-row"><span>Balance</span><span>Rs. ${balance.toLocaleString()}</span></div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

        const printWindow = window.open('', '', 'width=800,height=600');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
        }
    };

    // Access Guard
    if (userRole === 'LABOR') {
        return (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
                <div className="bg-red-100 p-4 rounded-full text-red-600 mb-4">
                    <Tag size={48} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Access Restricted</h2>
                <p className="text-slate-500 max-w-md">Qurbani Sales Management is restricted to Farm Owners and Managers.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                <div className="w-full lg:w-auto">
                    <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent flex items-center gap-3">
                        {t('qurbani_sales')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 text-sm">Manage Qurbani bookings, advances, and deliveries.</p>
                </div>

                {canManageFinancials && (
                    <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                        <div className="flex items-center gap-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-2 rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-sm">
                            <div className="px-3 py-1 flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap">Market Rate (Rs/kg)</span>
                                <input
                                    type="number"
                                    value={marketRate}
                                    onChange={(e) => setMarketRate(Number(e.target.value))}
                                    className="w-24 font-black text-slate-800 dark:text-emerald-400 outline-none text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-inner"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Stock */}
                <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.15)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-6 relative">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <Tag className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Stock</span>
                    </div>
                    <div className="relative">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Stock</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{qurbaniStock.length}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Animals available for Qurbani</p>
                    </div>
                </div>

                {/* Booked */}
                <div className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-6 relative">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Confirmed</span>
                    </div>
                    <div className="relative">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Booked</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{stats.reserved}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Animals with confirmed bookings</p>
                    </div>
                </div>

                {/* Available */}
                <div className="group bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(245,158,11,0.15)] hover:shadow-[0_8px_30px_rgb(245,158,11,0.3)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-6 relative">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-amber-100 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Open</span>
                    </div>
                    <div className="relative">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Available</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{qurbaniStock.length - stats.reserved}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Ready for new bookings</p>
                    </div>
                </div>

                {/* Revenue */}
                <div className="group bg-gradient-to-br from-purple-50 via-purple-50 to-purple-50 dark:from-purple-950/40 dark:to-purple-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(168,85,247,0.15)] hover:shadow-[0_8px_30px_rgb(168,85,247,0.3)] border border-purple-100 dark:border-purple-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-purple-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                    <div className="flex items-start justify-between mb-6 relative">
                        <div className="p-3 bg-white dark:bg-slate-800 border border-purple-100 dark:border-purple-900/50 text-purple-600 dark:text-purple-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                            <DollarSign className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] bg-white/60 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Earnings</span>
                    </div>
                    <div className="relative">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Revenue</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                            <span className="text-lg text-purple-600/80 dark:text-purple-400 mr-1">Rs.</span>{stats.revenue.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Total agreed booking value</p>
                    </div>
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Search Tag ID, Breed..."
                        className="w-full pl-12 pr-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto relative group">
                    <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 z-10 pointer-events-none" size={18} />
                    <select
                        className="w-full md:w-48 appearance-none pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900/50 transition-all cursor-pointer font-medium"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                        <option value="all">All Qurbani</option>
                        <option value="available">Available Only</option>
                        <option value="booked">Booked Only</option>
                    </select>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {qurbaniStock.map(animal => {
                    const isBooked = animal.status === CattleStatus.BOOKED_QURBANI;
                    const remainingBalance = (animal.qurbaniDetails?.agreedPrice || 0) - (animal.qurbaniDetails?.advancePayment || 0);
                    const estimatedPrice = Math.round(animal.currentWeight * marketRate);

                    return (
                        <div key={animal.id} className={`bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl transition-all duration-300 group hover:shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:-translate-y-1 relative overflow-hidden border
                    ${isBooked ? 'border-emerald-300 dark:border-emerald-700/60 shadow-emerald-500/10' : 'border-white/50 dark:border-slate-800/50 hover:border-emerald-200 dark:hover:border-emerald-900/50 shadow-sm'}`}>
                            
                            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${isBooked ? 'from-emerald-400/20' : 'from-slate-400/10 dark:from-slate-500/10'} to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl`}></div>

                            {isBooked && (
                                <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] uppercase font-black px-4 py-1.5 rounded-bl-2xl flex items-center gap-1 shadow-sm z-10 tracking-widest">
                                    <CheckCircle size={12} /> BOOKED
                                </div>
                            )}

                            <div className="p-6 relative z-10 flex flex-col h-full">
                                <div className="flex items-center gap-4 mb-5">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg group-hover:scale-110 transition-transform duration-300 ${isBooked ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/30' : 'bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 text-slate-700 dark:text-slate-300'}`}>
                                        <Tag size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-black tracking-tight text-xl text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{animal.tagNumber}</h3>
                                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 tracking-wide">{animal.breed} • {animal.teeth} Teeth</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm mb-6">
                                    <div className="bg-white/50 dark:bg-slate-800/50 p-3 rounded-2xl border border-white/20 dark:border-slate-700/50">
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Weight</span>
                                        <span className="font-black text-slate-700 dark:text-slate-200 text-lg">{animal.currentWeight} <span className="text-xs font-bold text-slate-500">kg</span></span>
                                    </div>
                                    {canManageFinancials && (
                                        <div className="bg-white/50 dark:bg-slate-800/50 p-3 rounded-2xl border border-white/20 dark:border-slate-700/50">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Est. Price</span>
                                            <span className="font-black text-slate-700 dark:text-slate-200 text-lg flex items-baseline">
                                                <span className="text-xs mr-1 font-bold text-slate-500">Rs.</span>
                                                {estimatedPrice.toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-auto">
                                    {isBooked && animal.qurbaniDetails ? (
                                        <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-2xl p-4 mb-6 space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-2">
                                                    <div className="bg-emerald-100 dark:bg-emerald-900/50 p-1.5 rounded-lg text-emerald-600 dark:text-emerald-300">
                                                        <User size={14} />
                                                    </div>
                                                    {animal.qurbaniDetails.customerName}
                                                </span>
                                                <span className="bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm">
                                                    Day {animal.qurbaniDetails.qurbaniDay}
                                                </span>
                                            </div>
                                            {canManageFinancials && (
                                                <>
                                                    <div className="h-px bg-emerald-200/50 dark:bg-emerald-800/30"></div>
                                                    <div className="flex justify-between items-baseline text-sm">
                                                        <span className="text-emerald-600 dark:text-emerald-500 font-bold text-xs uppercase tracking-wider">Balance</span>
                                                        <span className="font-black text-red-500 dark:text-red-400 text-lg">Rs. {remainingBalance.toLocaleString()}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="bg-white/30 dark:bg-slate-800/30 border border-dashed border-white/40 dark:border-slate-700 rounded-2xl p-4 mb-6 text-center text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">
                                            Available for Booking
                                        </div>
                                    )}

                                    {canManageFinancials && (
                                        <button
                                            onClick={() => handleOpenBooking(animal)}
                                            className={`w-full py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 tracking-wide
                                        ${isBooked
                                                    ? 'bg-white/80 dark:bg-slate-800/80 border border-white/20 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-700'
                                                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white'}`}
                                        >
                                            {isBooked ? 'Manage Booking' : 'Book Now'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {qurbaniStock.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400 bg-white/40 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-full mb-4">
                            <Tag size={40} className="opacity-50" />
                        </div>
                        <p className="text-lg font-medium">No Qurbani stock found</p>
                        <p className="text-sm mt-1">Try adjusting the search or filters.</p>
                    </div>
                )}
            </div>

            {/* Booking Modal - Render only if selectedAnimal */}
            {selectedAnimal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full border border-slate-200/60 dark:border-slate-700/60 max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-white/95 dark:bg-slate-800/95 backdrop-blur sticky top-0 z-10">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                                    <Tag size={20} />
                                </div>
                                {selectedAnimal.status === CattleStatus.BOOKED_QURBANI ? 'Edit Booking' : 'New Qurbani Booking'}
                            </h3>
                            <button onClick={() => setSelectedAnimal(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                <CheckCircle size={20} className="rotate-45" />
                            </button>
                        </div>

                        {/* Tabs Navigation */}
                        <div className="flex border-b border-slate-100 dark:border-slate-700 px-6 pt-2">
                            <button
                                onClick={() => setActiveTab('customer')}
                                className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex justify-center items-center gap-2
                        ${activeTab === 'customer' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                            >
                                <User size={16} /> Customer
                            </button>
                            <button
                                onClick={() => setActiveTab('pricing')}
                                className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex justify-center items-center gap-2
                        ${activeTab === 'pricing' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                            >
                                <CreditCard size={16} /> Pricing
                            </button>
                            <button
                                onClick={() => setActiveTab('delivery')}
                                className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex justify-center items-center gap-2
                        ${activeTab === 'delivery' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                            >
                                <Truck size={16} /> Delivery
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                            <div className="bg-emerald-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-3">
                                <Tag size={18} className="mt-0.5 flex-shrink-0 text-emerald-600 dark:text-blue-400" />
                                <div>
                                    <span className="font-bold block mb-1">Booking for #{selectedAnimal.tagNumber} ({selectedAnimal.breed})</span>
                                    Current Weight: <span className="font-mono font-bold">{selectedAnimal.currentWeight}kg</span>
                                </div>
                            </div>

                            {activeTab === 'customer' && (
                                <div className="space-y-4 animate-fade-in">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Customer Name *</label>
                                        <div className="relative">
                                            <User size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
                                            <input
                                                type="text"
                                                value={bookingForm.customerName}
                                                onChange={(e) => setBookingForm({ ...bookingForm, customerName: e.target.value })}
                                                className="w-full pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                                placeholder="Enter full name"
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Mobile Number *</label>
                                        <input
                                            type="text"
                                            value={bookingForm.customerPhone}
                                            onChange={(e) => setBookingForm({ ...bookingForm, customerPhone: e.target.value })}
                                            className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                            placeholder="0300-XXXXXXX"
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'pricing' && (
                                <div className="space-y-5 animate-fade-in">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Agreed Final Price (PKR)</label>
                                            <button
                                                onClick={recalculatePrice}
                                                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-lg transition-colors"
                                                title={`Reset to ${marketRate} x ${selectedAnimal.currentWeight}kg`}
                                            >
                                                <Calculator size={12} /> Est. @{marketRate}/kg
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rs</span>
                                            <input
                                                type="number"
                                                value={bookingForm.agreedPrice}
                                                onChange={(e) => setBookingForm({ ...bookingForm, agreedPrice: Number(e.target.value) })}
                                                className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 rounded-xl pl-10 pr-4 py-3 font-bold text-xl text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Advance (Bayana)</label>
                                            <input
                                                type="number"
                                                value={bookingForm.advancePayment}
                                                onChange={(e) => setBookingForm({ ...bookingForm, advancePayment: Number(e.target.value) })}
                                                className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 rounded-xl px-4 py-3 text-emerald-600 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Balance Amount</label>
                                            <div className="w-full bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-white/50 dark:border-slate-800/50 rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 font-bold flex items-center">
                                                Rs. {((bookingForm.agreedPrice || 0) - (bookingForm.advancePayment || 0)).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'delivery' && (
                                <div className="space-y-4 animate-fade-in">
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Delivery Date</label>
                                            <input
                                                type="date"
                                                value={bookingForm.deliveryDate}
                                                onChange={(e) => setBookingForm({ ...bookingForm, deliveryDate: e.target.value })}
                                                className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 rounded-xl px-4 py-3 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Eid Day</label>
                                            <select
                                                value={bookingForm.qurbaniDay}
                                                onChange={(e) => setBookingForm({ ...bookingForm, qurbaniDay: Number(e.target.value) as 1 | 2 | 3 })}
                                                className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 rounded-xl px-4 py-3 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                                            >
                                                <option value={1}>Day 1</option>
                                                <option value={2}>Day 2</option>
                                                <option value={3}>Day 3</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex justify-between items-center">
                            <div className="flex gap-3">
                                {selectedAnimal.status === CattleStatus.BOOKED_QURBANI && canManageFinancials && (
                                    <>
                                        <button onClick={handleCancelBooking} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2 rounded-xl text-sm font-bold transition-all">Cancel Booking</button>
                                        <button
                                            onClick={handlePrintInvoice}
                                            className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-3 py-2 rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
                                            title="Print Invoice"
                                        >
                                            <Printer size={16} /> Print
                                        </button>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedAnimal(null)} className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">Close</button>
                                <button
                                    onClick={handleSaveBooking}
                                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-500/20 font-bold active:scale-95 transition-all"
                                >
                                    Confirm Booking
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};