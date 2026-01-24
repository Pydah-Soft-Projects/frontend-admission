'use client';

import { useEffect, useState } from 'react';
import { initializePushNotifications } from '@/lib/pushNotifications';
import { auth } from '@/lib/auth';

export function PushNotificationProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // Check if user is authenticated
        const user = auth.getUser();
        if (!user) {
          return;
        }

        // Check if browser supports push notifications
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          console.log('[PushNotifications] Browser does not support push notifications');
          return;
        }

        // Initialize push notifications (automatically requests permission and subscribes)
        await initializePushNotifications();
        setIsInitialized(true);
      } catch (error: any) {
        console.error('[PushNotifications] Error initializing:', error);
        // Don't break the app if push notifications fail - just log the error
        // This is expected in some environments (e.g., localhost without HTTPS, unsupported browsers)
        if (error?.message?.includes('Service worker')) {
          console.warn('[PushNotifications] Service worker registration failed. Push notifications will not work, but the app will continue to function.');
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      init();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return <>{children}</>;
}

