
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Tractor, LayoutGrid, ArrowRight, UserCog, Users, Briefcase, Lock, AlertTriangle } from 'lucide-react';
import { Tenant, UserRole } from '../types';
import { api } from '../services/api';

interface LoginScreenProps {
  onLogin: (tenant: Tenant | 'ADMIN', role: UserRole) => void;
  tenants?: Tenant[]; 
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  
  const [displayTenants, setDisplayTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
      const fetchTenants = async () => {
          try {
              setError(null);
              const data = await api.tenants.list();
              setDisplayTenants(data);
          } catch (err: any) {
              console.error("Failed to load tenants", err);
              setError(err.message || "Failed to load farm list. Please check connection.");
          }
      };
      fetchTenants();
  }, []);

  return (
    <div className="min-h-screen bg-theme-navy flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Side: Branding */}
        <div className="md:w-5/12 bg-theme-blue p-8 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://images.unsplash.com/photo-1545464333-9cbd1f668d51?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center"></div>
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-theme-navy font-bold text-xl">F</div>
                    <h1 className="text-2xl font-bold tracking-tight">FarmXpert</h1>
                </div>
                <h2 className="text-3xl font-bold mb-4">Complete Farm Management Solution for Pakistan</h2>
                <p className="text-slate-200 leading-relaxed">
                    From Mandi purchase to Qurbani sale. Manage weight gain, track vaccinations (FMD/LSD), and optimize feed costs (Wanda/Silage).
                </p>
            </div>
            <div className="relative z-10 mt-8 space-y-4">
                <p className="text-sm text-slate-300">Trusted by 500+ Farms across Punjab & Sindh</p>
                
                {/* Admin Login Button */}
                <button 
                    onClick={() => onLogin('ADMIN', 'SAAS_ADMIN')}
                    className="w-full py-2 bg-white/10 hover:bg-white/20 border border-white/30 rounded-lg text-xs text-slate-300 flex items-center justify-center gap-2 transition-colors"
                >
                    <Lock size={12}/> SaaS Admin Access
                </button>
            </div>
        </div>

        {/* Right Side: Login Options */}
        <div className="md:w-7/12 p-8 bg-theme-gray overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold text-theme-navy mb-6">Select Your Farm</h3>
            
            {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
                    <div className="text-sm text-red-700">
                        <p className="font-bold">Connection Error</p>
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {!error && displayTenants.length === 0 ? (
                <p className="text-slate-500 italic">Loading farms...</p>
            ) : (
                <div className="space-y-6">
                    {displayTenants.filter(t => t.status !== 'SUSPENDED').map((tenant) => (
                        <div 
                            key={tenant.id}
                            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-lg text-theme-navy">{tenant.name}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase
                                            ${tenant.tier === 'BASIC' ? 'bg-slate-100 text-slate-600' : 
                                            tenant.tier === 'STANDARD' ? 'bg-blue-100 text-emerald-600' : 
                                            'bg-purple-100 text-purple-600'}`}>
                                            {tenant.tier}
                                        </span>
                                    </div>
                                    <div className="text-sm text-slate-500">
                                        Owner: {tenant.ownerName}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-4">
                                <button 
                                    onClick={() => onLogin(tenant, 'OWNER')}
                                    className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-theme-teal/30 bg-theme-gray hover:bg-theme-teal/10 hover:border-theme-teal transition-colors group"
                                >
                                    <Briefcase size={18} className="text-theme-teal"/>
                                    <span className="text-xs font-bold text-theme-navy">Owner</span>
                                </button>

                                <button 
                                    onClick={() => onLogin(tenant, 'MANAGER')}
                                    className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-theme-blue/30 bg-theme-gray hover:bg-theme-blue/10 hover:border-theme-blue transition-colors"
                                >
                                    <UserCog size={18} className="text-theme-blue"/>
                                    <span className="text-xs font-bold text-theme-navy">Manager</span>
                                </button>

                                <button 
                                    onClick={() => onLogin(tenant, 'LABOR')}
                                    className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-slate-200 bg-theme-gray hover:bg-slate-100 hover:border-slate-300 transition-colors"
                                >
                                    <Users size={18} className="text-slate-600"/>
                                    <span className="text-xs font-bold text-slate-800">Labor</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            <div className="mt-8 pt-6 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400">
                    SaaS Platform • Module Based Licensing • Multi-Tenant Architecture
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
