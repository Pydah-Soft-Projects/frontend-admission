import { notificationAPI } from './api';

let registration: ServiceWorkerRegistration | null = null;
let vapidPublicKey: string | null = null;

/**
 * Request notification permission from user
 * Always asks for permission, even if previously denied (allows users to change their mind)
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications');
  }

  // If already granted, return immediately
  if (Notification.permission === 'granted') {
    return 'granted';
  }

  // Always request permission, even if previously denied
  // This allows users to change their mind if they denied before
  const permission = await Notification.requestPermission();
  return permission;
};

/**
 * Get VAPID public key - first tries environment variable, then falls back to API
 * This improves performance by avoiding an API call
 */
export const getVapidPublicKey = async (): Promise<string> => {
  // Return cached key if available
  if (vapidPublicKey) {
    return vapidPublicKey;
  }

  // First, try to get from environment variable (better performance)
  const envVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (envVapidKey && envVapidKey.trim()) {
    vapidPublicKey = envVapidKey.trim();
    console.log('[PushNotifications] Using VAPID key from environment variable');
    return vapidPublicKey;
  }

  // Fallback: fetch from API if not in environment
  try {
    console.log('[PushNotifications] VAPID key not in environment, fetching from API...');
    const response = await notificationAPI.getVapidKey();
    vapidPublicKey = response.data?.publicKey || response.publicKey;
    if (!vapidPublicKey) {
      throw new Error('VAPID public key not found in response');
    }
    console.log('[PushNotifications] VAPID key fetched from API');
    return vapidPublicKey;
  } catch (error: any) {
    console.error('Error getting VAPID key:', error);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to get VAPID public key';
    
    // If it's a configuration error, provide helpful message
    if (error.response?.status === 503 || errorMessage.includes('not configured')) {
      console.warn('[PushNotifications] VAPID keys are not configured on the server. Push notifications will not work until VAPID keys are set.');
      throw new Error('Push notifications are not configured. Please contact the administrator.');
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Register service worker for push notifications
 */
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser');
  }

  if (registration) {
    return registration;
  }

  try {
    // First, check if the service worker file is accessible
    try {
      const response = await fetch('/sw.js', { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`Service worker file not accessible: ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('javascript') && !contentType.includes('text')) {
        console.warn('[PushNotifications] Service worker file has unexpected content type:', contentType);
      }
    } catch (fetchError: any) {
      console.error('[PushNotifications] Cannot access service worker file:', fetchError);
      throw new Error(`Service worker file not found or not accessible: ${fetchError?.message || 'Unknown error'}`);
    }

    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[PushNotifications] Service worker registered:', registration.scope);
    
    // Wait for the service worker to be ready and check for errors
    if (registration.installing) {
      registration.installing.addEventListener('error', (event) => {
        console.error('[PushNotifications] Service worker error during installation:', event);
        const errorEvent = event as ErrorEvent;
        console.error('[PushNotifications] Error details:', {
          message: errorEvent.message,
          filename: errorEvent.filename,
          lineno: errorEvent.lineno,
          colno: errorEvent.colno,
          error: errorEvent.error,
        });
      });
    }

    registration.addEventListener('updatefound', () => {
      if (registration) {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('error', (event) => {
            console.error('[PushNotifications] Service worker error during update:', event);
            const errorEvent = event as ErrorEvent;
            console.error('[PushNotifications] Error details:', {
              message: errorEvent.message,
              filename: errorEvent.filename,
              lineno: errorEvent.lineno,
              colno: errorEvent.colno,
              error: errorEvent.error,
            });
          });
        }
      }
    });

    return registration;
  } catch (error: any) {
    console.error('[PushNotifications] Error registering service worker:', error);
    console.error('[PushNotifications] Error details:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      // Check if it's a network error
      isNetworkError: error?.message?.includes('Failed to fetch') || error?.message?.includes('network'),
      // Check if it's a syntax error
      isSyntaxError: error?.message?.includes('syntax') || error?.message?.includes('parse'),
    });
    
    // Provide more helpful error message
    if (error?.message?.includes('Failed to fetch') || error?.message?.includes('network') || error?.message?.includes('not accessible')) {
      throw new Error('Service worker file not found. Make sure sw.js exists in the public folder and is accessible.');
    } else if (error?.message?.includes('syntax') || error?.message?.includes('parse') || error?.message?.includes('evaluation failed')) {
      throw new Error('Service worker has a syntax error. Check the browser console and sw.js file for details.');
    } else {
      throw new Error(`Failed to register service worker: ${error?.message || 'Unknown error'}`);
    }
  }
};

/**
 * Subscribe to push notifications
 */
export const subscribeToPushNotifications = async (): Promise<PushSubscription | null> => {
  try {
    // Request permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.warn('[PushNotifications] Notification permission not granted');
      return null;
    }

    // Register service worker
    const swRegistration = await registerServiceWorker();

    // Get VAPID public key
    const publicKey = await getVapidPublicKey();

    // Convert VAPID key to Uint8Array
    const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    };

    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    // Subscribe to push
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    // Send subscription to server
    const subscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
        auth: arrayBufferToBase64(subscription.getKey('auth')!),
      },
    };

    console.log('[PushNotifications] Sending subscription to server...', {
      endpoint: subscription.endpoint.substring(0, 50) + '...',
      hasKeys: !!subscriptionData.keys.p256dh && !!subscriptionData.keys.auth,
    });

    const response = await notificationAPI.subscribeToPush(subscriptionData);
    console.log('[PushNotifications] Server response:', response);

    console.log('[PushNotifications] Successfully subscribed to push notifications');
    return subscription;
  } catch (error: any) {
    console.error('[PushNotifications] Error subscribing to push:', error);
    throw error;
  }
};

/**
 * Unsubscribe from push notifications
 */
export const unsubscribeFromPushNotifications = async (): Promise<void> => {
  try {
    if (!registration) {
      registration = await navigator.serviceWorker.ready;
    }

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      console.log('[PushNotifications] No active subscription found');
      return;
    }

    // Unsubscribe from push
    await subscription.unsubscribe();

    // Notify server
    await notificationAPI.unsubscribeFromPush(subscription.endpoint);

    console.log('[PushNotifications] Successfully unsubscribed from push notifications');
  } catch (error: any) {
    console.error('[PushNotifications] Error unsubscribing from push:', error);
    throw error;
  }
};

/**
 * Check if user is subscribed to push notifications
 */
export const isSubscribedToPush = async (): Promise<boolean> => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    if (!registration) {
      registration = await navigator.serviceWorker.ready;
    }

    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error('[PushNotifications] Error checking subscription:', error);
    return false;
  }
};

/**
 * Convert ArrayBuffer to base64 string
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

/**
 * Initialize push notifications (call this on app startup)
 * Automatically requests permission and subscribes when user is logged in
 * If permission was denied previously, asks again every time
 * If already subscribed, skips permission request
 */
export const initializePushNotifications = async (): Promise<void> => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[PushNotifications] Push notifications not supported');
      return;
    }

    // Register service worker
    await registerServiceWorker();

    // Check if already subscribed - if yes, no need to ask for permission again
    const isSubscribed = await isSubscribedToPush();
    if (isSubscribed) {
      console.log('[PushNotifications] Already subscribed to push notifications - skipping permission request');
      return;
    }

    // Try to get VAPID key first - if it fails, push notifications are not configured
    try {
      await getVapidPublicKey();
    } catch (error: any) {
      // If VAPID keys are not configured, don't proceed with subscription
      if (error.message?.includes('not configured') || error.message?.includes('not configured')) {
        console.warn('[PushNotifications] VAPID keys not configured on server. Push notifications disabled.');
        return;
      }
      // Re-throw other errors
      throw error;
    }

    // Auto-request permission and subscribe
    // Always ask for permission if not already granted (even if previously denied)
    // This allows users to change their mind if they denied previously
    if (Notification.permission === 'default' || Notification.permission === 'denied') {
      // Permission hasn't been requested yet OR was denied previously - request it again
      try {
        console.log('[PushNotifications] Requesting notification permission...');
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          await subscribeToPushNotifications();
          console.log('[PushNotifications] Permission granted and subscribed automatically');
        } else if (permission === 'denied') {
          console.log('[PushNotifications] Permission denied by user - will ask again next time');
        } else {
          console.log('[PushNotifications] Permission request dismissed by user');
        }
      } catch (error) {
        console.error('[PushNotifications] Error requesting permission:', error);
      }
    } else if (Notification.permission === 'granted') {
      // Permission already granted - subscribe immediately
      await subscribeToPushNotifications();
      console.log('[PushNotifications] Permission already granted, subscribed automatically');
    }
  } catch (error) {
    console.error('[PushNotifications] Error initializing push notifications:', error);
  }
};

/**
 * Diagnostic function to check notification status
 * Call this from browser console to debug notification issues
 */
export const checkNotificationStatus = async () => {
  const status = {
    browserSupport: {
      notifications: 'Notification' in window,
      serviceWorker: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in window,
    },
    permission: Notification.permission,
    subscription: null as PushSubscription | null,
    serviceWorker: null as ServiceWorkerRegistration | null,
    activeNotifications: [] as Notification[],
  };

  try {
    // Check service worker
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      status.serviceWorker = reg;
      
      // Check subscription
      if (reg.pushManager) {
        status.subscription = await reg.pushManager.getSubscription();
      }
      
      // Check active notifications (if supported)
      if (reg.getNotifications) {
        status.activeNotifications = await reg.getNotifications();
      }
    }
  } catch (error) {
    console.error('[PushNotifications] Error checking status:', error);
  }

  console.log('=== NOTIFICATION STATUS ===');
  console.log('Browser Support:', status.browserSupport);
  console.log('Permission:', status.permission);
  console.log('Subscribed:', !!status.subscription);
  if (status.subscription) {
    console.log('Subscription endpoint:', status.subscription.endpoint.substring(0, 50) + '...');
  }
  console.log('Service Worker active:', !!status.serviceWorker);
  console.log('Active notifications:', status.activeNotifications.length);
  
  // Check OS-level settings hints
  console.log('\n=== TROUBLESHOOTING ===');
  if (status.permission === 'denied') {
    console.warn('❌ Permission is DENIED - User needs to enable in browser settings');
    console.warn('   Chrome: chrome://settings/content/notifications');
    console.warn('   Edge: edge://settings/content/notifications');
  } else if (status.permission === 'default') {
    console.warn('⚠️ Permission is DEFAULT - User needs to grant permission');
  } else if (status.permission === 'granted' && !status.subscription) {
    console.warn('⚠️ Permission granted but not subscribed - subscription may have failed');
  } else if (status.permission === 'granted' && status.subscription) {
    console.log('✅ Permission granted and subscribed - notifications should work');
    console.log('   If notifications still not showing:');
    console.log('   1. Check OS notification settings (Windows Settings > System > Notifications)');
    console.log('   2. Check if Do Not Disturb is enabled');
    console.log('   3. Check browser notification settings');
    console.log('   4. Notifications may appear in notification center when tab is active');
  }

  return status;
};

// Make it available globally for easy debugging
if (typeof window !== 'undefined') {
  (window as any).checkNotificationStatus = checkNotificationStatus;
}

