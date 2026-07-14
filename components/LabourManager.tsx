import React, { useState, useEffect, useMemo } from 'react';
import { Worker, Attendance, WagePayment, WorkerRole, SalaryType, AttendanceStatus, UserRole, Tenant } from '../types';
import { api } from '../services/api';
import { Users, Plus, X, Edit2, Trash2, Phone, MapPin, Calendar, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Search, UserCheck, Wallet, ChevronLeft, ChevronRight, Save, Filter, RefreshCw, CreditCard, Calculator } from 'lucide-react';

interface LabourManagerProps {
  tenant: Tenant;
  userRole: UserRole;
}

const WORKER_ROLES: WorkerRole[] = ['Farm Worker', 'Supervisor', 'Driver', 'Security', 'Cleaner', 'Other'];
const SALARY_TYPES: SalaryType[] = ['MONTHLY', 'DAILY', 'HOURLY'];
const ATTENDANCE_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];

const INITIAL_WORKER: Partial<Worker> = {
  name: '',
  phone: '',
  cnic: '',
  address: '',
  role: 'Farm Worker',
  salaryType: 'MONTHLY',
  salaryAmount: 0,
  joinDate: new Date().toISOString().split('T')[0],
  status: 'ACTIVE',
  emergencyContact: '',
  emergencyPhone: '',
  notes: ''
};

