import React, { useState, useEffect } from 'react';
import { ReloadPrompt } from './components/ReloadPrompt';
import { LayoutDashboard, Beef, Wheat, MessageSquareText, Menu, Tag, LogOut, Bell, Check, X, Settings, ShieldCheck, CreditCard, Truck, Users, Moon, Sun, Globe, Lock, Sparkles, Baby, Dna, DollarSign, Layers, ChevronRight, ChevronLeft, ChevronDown, BarChart3, Package, CalendarDays } from 'lucide-react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTheme } from './services/ThemeContext';
import { Dashboard } from './components/Dashboard';
import { CattleManager } from './components/CattleManager';
import { FeedManager } from './components/FeedManager';
import { AIAdvisor } from './components/AIAdvisor';
import { LandingPage } from './components/LandingPage';
import { AuthPage } from './components/AuthPage';
import { QurbaniManager } from './components/QurbaniManager';
import { FarmSettings } from './components/FarmSettings';
import { ActivityLogs } from './components/ActivityLogs';
import { SaaSAdmin } from './components/SaaSAdmin';
import { PaymentManager } from './components/PaymentManager';
import { SupplierManager } from './components/SupplierManager';
import { LabourManager } from './components/LabourManager';
import { GeneticsManager } from './components/GeneticsManager';
import BreedingManager from './components/BreedingManager';
import { GroupsManager } from './components/GroupsManager';
import { FinanceManager } from './components/FinanceManager';
import { HealthManager } from './components/HealthManager';
import { ReportingManager } from './components/ReportingManager';
import { AnimalOwnerDashboard } from './components/AnimalOwnerDashboard';
import { SubscriptionManager } from './components/SubscriptionManager';
import { UsersManager } from './components/UsersManager';
import { Cattle, FeedItem, ViewState, Tenant, DeletionRequest, UserRole, FeedPackage } from './types';
import { api } from './services/api';
import { Loading } from './components/Loading';

