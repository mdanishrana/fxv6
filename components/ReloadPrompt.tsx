import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { X, RefreshCw } from 'lucide-react';

export const ReloadPrompt = () => {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r);
        },
        onRegisterError(error) {
            console.log('SW registration error', error);
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    if (!offlineReady && !needRefresh) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-2 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <h3 className="font-semibold text-slate-800 dark:text-white text-sm mb-1">
                        {offlineReady ? 'App ready to work offline' : 'New content available'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {offlineReady
                            ? 'FarmXpert is ready to be used offline.'
                            : 'Click reload to update to the latest version.'}
                    </p>
                </div>
                <button
                    onClick={close}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
            {needRefresh && (
                <button
                    onClick={() => updateServiceWorker(true)}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                    <RefreshCw size={14} />
                    Reload
                </button>
            )}
        </div>
    );
};
