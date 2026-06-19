import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

let toastListeners: ((toasts: ToastMessage[]) => void)[] = [];
let toasts: ToastMessage[] = [];

export const showToast = (message: string, type: ToastType = 'success') => {
  const id = Math.random().toString(36).substr(2, 9);
  toasts = [...toasts, { id, message, type }];
  toastListeners.forEach(listener => listener(toasts));
  
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    toastListeners.forEach(listener => listener(toasts));
  }, 3500);
};

export default function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (newToasts: ToastMessage[]) => {
      setCurrentToasts(newToasts);
    };
    toastListeners.push(listener);
    
    // Initial sync just in case
    listener(toasts);

    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {currentToasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9, filter: 'blur(4px)' }}
            layout
            className={`
              pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl min-w-[320px] max-w-md
              ${toast.type === 'success' ? 'bg-emerald-950/95 border-emerald-800/50' : ''}
              ${toast.type === 'error' ? 'bg-rose-950/95 border-rose-800/50' : ''}
              ${toast.type === 'info' ? 'bg-indigo-950/95 border-indigo-800/50' : ''}
              ${toast.type === 'warning' ? 'bg-amber-950/95 border-amber-800/50' : ''}
            `}
          >
            <div className={`p-1.5 rounded-full ${toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : toast.type === 'error' ? 'bg-rose-500/20 text-rose-400' : toast.type === 'warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {toast.type === 'warning' && <AlertCircle className="w-5 h-5" />}
              {toast.type === 'info' && <Info className="w-5 h-5" />}
            </div>
            
            <div className="flex-1">
              <span className="font-semibold text-[15px] text-slate-100 block mb-0.5">
                {toast.type === 'success' && 'Successfully Saved!'}
                {toast.type === 'error' && 'Error'}
                {toast.type === 'warning' && 'Warning'}
                {toast.type === 'info' && 'Information'}
              </span>
              <span className="font-medium text-[13px] text-slate-300 leading-snug">{toast.message}</span>
            </div>
            
            <button 
              onClick={() => {
                toasts = toasts.filter(t => t.id !== toast.id);
                toastListeners.forEach(l => l(toasts));
              }}
              className="ml-2 p-1.5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