export const LabourManager: React.FC<LabourManagerProps> = ({ tenant, userRole }) => {
  const [activeTab, setActiveTab] = useState<'workers' | 'attendance' | 'wages'>('workers');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [wages, setWages] = useState<WagePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [currentWorker, setCurrentWorker] = useState<Partial<Worker>>(INITIAL_WORKER);
  const [isEditingWorker, setIsEditingWorker] = useState(false);

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyAttendance, setDailyAttendance] = useState<Record<string, Partial<Attendance>>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);

  const [showWageModal, setShowWageModal] = useState(false);
  const [selectedWorkerForWage, setSelectedWorkerForWage] = useState<Worker | null>(null);
  const [wagePeriod, setWagePeriod] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [calculatedWage, setCalculatedWage] = useState<any>(null);
  const [wageExtras, setWageExtras] = useState({ deductions: 0, bonus: 0, paymentMethod: 'Cash', notes: '' });

  const canManage = userRole === 'OWNER' || userRole === 'MANAGER';

  useEffect(() => {
    loadData();
  }, [tenant.id]);

  useEffect(() => {
    if (activeTab === 'attendance') {
      loadAttendanceForDate(selectedDate);
    }
  }, [selectedDate, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [workersData, wagesData] = await Promise.all([
        api.labour.listWorkers(tenant.id),
        api.labour.listWages(tenant.id)
      ]);
      setWorkers(workersData);
      setWages(wagesData);
    } catch (err) {
      console.error('Failed to load labour data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendanceForDate = async (date: string) => {
    try {
      const attendanceData = await api.labour.getAttendance(tenant.id, { date });
      setAttendance(attendanceData);
      const attendanceMap: Record<string, Partial<Attendance>> = {};
      attendanceData.forEach(a => {
        attendanceMap[a.workerId] = a;
      });
      workers.filter(w => w.status === 'ACTIVE').forEach(w => {
        if (!attendanceMap[w.id]) {
          attendanceMap[w.id] = {
            workerId: w.id,
            date,
            status: 'PRESENT',
            checkIn: '08:00',
            checkOut: '17:00',
            overtimeHours: 0
          };
        }
      });
      setDailyAttendance(attendanceMap);
    } catch (err) {
      console.error('Failed to load attendance:', err);
    }
  };

  const filteredWorkers = useMemo(() => {
    return workers.filter(w => {
      const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.cnic && w.cnic.includes(searchTerm));
      const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [workers, searchTerm, statusFilter]);

  const handleOpenWorkerModal = (worker?: Worker) => {
    if (worker) {
      setCurrentWorker(worker);
      setIsEditingWorker(true);
    } else {
      setCurrentWorker(INITIAL_WORKER);
      setIsEditingWorker(false);
    }
    setShowWorkerModal(true);
  };

  const handleSaveWorker = async () => {
    if (!currentWorker.name) {
      alert('Worker name is required');
      return;
    }
    if (!currentWorker.salaryAmount || currentWorker.salaryAmount <= 0) {
      alert('Salary amount is required');
      return;
    }
    try {
      if (isEditingWorker && currentWorker.id) {
        await api.labour.updateWorker(tenant.id, currentWorker.id, currentWorker);
      } else {
        await api.labour.createWorker(tenant.id, currentWorker);
      }
      await loadData();
      setShowWorkerModal(false);
    } catch (err) {
      alert('Failed to save worker');
    }
  };

  const handleDeleteWorker = async (id: string) => {
    if (!confirm('Are you sure you want to delete this worker?')) return;
    try {
      await api.labour.deleteWorker(tenant.id, id);
      await loadData();
    } catch (err) {
      alert('Failed to delete worker');
    }
  };

  const handleAttendanceChange = (workerId: string, field: keyof Attendance, value: any) => {
    setDailyAttendance(prev => ({
      ...prev,
      [workerId]: {
        ...prev[workerId],
        [field]: value
      }
    }));
  };

  const handleSaveAttendance = async () => {
    setSavingAttendance(true);
    try {
      const records = Object.values(dailyAttendance).filter(a => a.workerId);
      await api.labour.bulkSaveAttendance(tenant.id, selectedDate, records);
      await loadAttendanceForDate(selectedDate);
      alert('Attendance saved successfully!');
    } catch (err) {
      alert('Failed to save attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const handleOpenWageModal = (worker: Worker) => {
    setSelectedWorkerForWage(worker);
    setCalculatedWage(null);
    setWageExtras({ deductions: 0, bonus: 0, paymentMethod: 'Cash', notes: '' });
    setShowWageModal(true);
  };

  const handleCalculateWage = async () => {
    if (!selectedWorkerForWage) return;
    try {
      const result = await api.labour.calculateWages(
        tenant.id,
        selectedWorkerForWage.id,
        wagePeriod.start,
        wagePeriod.end
      );
      setCalculatedWage(result);
    } catch (err) {
      alert('Failed to calculate wages');
    }
  };

  const handleCreateWagePayment = async () => {
    if (!selectedWorkerForWage || !calculatedWage) return;
    const totalAmount = (calculatedWage.baseAmount || 0) + (calculatedWage.overtimeAmount || 0) + wageExtras.bonus - wageExtras.deductions;
    try {
      await api.labour.createWage(tenant.id, {
        workerId: selectedWorkerForWage.id,
        periodStart: wagePeriod.start,
        periodEnd: wagePeriod.end,
        daysWorked: calculatedWage.daysWorked || 0,
        baseAmount: calculatedWage.baseAmount || 0,
        overtimeAmount: calculatedWage.overtimeAmount || 0,
        deductions: wageExtras.deductions,
        bonus: wageExtras.bonus,
        totalAmount,
        paymentStatus: 'PAID',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: wageExtras.paymentMethod,
        notes: wageExtras.notes
      });
      await loadData();
      setShowWageModal(false);
      alert('Wage payment recorded!');
    } catch (err) {
      alert('Failed to create wage payment');
    }
  };

  const getAttendanceStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'PRESENT': return 'bg-emerald-100 text-emerald-700';
      case 'ABSENT': return 'bg-red-100 text-red-700';
      case 'HALF_DAY': return 'bg-amber-100 text-amber-700';
      case 'LEAVE': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getWorkerName = (workerId: string) => {
    const worker = workers.find(w => w.id === workerId);
    return worker?.name || 'Unknown';
  };

  const totalMonthlyWages = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return wages
      .filter(w => {
        const date = new Date(w.periodEnd);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      })
      .reduce((sum, w) => sum + (w.totalAmount || 0), 0);
  }, [wages]);

  const activeWorkers = workers.filter(w => w.status === 'ACTIVE');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
        <div className="w-full lg:w-auto">
          <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent flex items-center gap-3">Labour Management</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 text-sm">Manage workforce, track attendance, and process payroll</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="flex gap-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-sm w-full sm:w-auto overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('workers')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${activeTab === 'workers' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 scale-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700/50'}`}
            >
              Workers
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${activeTab === 'attendance' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 scale-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700/50'}`}
            >
              Attendance
            </button>
            <button
              onClick={() => setActiveTab('wages')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${activeTab === 'wages' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 scale-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700/50'}`}
            >
              Wages
            </button>
          </div>

          {activeTab === 'workers' && canManage && (
            <button
              onClick={() => handleOpenWorkerModal()}
              className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-2xl flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 font-bold hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
            >
              <Plus size={18} /> Add Worker
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        {/* Active Workers */}
        <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.15)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
              <Users className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Active</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Active Workers</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{activeWorkers.length}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Currently employed</p>
          </div>
        </div>

        {/* Present Today */}
        <div className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
              <UserCheck className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Today</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Present Today</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{Object.values(dailyAttendance).filter(a => a.status === 'PRESENT').length}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Marked attendance</p>
          </div>
        </div>

        {/* Wages Card */}
        <div className="group bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(245,158,11,0.15)] hover:shadow-[0_8px_30px_rgb(245,158,11,0.3)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
          <div className="flex items-start justify-between mb-6 relative">
            <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl text-white shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
              <Wallet className="w-6 h-6" />
            </div>
            <span className="text-[10px] bg-white dark:bg-black/20 backdrop-blur-md text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-800/50 shadow-sm">Wages</span>
          </div>
          <div className="relative">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">This Month's Wages</p>
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight"><span className="text-lg text-amber-600/80 dark:text-amber-500 font-bold mr-1">Rs.</span>{totalMonthlyWages.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">Total payroll this month</p>
          </div>
        </div>
      </div>

      {activeTab === 'workers' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
            <div className="relative flex-1 group">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                placeholder="Search by name or CNIC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium"
              />
            </div>
            <div className="sm:w-48 relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full appearance-none px-4 py-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="TERMINATED">Terminated</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Filter size={18} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWorkers.map(worker => (
              <div key={worker.id} className="group bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgba(16,185,129,0.15)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.3)] border border-emerald-100 dark:border-emerald-900/50 hover:border-emerald-200 dark:hover:border-emerald-800/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden backdrop-blur-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/10 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
                      {worker.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg group-hover:text-emerald-600 dark:group-hover:text-teal-400 transition-colors tracking-tight">{worker.name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-bold tracking-wide">{worker.role}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest border ${worker.status === 'ACTIVE' ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' : worker.status === 'INACTIVE' ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' : 'bg-red-100/50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'}`}>
                    {worker.status}
                  </span>
                </div>

                <div className="space-y-3 mb-6 bg-white/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-white/20 dark:border-slate-700/50 relative z-10">
                  {worker.phone && (
                    <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-medium">
                      <div className="bg-white/60 dark:bg-slate-800/60 p-1.5 rounded-lg text-emerald-500 shadow-sm border border-white/20 dark:border-slate-700/50">
                        <Phone size={14} />
                      </div>
                      <span className="font-medium text-sm">{worker.phone}</span>
                    </div>
                  )}
                  {worker.cnic && (
                    <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-medium">
                      <div className="bg-white/60 dark:bg-slate-800/60 p-1.5 rounded-lg text-emerald-500 shadow-sm border border-white/20 dark:border-slate-700/50">
                        <MapPin size={14} />
                      </div>
                      <span className="font-medium text-sm line-clamp-1" title={worker.cnic}>CNIC: {worker.cnic}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-medium">
                    <div className="bg-white/60 dark:bg-slate-800/60 p-1.5 rounded-lg text-emerald-500 shadow-sm border border-white/20 dark:border-slate-700/50">
                      <DollarSign size={14} />
                    </div>
                    <span className="font-black text-slate-800 dark:text-white">Rs. {worker.salaryAmount.toLocaleString()}</span>
                    <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">/ {worker.salaryType.toLowerCase().replace('ly', '')}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/20 dark:border-slate-700/50 relative z-10">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Joined</span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{worker.joinDate ? new Date(worker.joinDate).toLocaleDateString() : 'N/A'}</span>
                  </div>

                  {canManage && (
                    <div className="flex gap-2">
                      <button onClick={() => handleOpenWageModal(worker)} className="p-2.5 bg-white/60 dark:bg-slate-800/60 text-amber-500 hover:text-amber-600 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all shadow-sm border border-white/20 dark:border-slate-700/50" title="Process Wage">
                        <Wallet size={18} />
                      </button>
                      <button onClick={() => handleOpenWorkerModal(worker)} className="p-2.5 bg-white/60 dark:bg-slate-800/60 text-emerald-500 hover:text-emerald-600 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all shadow-sm border border-white/20 dark:border-slate-700/50" title="Edit Worker">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => handleDeleteWorker(worker.id)} className="p-2.5 bg-white/60 dark:bg-slate-800/60 text-red-500 hover:text-red-600 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all shadow-sm border border-white/20 dark:border-slate-700/50" title="Delete Worker">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filteredWorkers.length === 0 && (
              <div className="col-span-full py-16 text-center">
                <div className="bg-white dark:bg-slate-800/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users size={32} className="text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No workers found</h3>
                <p className="text-slate-500 dark:text-slate-400">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
            <div className="flex items-center gap-4 bg-white dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2.5 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-lg text-slate-500 transition-all shadow-sm hover:shadow"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-3 px-2">
                <Calendar size={20} className="text-emerald-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent border-none text-lg font-bold text-slate-700 dark:text-white focus:ring-0 cursor-pointer"
                />
              </div>
              <button
                onClick={() => navigateDate('next')}
                className="p-2.5 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-lg text-slate-500 transition-all shadow-sm hover:shadow"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {canManage && activeWorkers.length > 0 && (
              <button
                onClick={handleSaveAttendance}
                disabled={savingAttendance}
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-8 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all font-bold transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAttendance ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <Save size={20} />
                )}
                Save Attendance
              </button>
            )}
          </div>

          <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/20 dark:bg-slate-900/30 border-b border-white/20 dark:border-slate-700/50">
                  <tr>
                    <th className="text-left px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Worker</th>
                    <th className="text-center px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-center px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Check In</th>
                    <th className="text-center px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Check Out</th>
                    <th className="text-center px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overtime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20 dark:divide-slate-700/50">
                  {activeWorkers.map(worker => {
                    const att = dailyAttendance[worker.id] || {};
                    return (
                      <tr key={worker.id} className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-md">
                              {worker.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{worker.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{worker.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="relative inline-block w-40">
                            <select
                              value={att.status || 'PRESENT'}
                              onChange={(e) => handleAttendanceChange(worker.id, 'status', e.target.value)}
                              className={`w-full appearance-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer transition-all border-2 ${att.status === 'PRESENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/50 hover:border-emerald-300' :
                                att.status === 'ABSENT' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/50 hover:border-red-300' :
                                  att.status === 'HALF_DAY' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50 hover:border-amber-300' :
                                    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50 hover:border-blue-300'
                                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 dark:focus:ring-offset-slate-900 shadow-sm`}
                            >
                              {ATTENDANCE_STATUSES.map(status => (
                                <option key={status} value={status}>{status.replace('_', ' ')}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input
                            type="time"
                            value={att.checkIn || '08:00'}
                            onChange={(e) => handleAttendanceChange(worker.id, 'checkIn', e.target.value)}
                            disabled={att.status === 'ABSENT' || att.status === 'LEAVE'}
                            className="bg-white/60 dark:bg-slate-900/60 border border-white/20 dark:border-slate-700/50 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:text-white shadow-sm"
                          />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input
                            type="time"
                            value={att.checkOut || '17:00'}
                            onChange={(e) => handleAttendanceChange(worker.id, 'checkOut', e.target.value)}
                            disabled={att.status === 'ABSENT' || att.status === 'LEAVE'}
                            className="bg-white/60 dark:bg-slate-900/60 border border-white/20 dark:border-slate-700/50 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:text-white shadow-sm"
                          />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="relative inline-block w-24">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={att.overtimeHours || 0}
                              onChange={(e) => handleAttendanceChange(worker.id, 'overtimeHours', parseFloat(e.target.value) || 0)}
                              disabled={att.status === 'ABSENT' || att.status === 'LEAVE'}
                              className="w-full bg-white/60 dark:bg-slate-900/60 border border-white/20 dark:border-slate-700/50 rounded-lg px-3 py-2 text-sm font-bold text-center focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:text-white shadow-sm"
                            />
                            <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">hrs</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'wages' && (
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/20 dark:bg-slate-900/30 border-b border-white/20 dark:border-slate-700/50">
                <tr>
                  <th className="text-left px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Worker</th>
                  <th className="text-left px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Period</th>
                  <th className="text-center px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Days</th>
                  <th className="text-right px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Base</th>
                  <th className="text-right px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">OT</th>
                  <th className="text-right px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deductions</th>
                  <th className="text-right px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bonus</th>
                  <th className="text-right px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="text-center px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20 dark:divide-slate-700/50">
                {wages.map(wage => (
                  <tr key={wage.id} className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">{wage.workerName || getWorkerName(wage.workerId)}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 font-medium">
                      {new Date(wage.periodStart).toLocaleDateString()} <span className="text-slate-400 dark:text-slate-500 mx-1">→</span> {new Date(wage.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-center font-bold text-slate-700 dark:text-slate-300">
                      <span className="bg-white/60 dark:bg-slate-700/60 px-3 py-1 rounded-lg text-xs font-bold shadow-sm border border-white/20 dark:border-slate-600/50">
                        {wage.daysWorked}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-slate-600 dark:text-slate-400">Rs. {(wage.baseAmount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-emerald-600 dark:text-emerald-400">+{(wage.overtimeAmount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-red-600 dark:text-red-400">-{(wage.deductions || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-blue-600 dark:text-blue-400">+{(wage.bonus || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-right font-black text-slate-900 dark:text-white">Rs. {(wage.totalAmount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest border ${wage.paymentStatus === 'PAID' ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' : 'bg-amber-100/50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'}`}>
                        {wage.paymentStatus === 'PAID' ? <CheckCircle size={12} /> : <Clock size={12} />}
                        {wage.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {wages.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <div className="bg-white/60 dark:bg-slate-800/60 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20 dark:border-slate-700/50">
                        <Wallet size={32} className="text-slate-400" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No wage payments recorded</h3>
                      <p className="text-slate-500 dark:text-slate-400 mt-1">Process wages from the Workers tab to see history here</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showWorkerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <div className="bg-blue-100 dark:bg-emerald-500/20 p-2.5 rounded-xl text-emerald-600 dark:text-blue-400">
                  {isEditingWorker ? <Edit2 size={22} /> : <Plus size={22} />}
                </div>
                {isEditingWorker ? 'Edit Worker Profile' : 'Add New Worker'}
              </h3>
              <button
                onClick={() => setShowWorkerModal(false)}
                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Full Name *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={currentWorker.name || ''}
                      onChange={(e) => setCurrentWorker({ ...currentWorker, name: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium"
                      placeholder="e.g. Muhammad Ali"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Users size={18} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Phone Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={currentWorker.phone || ''}
                      onChange={(e) => setCurrentWorker({ ...currentWorker, phone: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium"
                      placeholder="0300-1234567"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Phone size={18} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">CNIC Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={currentWorker.cnic || ''}
                      onChange={(e) => setCurrentWorker({ ...currentWorker, cnic: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium"
                      placeholder="35202-1234567-1"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <CreditCard size={18} />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Residential Address</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={currentWorker.address || ''}
                      onChange={(e) => setCurrentWorker({ ...currentWorker, address: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium"
                      placeholder="Village, Tehsil, District..."
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <MapPin size={18} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Job Role</label>
                  <div className="relative">
                    <select
                      value={currentWorker.role || 'Farm Worker'}
                      onChange={(e) => setCurrentWorker({ ...currentWorker, role: e.target.value as WorkerRole })}
                      className="w-full pl-11 pr-10 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium appearance-none cursor-pointer"
                    >
                      {WORKER_ROLES.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <UserCheck size={18} />
                    </div>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <ChevronRight size={16} className="rotate-90" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Employment Status</label>
                  <div className="relative">
                    <select
                      value={currentWorker.status || 'ACTIVE'}
                      onChange={(e) => setCurrentWorker({ ...currentWorker, status: e.target.value as any })}
                      className="w-full pl-11 pr-10 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium appearance-none cursor-pointer"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="TERMINATED">Terminated</option>
                    </select>
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <CheckCircle size={18} />
                    </div>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <ChevronRight size={16} className="rotate-90" />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Wallet size={18} className="text-emerald-500" />
                    Salary Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Salary Structure *</label>
                      <div className="relative">
                        <select
                          value={currentWorker.salaryType || 'MONTHLY'}
                          onChange={(e) => setCurrentWorker({ ...currentWorker, salaryType: e.target.value as SalaryType })}
                          className="w-full pl-11 pr-10 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium appearance-none cursor-pointer"
                        >
                          {SALARY_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <Clock size={18} />
                        </div>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <ChevronRight size={16} className="rotate-90" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Base Salary (Rs) *</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={currentWorker.salaryAmount || ''}
                          onChange={(e) => setCurrentWorker({ ...currentWorker, salaryAmount: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-bold text-lg"
                          placeholder="0"
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-serif font-bold">Rs.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Date of Joining</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={currentWorker.joinDate || ''}
                      onChange={(e) => setCurrentWorker({ ...currentWorker, joinDate: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Calendar size={18} />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <AlertCircle size={18} className="text-amber-500" />
                    Emergency Contact
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Contact Name</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={currentWorker.emergencyContact || ''}
                          onChange={(e) => setCurrentWorker({ ...currentWorker, emergencyContact: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none font-medium"
                          placeholder="Relative Name"
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                          <Users size={18} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Emergency Phone</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={currentWorker.emergencyPhone || ''}
                          onChange={(e) => setCurrentWorker({ ...currentWorker, emergencyPhone: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none font-medium"
                          placeholder="03XX-XXXXXXX"
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                          <Phone size={18} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Additional Notes</label>
                  <textarea
                    value={currentWorker.notes || ''}
                    onChange={(e) => setCurrentWorker({ ...currentWorker, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-medium resize-none"
                    placeholder="Any other important details..."
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-b-3xl flex justify-end gap-3 z-10">
              <button
                onClick={() => setShowWorkerModal(false)}
                className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWorker}
                className="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all font-bold transform hover:-translate-y-0.5"
              >
                <Save size={20} /> {isEditingWorker ? 'Update Details' : 'Save Worker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWageModal && selectedWorkerForWage && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-100 dark:bg-emerald-500/20 p-3 rounded-xl text-emerald-600 dark:text-emerald-400">
                  <Wallet size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Process Wage</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{selectedWorkerForWage.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowWageModal(false)}
                className="bg-white dark:bg-slate-800 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900/50 space-y-6">
              <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Calendar size={16} className="text-emerald-500" />
                  Payment Period
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Start Date</label>
                    <input
                      type="date"
                      value={wagePeriod.start}
                      onChange={(e) => setWagePeriod({ ...wagePeriod, start: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-bold text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">End Date</label>
                    <input
                      type="date"
                      value={wagePeriod.end}
                      onChange={(e) => setWagePeriod({ ...wagePeriod, end: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-bold text-sm"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleCalculateWage}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Calculator size={20} />
                Calculate from Attendance
              </button>

              {calculatedWage && (
                <div className="space-y-6 animate-fade-in-up">
                  <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-white/50 dark:border-slate-800/50 shadow-sm space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Days Worked</span>
                      <span className="font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-700 px-2 py-1 rounded-lg">{calculatedWage.daysWorked}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Base Amount</span>
                      <span className="font-bold text-slate-900 dark:text-white">Rs. {(calculatedWage.baseAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
                        Overtime <span className="text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded ml-1 font-bold">{calculatedWage.overtimeHours || 0} hrs</span>
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">+Rs. {(calculatedWage.overtimeAmount || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Deductions</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={wageExtras.deductions || ''}
                          onChange={(e) => setWageExtras({ ...wageExtras, deductions: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-3 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all outline-none font-bold"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Bonus</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={wageExtras.bonus || ''}
                          onChange={(e) => setWageExtras({ ...wageExtras, bonus: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-3 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none font-bold"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Payment Method</label>
                    <div className="relative">
                      <select
                        value={wageExtras.paymentMethod}
                        onChange={(e) => setWageExtras({ ...wageExtras, paymentMethod: e.target.value })}
                        className="w-full pl-10 pr-10 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all outline-none font-medium appearance-none cursor-pointer"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="JazzCash">JazzCash</option>
                        <option value="Easypaisa">Easypaisa</option>
                      </select>
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <CreditCard size={18} />
                      </div>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <ChevronRight size={16} className="rotate-90" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-5 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wider text-sm">Net Payable</span>
                      <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                        Rs. {((calculatedWage.baseAmount || 0) + (calculatedWage.overtimeAmount || 0) + wageExtras.bonus - wageExtras.deductions).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">Payment Notes</label>
                    <textarea
                      value={wageExtras.notes}
                      onChange={(e) => setWageExtras({ ...wageExtras, notes: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all outline-none font-medium resize-none"
                      placeholder="Optional notes..."
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-b-3xl flex justify-end gap-3 z-10">
              <button
                onClick={() => setShowWageModal(false)}
                className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWagePayment}
                disabled={!calculatedWage}
                className="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all font-bold transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                <CheckCircle size={20} />
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
