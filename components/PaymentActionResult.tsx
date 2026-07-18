import React from 'react';
import { CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';

export interface PaymentActionState {
    ok: boolean;
    action?: 'received' | 'pending';
    animalTag?: string;
    reason?: string;
}

interface Props {
    state: PaymentActionState;
}

const REASON_MESSAGES: Record<string, string> = {
    NOT_FOUND: "This link isn't recognized. It may have been copied incorrectly.",
    EXPIRED: 'This link has expired. Monthly billing links stay valid for 45 days.',
    ALREADY_USED: 'This link has already been used - the status was already updated.',
    INVALID_REQUEST: 'This link is missing required information.',
    CATTLE_NOT_FOUND: 'The animal linked to this action could not be found.',
    SERVER_ERROR: 'Something went wrong on our end. Please try again from the app.'
};

export const PaymentActionResult: React.FC<Props> = ({ state }) => {
    const isReceived = state.ok && state.action === 'received';
    const isPending = state.ok && state.action === 'pending';

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
                {state.ok ? (
                    <>
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${isReceived ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-500'}`}>
                            {isReceived ? <CheckCircle2 size={40} /> : <Clock size={40} />}
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">
                            {isReceived ? 'Marked as Received' : 'Marked as Pending'}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                            {isReceived
                                ? <>Payment for animal <strong>{state.animalTag}</strong> has been recorded as paid.</>
                                : <>Animal <strong>{state.animalTag}</strong> is still marked as payment pending.</>}
                            {' '}A notification has been sent to the animal owner.
                        </p>
                    </>
                ) : (
                    <>
                        <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-6">
                            {state.reason === 'ALREADY_USED' ? <AlertTriangle size={40} /> : <XCircle size={40} />}
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">Link Not Valid</h1>
                        <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                            {REASON_MESSAGES[state.reason || ''] || 'This link could not be processed.'}
                        </p>
                    </>
                )}
                <a href="/" className="inline-block mt-8 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5 transition-transform">
                    Go to FarmXpert
                </a>
            </div>
        </div>
    );
};
