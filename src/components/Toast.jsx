import React, { useState, useCallback, useRef } from 'react';
import { ToastContext } from './ToastContext';

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((message, type = 'info', options = {}) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const duration = options.duration || (options.actionLabel ? 5000 : 3200);
    setToast({
      id: Date.now(),
      message,
      type,
      actionLabel: options.actionLabel || null,
      onAction: options.onAction || null,
    });

    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="toast-viewport fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-150"
        >
          <div
            className="flex items-center gap-3 px-4 py-2 text-[13px] font-medium shadow-none pointer-events-auto max-w-[92vw]"
            style={{
              backgroundColor: 'var(--rz)',
              color: 'var(--tx)',
              borderRadius: '6px',
              border: '1px solid var(--bd2)',
            }}
          >
            {toast.type === 'error' ? (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" aria-hidden="true" />
            ) : (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{toast.message}</span>

            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  const fn = toast.onAction;
                  dismissToast();
                  fn();
                }}
                className="ml-1 px-2 py-0.5 text-[12px] font-semibold rounded-[4px] cursor-pointer underline underline-offset-2 shrink-0"
                style={{ color: 'var(--accent-text)' }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
