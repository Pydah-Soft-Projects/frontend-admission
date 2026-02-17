"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export default function PwaInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleBeforeInstallPrompt = (e: any) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            // Update UI notify the user they can install the PWA
            setIsVisible(true);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        // We've used the prompt, and can't use it again, discard it
        if (outcome === 'accepted') {
            setIsVisible(false);
        }
        setDeferredPrompt(null);
    };

    const handleClose = () => {
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shadow-lg flex items-center justify-between gap-4 animate-in slide-in-from-bottom-full duration-300">
            <div className="flex items-center gap-3">
                <div className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg">
                    <img src="/Lead Tracker.png" alt="App Icon" className="w-8 h-8 object-contain" />
                </div>
                <div>
                    <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">Install App</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Add to your home screen for quick access</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleClose}
                    className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    aria-label="Close"
                >
                    <X className="w-5 h-5" />
                </button>
                <button
                    onClick={handleInstallClick}
                    className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-md text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                    Install
                </button>
            </div>
        </div>
    );
}
