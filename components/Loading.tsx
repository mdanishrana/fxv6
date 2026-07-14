import React from 'react';
import { useTheme } from '../services/ThemeContext';

export const Loading = () => {
    const { isRTL } = useTheme();

    return (
        <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="relative w-32 h-32 mb-8">
                <svg
                    viewBox="0 0 200 200"
                    className="w-full h-full animate-bounce"
                    style={{ animationDuration: '1s' }}
                >
                    {/* Running Cow SVG - Stylized */}
                    <g transform="translate(40,40) scale(0.6)">
                        {/* Body */}
                        <path
                            d="M160,80 C160,50 140,40 120,40 L60,40 C40,40 20,60 20,90 L20,130 C20,140 30,140 30,130 L30,110 L150,110 L150,130 C150,140 160,140 160,130 L160,80 Z"
                            className="fill-emerald-600 dark:fill-emerald-500"
                        />
                        {/* Head */}
                        <circle cx="170" cy="60" r="25" className="fill-emerald-600 dark:fill-emerald-500" />
                        <path d="M160,45 L150,30 M180,45 L190,30" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-slate-800 dark:text-slate-200" />
                        {/* Spots */}
                        <path d="M60,60 C70,50 80,70 60,80" className="fill-white/20" />
                        <path d="M100,70 C110,60 120,80 100,90" className="fill-white/20" />
                        {/* Legs - Animated via CSS/Keyframes implied by bounce */}
                    </g>

                    {/* Ground Shadow */}
                    <ellipse cx="100" cy="160" rx="60" ry="10" className="fill-black/10 dark:fill-white/10 animate-pulse" />
                </svg>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">FarmXpert</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm animate-pulse">Loading your farm data...</p>
            </div>
        </div>
    );
};
