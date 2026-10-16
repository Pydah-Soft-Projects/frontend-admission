'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, ExternalLink, X } from 'lucide-react';
import { auth } from '@/lib/auth';
import { CRM_FRONTEND_URL } from '@/lib/api';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => Promise<void> | void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [mounted, setMounted] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSSO, setIsSSO] = useState(false);
  const [crmUrl, setCrmUrl] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsSSO(auth.isSSO());
      setCrmUrl(auth.getCRMUrl());
      setIsLoggingOut(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoggingOut) {
        onClose();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoggingOut, onClose]);

  if (!isOpen || !mounted || typeof document === 'undefined') {
    return null;
  }

  const handleConfirm = async () => {
    try {
      setIsLoggingOut(true);
      if (onConfirm) {
        await onConfirm();
      } else {
        await auth.logout();
      }
    } catch (err) {
      console.error('Logout error:', err);
      // Fallback in case of unexpected exception
      auth.clearAuth();
      const targetCrmUrl = (crmUrl && !crmUrl.includes('localhost') && !crmUrl.includes('127.0.0.1'))
        ? crmUrl
        : CRM_FRONTEND_URL;
      if (isSSO) {
        window.location.replace(targetCrmUrl);
      } else {
        window.location.replace('/auth/login');
      }
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity animate-in fade-in-0 duration-200"
        aria-hidden="true"
        onClick={() => {
          if (!isLoggingOut) onClose();
        }}
      />

      {/* Modal Dialog Card */}
      <div
        className="relative z-[251] mx-auto w-full max-w-[340px] sm:max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-7 shadow-2xl transition-all animate-in fade-in-0 zoom-in-95 duration-200 dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          disabled={isLoggingOut}
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Visual Icon Badge */}
          <div className="mx-auto mb-3.5 sm:mb-4 flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-rose-50 ring-8 ring-rose-50/60 dark:bg-rose-950/40 dark:ring-rose-950/30">
            <LogOut className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>

          {/* Title */}
          <h3
            id="logout-modal-title"
            className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100"
          >
            Confirm Sign Out
          </h3>

          {/* Description & SSO Context */}
          <div className="mt-2 w-full text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {isSSO ? (
              <div className="space-y-2.5 sm:space-y-3">
                <p className="leading-relaxed">
                  Are you sure you want to sign out of the Admissions Portal?
                </p>
                <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/60 p-3 sm:p-3.5 text-left dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/20 shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <ExternalLink className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        Single Sign-On (SSO) Active
                      </p>
                      <p className="text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
                        You logged in via Single Sign-On. Signing out will end your session and redirect you back to the{' '}
                        <strong className="font-semibold text-amber-900 dark:text-amber-100">CRM Portal</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="leading-relaxed max-w-sm mx-auto">
                Are you sure you want to sign out of your session? You will need to log in again to access the portal.
              </p>
            )}
          </div>

          {/* Action Buttons - Center Aligned & Mobile Responsive */}
          <div className="mt-5 sm:mt-6 grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:items-center sm:justify-center sm:gap-3">
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={onClose}
              className="h-11 w-full sm:w-auto sm:min-w-[120px] inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 sm:px-5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={handleConfirm}
              className="h-11 w-full sm:w-auto sm:min-w-[130px] inline-flex cursor-pointer items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-3 sm:px-5 text-xs sm:text-sm font-semibold text-white shadow-md shadow-red-600/20 transition hover:from-red-700 hover:to-rose-700 focus:outline-none focus:ring-2 focus:ring-red-500 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
            >
              {isLoggingOut ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin text-white flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="truncate">{isSSO ? 'Redirecting...' : 'Signing out...'}</span>
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4 flex-shrink-0" />
                  <span>Sign Out</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