type AppView = 'landing' | 'auth' | 'app';
type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export default function App() {
  const { isDarkMode, toggleDarkMode, language, setLanguage, t, isRTL } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [appView, setAppView] = useState<AppView>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  // Derived view from URL for sidebar compatibility
  const view = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1);

  const [isSidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  useEffect(() => {
    // Auto-expand sidebar group based on active route
    const path = location.pathname.substring(1);
    if (['cattle', 'breeding', 'genetics', 'groups'].includes(path)) setExpandedMenu('herd');
    if (['feed', 'packages', 'daily-feed'].includes(path)) setExpandedMenu('nutrition');
    if (['labour', 'suppliers'].includes(path)) setExpandedMenu('operations');
    if (['payments', 'finance', 'qurbani'].includes(path)) setExpandedMenu('financials');
    if (['settings', 'users', 'billing', 'logs'].includes(path)) setExpandedMenu('settings');
  }, [location.pathname]);

  const toggleMenu = (id: string) => {
    setExpandedMenu(prev => prev === id ? null : id);
  };
  const [showNotifications, setShowNotifications] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [cattle, setCattle] = useState<Cattle[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [packages, setPackages] = useState<FeedPackage[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);

  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [isSaasAdmin, setIsSaasAdmin] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('OWNER');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [upgradeModal, setUpgradeModal] = useState<{ show: boolean; moduleName: string }>({ show: false, moduleName: '' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const action = window.location.pathname;

    if ((action === '/reset-password' || action === '/setup-password') && token) {
      setResetToken(token);
      setAuthMode('reset');
      setAppView('auth');
      setIsCheckingAuth(false);
    } else if (action === '/verify-email' && token) {
      verifyEmail(token);
    } else {
      const savedToken = localStorage.getItem('farmxpert_token');
      if (savedToken) {
        checkAuth(savedToken);
      } else {
        setIsCheckingAuth(false);
      }
    }
  }, []);

  const verifyEmail = async (token: string) => {
    try {
      const res = await fetch(`/api/auth/verify-email?token=${token}`);
      const data = await res.json();
      if (res.ok) {
        alert('Email verified successfully! You can now login.');
      } else {
        alert(data.error || 'Verification failed');
      }
    } catch (err) {
      console.error('Verification error:', err);
    }
    window.history.replaceState({}, '', '/');
    setAppView('auth');
    setAuthMode('login');
    setIsCheckingAuth(false);
  };

  const checkAuth = async (token: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setAuthToken(token);
        setCurrentUser(data.user);
        setCurrentUserRole(data.user.role);

        if (data.user.role === 'SAAS_ADMIN') {
          setIsSaasAdmin(true);
          setAppView('app');
          api.tenants.list().then(setAllTenants).catch(console.error);
        } else if (data.user.role === 'ANIMAL_OWNER' && data.tenant) {
          const tenantData: Tenant = {
            id: data.tenant.id,
            name: data.tenant.name,
            ownerName: data.user.name,
            ownerEmail: data.user.email,
            tier: data.tenant.tier || 'BASIC',
            modules: [],
            locale: 'en-PK',
            currency: data.tenant.currency || 'PKR',
            weightUnit: data.tenant.weightUnit || 'kg',
            logoUrl: data.tenant.logoUrl || '',
            status: data.tenant.status || 'ACTIVE',
            users: [],
            branches: data.tenant.branches || []
          };
          setTenant(tenantData);
          setAppView('app');
        } else if (data.tenant) {
          const tenantData: Tenant = {
            id: data.tenant.id,
            name: data.tenant.name,
            ownerName: data.user.name,
            ownerEmail: data.user.email,
            tier: data.tenant.tier,
            modules: data.tenant.modules || ['CORE'],
            herdValueRate: data.tenant.herdValueRate || 1100,
            smtpSettings: data.tenant.smtpSettings,
            locale: 'en-PK',
            currency: data.tenant.currency || 'PKR',
            weightUnit: data.tenant.weightUnit || 'kg',
            logoUrl: data.tenant.logoUrl || '',
            status: data.tenant.status || 'ACTIVE',
            users: [],
            branches: data.tenant.branches || []
          };
          setTenant(tenantData);
          setAppView('app');
          await refreshData(data.tenant.id);
        }
      } else {
        localStorage.removeItem('farmxpert_token');
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      localStorage.removeItem('farmxpert_token');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const refreshData = async (tenantId: string) => {
    try {
      const [cattleData, feedData, packageData] = await Promise.all([
        api.cattle.list(tenantId),
        api.feed.listItems(tenantId),
        api.feed.listPackages(tenantId)
      ]);
      setCattle(cattleData);
      setFeed(feedData);
      setPackages(packageData);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const handleAuthLogin = (token: string, user: any, tenantData: any) => {
    localStorage.setItem('farmxpert_token', token);
    setAuthToken(token);
    setCurrentUser(user);
    setCurrentUserRole(user.role);

    if (user.role === 'SAAS_ADMIN') {
      setIsSaasAdmin(true);
      setAppView('app');
      api.tenants.list().then(setAllTenants).catch(console.error);
    } else if (user.role === 'ANIMAL_OWNER' && tenantData) {
      const tenant: Tenant = {
        id: tenantData.id,
        name: tenantData.name,
        ownerName: user.name,
        ownerEmail: user.email,
        tier: tenantData.tier || 'BASIC',
        modules: [],
        locale: 'en-PK',
        currency: tenantData.currency || 'PKR',
        weightUnit: tenantData.weightUnit || 'kg',
        logoUrl: tenantData.logoUrl || '',
        status: 'ACTIVE',
        users: [],
        branches: tenantData.branches || []
      };
      setTenant(tenant);
      setAppView('app');
    } else if (tenantData) {
      const tenant: Tenant = {
        id: tenantData.id,
        name: tenantData.name,
        ownerName: user.name,
        ownerEmail: user.email,
        tier: tenantData.tier,
        modules: tenantData.modules || ['CORE'],
        herdValueRate: tenantData.herdValueRate || 1100,
        smtpSettings: tenantData.smtpSettings,
        locale: 'en-PK',
        currency: tenantData.currency || 'PKR',
        weightUnit: tenantData.weightUnit || 'kg',
        logoUrl: tenantData.logoUrl || '',
        status: 'ACTIVE',
        users: [],
        branches: tenantData.branches || []
      };
      setTenant(tenant);
      setAppView('app');
      refreshData(tenantData.id);
    }

    window.history.replaceState({}, '', '/');
  };

  const handleLogout = async () => {
    if (authToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
    }

    localStorage.removeItem('farmxpert_token');
    setAuthToken(null);
    setTenant(null);
    setCurrentUser(null);
    setIsSaasAdmin(false);
    setCattle([]);
    setFeed([]);
    setPackages([]);
    setAppView('landing');
  };

  const handleRequestDelete = (req: DeletionRequest) => {
    setDeletionRequests(prev => [...prev, req]);
    alert("Request sent to Owner for approval.");
  };

  const handleApproveDelete = async (req: DeletionRequest) => {
    if (!tenant) return;

    try {
      if (req.type === 'CATTLE') {
        await api.cattle.delete(tenant.id, req.targetId);
      } else if (req.type === 'FEED') {
        await api.feed.deleteItem(tenant.id, req.targetId);
      }
      await refreshData(tenant.id);
      setDeletionRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete item.");
    }
  };

  const handleRejectDelete = (id: string) => {
    setDeletionRequests(prev => prev.filter(r => r.id !== id));
  };

  const onDataRefresh = () => {
    if (tenant) refreshData(tenant.id);
  };

  if (isCheckingAuth) {
    if (isCheckingAuth) {
      return <Loading />;
    }
  }

  if (appView === 'landing') {
    return (
      <LandingPage
        onGetStarted={() => { setAuthMode('register'); setAppView('auth'); }}
        onLogin={() => { setAuthMode('login'); setAppView('auth'); }}
      />
    );
  }

  if (appView === 'auth') {
    return (
      <AuthPage
        mode={authMode}
        onBack={() => setAppView('landing')}
        onLogin={handleAuthLogin}
        onSwitchMode={setAuthMode}
        resetToken={resetToken || undefined}
      />
    );
  }

  if (isSaasAdmin) {
    return (
      <div className="min-h-screen bg-slate-100">
        <ReloadPrompt />
        <header className="bg-slate-900 text-white p-4 shadow-md flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-1.5 rounded text-slate-900"><ShieldCheck size={20} /></div>
            <h1 className="font-bold text-lg tracking-wide">FarmXpert <span className="text-emerald-400 font-normal">Admin</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{currentUser?.email}</span>
            <button onClick={handleLogout} className="text-sm bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors">Sign Out</button>
          </div>
        </header>
        <div className="p-8 max-w-7xl mx-auto">
          <SaaSAdmin
            tenants={allTenants}
            setTenants={setAllTenants}
            onLoginAsTenant={(t) => {
              const tenantData: Tenant = {
                ...t,
                users: t.users || []
              };
              setTenant(tenantData);
              setCurrentUserRole('OWNER');
              setIsSaasAdmin(false);
              navigate('/');
              refreshData(t.id);
            }}
          />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <LandingPage
        onGetStarted={() => { setAuthMode('register'); setAppView('auth'); }}
        onLogin={() => { setAuthMode('login'); setAppView('auth'); }}
      />
    );
  }

  if (currentUserRole === 'ANIMAL_OWNER') {
    return (
      <div className={`min-h-screen w-full overflow-x-hidden flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <ReloadPrompt />
        <header className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} shrink-0 shadow-sm p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4`}>
          <div className="flex items-center w-full sm:w-auto gap-3 min-w-0">
            {tenant.logoUrl ? (
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white shadow-sm flex items-center justify-center p-1 shrink-0">
                <img src={tenant.logoUrl} alt="Farm Logo" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center text-white text-xl font-bold shrink-0">
                {tenant.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1 text-left">
              <h1 className={`text-lg sm:text-xl font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tenant.name}</h1>
              <span className="text-xs text-emerald-500 truncate block">{currentUser?.name || currentUser?.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-200 dark:border-gray-700">
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg shrink-0 ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <span className={`hidden md:inline text-sm truncate max-w-[150px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {currentUser?.email}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors shrink-0 flex-1 sm:flex-initial"
            >
              <LogOut size={16} />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </header>
        <AnimalOwnerDashboard
          userEmail={currentUser?.email || ''}
          userName={currentUser?.name || ''}
          tenantId={tenant.id}
          authToken={authToken || ''}
          isDarkMode={isDarkMode}
        />
      </div>
    );
  }

  const NavItem = ({ v, icon: Icon, label, requiredModule, isSubItem = false }: { v: ViewState; icon: any; label: string, requiredModule?: string, isSubItem?: boolean }) => {
    const isLocked = requiredModule && !tenant?.modules.includes(requiredModule as any);

    const moduleDisplayNames: Record<string, string> = {
      'SUPPLIER_MANAGEMENT': 'Supplier Management',
      'LABOUR_MANAGEMENT': 'Labour Management',
      'QURBANI_TRACKING': 'Qurbani Sales',
      'AI_ADVISOR': 'AI Advisor'
    };

    return (
      <button
        onClick={() => {
          if (isLocked) {
            setUpgradeModal({ show: true, moduleName: moduleDisplayNames[requiredModule!] || label });
            if (window.innerWidth < 1024) setSidebarOpen(false);
          } else {
            navigate(v === 'dashboard' ? '/' : `/${v}`);
            if (window.innerWidth < 1024) setSidebarOpen(false);
          }
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium group relative
          ${isSubItem ? 'text-sm pl-9' : 'text-[15px]'}
          ${view === v && !isLocked
            ? 'bg-emerald-500/10 text-emerald-400'
            : isLocked
              ? 'text-slate-500 hover:text-slate-400 cursor-not-allowed'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'}`}
      >
        {view === v && !isLocked && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-500 rounded-r-full"></div>
        )}
        <Icon size={isSubItem ? 18 : 20} className={view === v && !isLocked ? 'text-emerald-400' : isLocked ? 'opacity-50' : 'group-hover:text-slate-200 transition-colors'} />
        <span className={isLocked ? 'opacity-70' : ''}>{label}</span>
        {isLocked && <Lock size={14} className="ml-auto text-amber-500" />}
      </button>
    );
  };

  const CollapsibleNav = ({ id, label, icon: Icon, isOpen, onToggle, active, items }: any) => {
    return (
      <div className="space-y-1">
        <button
          onClick={onToggle}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-semibold group
                    ${active ? 'text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/30'}
                `}
        >
          <Icon size={20} className={active ? 'text-emerald-400' : 'group-hover:text-slate-200'} />
          <span className="flex-1 text-left">{label}</span>
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="space-y-1 pt-1 pb-2">
            {items.map((item: any) => (
              <NavItem key={item.v} {...item} isSubItem={true} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen bg-slate-100 dark:bg-slate-950 flex ${isRTL ? 'flex-row-reverse' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <ReloadPrompt />
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 ${isRTL ? 'right-0' : 'left-0'} z-30 w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 transform transition-transform duration-300 ease-out shadow-2xl ${isSidebarOpen ? 'translate-x-0' : (isRTL ? 'translate-x-full' : '-translate-x-full')}`}>
        <div className="h-full flex flex-col">
          <div className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {tenant.logoUrl ? (
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-white shadow-lg flex items-center justify-center p-1 ring-2 ring-emerald-400/20">
                    <img src={tenant.logoUrl} alt="Farm Logo" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-11 h-11 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-400/20">
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold text-white tracking-tight leading-tight">{tenant.name}</h1>
                  <span className="text-[10px] text-emerald-400/80 font-medium uppercase tracking-widest">Premier Farm Management</span>
                </div>
              </div>

              {/* Sidebar Collapse Toggle Button inside Sidebar */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer hover:scale-105 active:scale-95"
                title="Hide Sidebar"
              >
                {isRTL ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {/* Dashboard - Single */}
            <NavItem v="dashboard" icon={LayoutDashboard} label={t('dashboard')} />

            <CollapsibleNav
              id="herd"
              label={t('herd_management')}
              icon={Beef}
              isOpen={expandedMenu === 'herd'}
              onToggle={() => toggleMenu('herd')}
              active={['cattle', 'breeding', 'genetics', 'groups'].includes(view)}
              items={[
                { v: 'cattle', label: t('cattle_registry'), icon: Beef },
                { v: 'breeding', label: t('breeding'), icon: Baby, requiredModule: 'BREEDING_MANAGEMENT' },
                { v: 'genetics', label: t('genetics'), icon: Dna },
                { v: 'groups', label: t('groups'), icon: Users }
              ]}
            />

            <NavItem v="health" icon={ShieldCheck} label={t('medical')} />

            {/* Nutrition - Collapsible */}
            <CollapsibleNav
              id="nutrition"
              label="Feed Management"
              icon={Wheat}
              isOpen={expandedMenu === 'nutrition'}
              onToggle={() => toggleMenu('nutrition')}
              active={['feed', 'packages', 'daily-feed'].includes(view)}
              items={[
                { v: 'feed', label: 'Inventory', icon: Package },
                { v: 'packages', label: 'Packages', icon: Layers },
                { v: 'daily-feed', label: 'Daily Feed', icon: CalendarDays }
              ]}
            />

            {/* Operations - Collapsible */}
            <CollapsibleNav
              id="operations"
              label={t('operations')}
              icon={Users}
              isOpen={expandedMenu === 'operations'}
              onToggle={() => toggleMenu('operations')}
              active={['labour', 'suppliers'].includes(view)}
              items={[
                { v: 'labour', label: t('labour'), icon: Users, requiredModule: 'LABOUR_MANAGEMENT' },
                { v: 'suppliers', label: t('suppliers'), icon: Truck, requiredModule: 'SUPPLIER_MANAGEMENT' }
              ]}
            />

            {/* Financials - Collapsible */}
            <CollapsibleNav
              id="financials"
              label={t('financials')}
              icon={DollarSign}
              isOpen={expandedMenu === 'financials'}
              onToggle={() => toggleMenu('financials')}
              active={['finance', 'qurbani', 'payments'].includes(view)}
              items={[
                { v: 'finance', label: t('finance'), icon: DollarSign, requiredModule: 'FINANCE' },
                { v: 'qurbani', label: t('qurbani_sales'), icon: Tag, requiredModule: 'QURBANI_TRACKING' },
                { v: 'payments', label: t('billing_payments'), icon: CreditCard }
              ]}
            />

            {/* Intelligence - Single */}
            <p className={`text-xs font-semibold text-slate-500 uppercase tracking-wider ${isRTL ? 'px-4 text-right' : 'px-4'} mt-6 mb-2`}>{t('intelligence')}</p>
            <NavItem v="ai-advisor" icon={MessageSquareText} label={t('ai_advisor')} requiredModule="AI_ADVISOR" />
            <NavItem v="reports" icon={BarChart3} label={t('reports')} />

            {currentUserRole === 'OWNER' && (
              <>
                <p className={`text-xs font-semibold text-slate-500 uppercase tracking-wider ${isRTL ? 'px-4 text-right' : 'px-4'} mt-6 mb-2`}>{t('settings')}</p>
                <CollapsibleNav
                  id="settings"
                  label={t('manage_farm')}
                  icon={Settings}
                  isOpen={expandedMenu === 'settings'}
                  onToggle={() => toggleMenu('settings')}
                  active={['settings', 'users', 'billing', 'logs'].includes(view)}
                  items={[
                    { v: 'settings', label: t('general_profile'), icon: Settings },
                    { v: 'users', label: t('team_users'), icon: Users },
                    { v: 'billing', label: t('billing_plans'), icon: CreditCard },
                    { v: 'logs', label: t('activity_logs'), icon: ShieldCheck }
                  ]}
                />
              </>
            )}
          </nav>

          <div className="p-4 border-t border-slate-700/50">
            <div className="bg-slate-800/80 backdrop-blur p-4 rounded-xl mb-3 border border-slate-700/50">
              <div className="flex items-center gap-3 mb-2">
                {tenant.logoUrl ? (
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white shadow-sm flex items-center justify-center p-0.5">
                    <img src={tenant.logoUrl} alt="Farm Logo" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                    {tenant.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{tenant.name}</p>
                  <p className="text-xs text-slate-400">{currentUser?.name || tenant.ownerName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full
                  ${tenant.tier === 'PREMIUM' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' :
                    tenant.tier === 'STANDARD' ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white' :
                      'bg-slate-600 text-slate-200'}`}>
                  {tenant.tier}
                </span>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full
                  ${currentUserRole === 'OWNER' ? 'bg-emerald-500/20 text-emerald-400' :
                    currentUserRole === 'MANAGER' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-500/20 text-slate-400'}`}>
                  {currentUserRole}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-xl text-sm font-medium transition-all duration-200 border border-red-500/20"
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      <main className={`flex-1 flex flex-col h-screen overflow-hidden relative transition-all duration-300 ${isSidebarOpen ? (isRTL ? 'lg:pr-72' : 'lg:pl-72') : ''}`}>
        <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/50 z-40 relative shadow-sm">
          <div className="max-w-7xl mx-auto w-full px-4 lg:px-8 flex justify-between items-center py-4">
            <div className="flex items-center gap-3 lg:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Menu size={22} />
              </button>
              <div className="flex items-center gap-2">
                {tenant.logoUrl ? (
                  <div className="w-9 h-9 rounded-xl overflow-hidden bg-white shadow-md flex items-center justify-center p-1">
                    <img src={tenant.logoUrl} alt="Farm Logo" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md shadow-emerald-500/30">
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="font-bold text-slate-800 dark:text-white leading-tight">{tenant.name}</h1>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider">Premier Farm</span>
                </div>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-4">
              {!isSidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all hover:scale-105 active:scale-95 border border-slate-200/65 dark:border-slate-700/60 shadow-sm animate-pulse"
                  title="Show Sidebar"
                >
                  {isRTL ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-500 dark:text-slate-400">{t('welcome_back')},</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-white">{currentUser?.name || tenant.ownerName}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setLanguage(language === 'en' ? 'ur' : 'en')}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                title={language === 'en' ? 'اردو میں تبدیل کریں' : 'Switch to English'}
              >
                <Globe size={18} />
              </button>
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{tenant.name}</span>
              </div>
              {currentUserRole === 'OWNER' && (
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-2.5 rounded-xl hover:bg-slate-100 relative text-slate-600 transition-all duration-200 border border-transparent hover:border-slate-200"
                  >
                    <Bell size={20} />
                    {deletionRequests.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-red-500 to-rose-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-lg">
                        {deletionRequests.length}
                      </span>
                    )}
                  </button>

                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 font-bold text-sm text-slate-700 dark:text-slate-200 flex justify-between items-center">
                        <span>{t('pending_approvals')}</span>
                        <span className="bg-slate-800 dark:bg-slate-950 text-white text-xs px-2 py-0.5 rounded-full">{deletionRequests.length}</span>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {deletionRequests.length === 0 ? (
                          <div className="p-8 text-center">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
                              <Bell size={20} className="text-slate-400 dark:text-slate-500" />
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">No pending requests</p>
                          </div>
                        ) : (
                          deletionRequests.map(req => (
                            <div key={req.id} className="p-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                              <div className="flex justify-between items-start mb-2">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Delete {req.targetName}?</p>
                                <span className="text-[10px] bg-slate-800 dark:bg-slate-600 text-white px-1.5 py-0.5 rounded font-medium">{req.type}</span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Requested by <span className="font-medium text-slate-700 dark:text-slate-300">{req.requestedBy}</span>: {req.reason}</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApproveDelete(req)}
                                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs py-2 rounded-lg font-medium hover:shadow-lg hover:shadow-emerald-500/30 flex items-center justify-center gap-1 transition-all duration-200"
                                >
                                  <Check size={14} /> Approve
                                </button>
                                <button
                                  onClick={() => handleRejectDelete(req.id)}
                                  className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs py-2 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center gap-1 transition-colors"
                                >
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={
                <Dashboard
                  cattle={cattle}
                  feed={feed}
                  feedPackages={packages}
                  tenant={tenant}
                  userRole={currentUserRole}
                  deletionRequests={deletionRequests}
                  onApprove={handleApproveDelete}
                  onReject={handleRejectDelete}
                />
              } />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/cattle" element={
                <CattleManager
                  cattle={cattle}
                  setCattle={setCattle}
                  feedPackages={packages}
                  feed={feed}
                  userRole={currentUserRole}
                  onRequestDelete={handleRequestDelete}
                  tenant={tenant}
                  onRefresh={onDataRefresh}
                />
              } />
              <Route path="/breeding" element={<BreedingManager tenant={tenant} />} />
              <Route path="/genetics" element={<GeneticsManager tenant={tenant} />} />
              <Route path="/groups" element={<GroupsManager tenant={tenant} />} />
              <Route path="/feed" element={
                <FeedManager
                  feed={feed}
                  setFeed={setFeed}
                  packages={packages}
                  setPackages={setPackages}
                  userRole={currentUserRole}
                  onRequestDelete={handleRequestDelete}
                  tenant={tenant}
                  onRefresh={onDataRefresh}
                  initialTab="inventory"
                />
              } />
              <Route path="/packages" element={
                <FeedManager
                  feed={feed}
                  setFeed={setFeed}
                  packages={packages}
                  setPackages={setPackages}
                  userRole={currentUserRole}
                  onRequestDelete={handleRequestDelete}
                  tenant={tenant}
                  onRefresh={onDataRefresh}
                  initialTab="packages"
                />
              } />
              <Route path="/daily-feed" element={
                <FeedManager
                  feed={feed}
                  setFeed={setFeed}
                  packages={packages}
                  setPackages={setPackages}
                  userRole={currentUserRole}
                  onRequestDelete={handleRequestDelete}
                  tenant={tenant}
                  onRefresh={onDataRefresh}
                  initialTab="daily"
                />
              } />
              <Route path="/inventory" element={<Navigate to="/feed" replace />} />
              <Route path="/payments" element={
                <PaymentManager
                  tenant={tenant}
                  cattle={cattle}
                  userRole={currentUserRole}
                />
              } />
              <Route path="/billing" element={
                <SubscriptionManager
                  tenant={tenant}
                  setTenant={setTenant}
                />
              } />
              <Route path="/suppliers" element={
                <SupplierManager
                  tenant={tenant}
                  userRole={currentUserRole}
                />
              } />
              <Route path="/labour" element={
                <LabourManager
                  tenant={tenant}
                  userRole={currentUserRole}
                />
              } />
              <Route path="/qurbani" element={
                <QurbaniManager
                  cattle={cattle}
                  setCattle={setCattle}
                  tenant={tenant}
                  userRole={currentUserRole}
                />
              } />
              <Route path="/ai-advisor" element={
                <AIAdvisor
                  cattle={cattle}
                  feed={feed}
                  userRole={currentUserRole}
                  tenant={tenant}
                />
              } />
              <Route path="/reports" element={
                <ReportingManager
                  tenantId={tenant?.id || ''}
                  tenant={tenant}
                  cattle={cattle}
                  userRole={currentUserRole}
                />
              } />
              <Route path="/health" element={
                <HealthManager
                  tenantId={tenant.id}
                  cattle={cattle}
                />
              } />
              <Route path="/finance" element={
                <FinanceManager
                  tenant={tenant}
                  userRole={currentUserRole}
                />
              } />
              <Route path="/settings" element={
                currentUserRole === 'OWNER' ? (
                  <FarmSettings
                    tenant={tenant}
                    setTenant={setTenant}
                  />
                ) : <Navigate to="/" replace />
              } />
              <Route path="/users" element={
                currentUserRole === 'OWNER' ? (
                  <UsersManager
                    tenant={tenant}
                    currentUserRole={currentUserRole}
                    currentUserId={currentUser?.id}
                  />
                ) : <Navigate to="/" replace />
              } />
              <Route path="/logs" element={
                currentUserRole === 'OWNER' ? (
                  <ActivityLogs
                    tenant={tenant}
                  />
                ) : <Navigate to="/" replace />
              } />
              {/* Fallback route */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </main>

      {upgradeModal.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">Upgrade Your Plan</h3>
              <p className="text-white/80 text-sm mt-1">Unlock more features for your farm</p>
            </div>

            <div className="p-6">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Lock size={20} className="text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                      {upgradeModal.moduleName} is a Premium Feature
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      This module is not included in your current <span className="font-medium">{tenant?.tier}</span> plan.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Upgrade to unlock:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Check size={16} className="text-emerald-500" />
                    <span>{upgradeModal.moduleName}</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Check size={16} className="text-emerald-500" />
                    <span>Advanced analytics & reporting</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Check size={16} className="text-emerald-500" />
                    <span>Priority support</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setUpgradeModal({ show: false, moduleName: '' })}
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Maybe Later
                </button>
                <button
                  onClick={() => {
                    setUpgradeModal({ show: false, moduleName: '' });
                    if (currentUserRole === 'OWNER') {
                      navigate('/billing');
                    } else {
                      alert('Please contact the farm owner to upgrade your subscription.');
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-amber-500/30 transition-all duration-200"
                >
                  Upgrade Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
