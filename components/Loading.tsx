import React from 'react';
import { useTheme } from '../services/ThemeContext';

export const Loading = () => {
    const { isRTL } = useTheme();

    return (
        <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
                {/* Expanding glow ring */}
                <div
                    className="absolute w-24 h-24 rounded-full bg-emerald-400/30 dark:bg-emerald-500/25 animate-ping"
                    style={{ animationDuration: '1.8s' }}
                ></div>
                {/* Soft static glow */}
                <div className="absolute w-24 h-24 rounded-full bg-emerald-400/20 dark:bg-emerald-500/20 blur-2xl"></div>

                <img
                    src="/logo-icon.png"
                    alt="FarmXpert"
                    className="relative z-10 w-20 h-20 object-contain animate-breathe drop-shadow-lg"
                />

                {/* Ground shadow */}
                <div className="absolute -bottom-1 w-16 h-3 bg-black/10 dark:bg-white/10 rounded-full blur-sm animate-pulse-slow"></div>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">FarmXpert</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm animate-pulse">Loading your farm data...</p>
            </div>
        </div>
    );
};
