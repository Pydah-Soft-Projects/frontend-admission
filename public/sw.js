// Service Worker for Push Notifications
// Enhanced for robust background notifications (like YouTube/Instagram)

'use strict';

// Wrap in try-catch to catch any immediate errors
try {
  console.log('[ServiceWorker] Service worker script loaded');
} catch (e) {
  console.error('[ServiceWorker] Error in service worker initialization:', e);
}

// Install event - ensure service worker is activated immediately
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] ===== INSTALL EVENT =====');
  console.log('[ServiceWorker] Installing service worker...');
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  console.log('[ServiceWorker] skipWaiting() called');
});

// Activate event - take control of all pages immediately
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] ===== ACTIVATE EVENT =====');
  console.log('[ServiceWorker] Activating service worker...');
  // Take control of all pages immediately
  event.waitUntil(
    clients.claim().then(() => {
      console.log('[ServiceWorker] ✅ Service worker activated and controlling all pages');
      console.log('[ServiceWorker] Registration:', self.registration);
    }).catch((error) => {
      console.error('[ServiceWorker] ❌ Error during activation:', error);
    })
  );
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] ===== PUSH NOTIFICATION RECEIVED =====');
  console.log('[ServiceWorker] Event:', event);
  console.log('[ServiceWorker] Has data:', !!event.data);
  console.log('[ServiceWorker] Registration:', self.registration);

  let notificationData = {
    title: 'CRM Admissions',
    body: 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    url: '/',
    data: {},
    timestamp: Date.now(),
  };

  if (event.data) {
    try {
      // Try to parse as JSON first
      const jsonData = event.data.json();
      console.log('[ServiceWorker] Parsed JSON data:', jsonData);
      notificationData = {
        title: jsonData.title || notificationData.title,
        body: jsonData.body || notificationData.body,
        icon: jsonData.icon || notificationData.icon,
        badge: jsonData.badge || notificationData.badge,
        url: jsonData.url || notificationData.url,
        data: jsonData.data || notificationData.data,
        timestamp: jsonData.timestamp || Date.now(),
      };
    } catch (jsonError) {
      console.log('[ServiceWorker] JSON parse failed, trying text:', jsonError);
      // If JSON parsing fails, try text
      try {
        const text = event.data.text();
        console.log('[ServiceWorker] Text data:', text);
        if (text) {
          // Try to parse text as JSON string
          try {
            const parsed = JSON.parse(text);
            console.log('[ServiceWorker] Parsed text as JSON:', parsed);
            notificationData = {
              title: parsed.title || notificationData.title,
              body: parsed.body || notificationData.body,
              icon: parsed.icon || notificationData.icon,
              badge: parsed.badge || notificationData.badge,
              url: parsed.url || notificationData.url,
              data: parsed.data || notificationData.data,
              timestamp: parsed.timestamp || Date.now(),
            };
          } catch (parseError) {
            console.log('[ServiceWorker] Text is not JSON, using as body');
            // If text is not JSON, use it as body
            notificationData.body = text;
          }
        }
      } catch (textError) {
        console.error('[ServiceWorker] Error parsing push data as text:', textError);
        // Use default notification data
      }
    }
  }

  console.log('[ServiceWorker] Final notification data:', notificationData);

  // Show notification - browser will handle permission check
  const showNotification = () => {
    return new Promise((resolve, reject) => {
      try {
        console.log('[ServiceWorker] ===== ATTEMPTING TO SHOW NOTIFICATION =====');
        console.log('[ServiceWorker] Registration available:', !!self.registration);
        console.log('[ServiceWorker] showNotification function:', typeof self.registration.showNotification);
        console.log('[ServiceWorker] Notification data:', {
          title: notificationData.title,
          body: notificationData.body,
          icon: notificationData.icon,
          url: notificationData.url,
        });
        
        // Check if we can show notifications (basic check)
        if (!self.registration || typeof self.registration.showNotification !== 'function') {
          throw new Error('showNotification is not available on registration');
        }
        
        // Create unique tag to prevent notification replacement
        // Use timestamp + type to ensure each notification is unique
        const notificationType = (notificationData.data && notificationData.data.type) ? notificationData.data.type : 'default';
        const uniqueTag = notificationType + '-' + Date.now();
        console.log('[ServiceWorker] Using unique tag:', uniqueTag);
        
        // Notification options - optimized for visibility
        const notificationActions = notificationData.actions || (notificationData.data && notificationData.data.actions) || [];
        const notificationOptions = {
          body: notificationData.body,
          icon: notificationData.icon || '/icon-192x192.png',
          badge: notificationData.badge || '/icon-192x192.png',
          image: notificationData.image, // Large image for rich notifications
          data: Object.assign({}, notificationData.data || {}, {
            url: notificationData.url,
            timestamp: notificationData.timestamp,
          }),
          tag: uniqueTag, // Unique tag to prevent replacement
          requireInteraction: true, // FORCE notification to stay visible until user interacts
          silent: false, // Play sound
          vibrate: [200, 100, 200], // Vibration pattern
          timestamp: notificationData.timestamp,
          // Actions for notification buttons (from notification data)
          actions: notificationActions,
          // Persistent notification options
          renotify: false, // Don't re-notify, show as new notification
          dir: 'ltr', // Text direction
          lang: 'en', // Language
        };
        
        console.log('[ServiceWorker] Notification options:', notificationOptions);
        
        // Show notification with enhanced options for background delivery
        const notificationPromise = self.registration.showNotification(
          notificationData.title,
          notificationOptions
        );
        
        notificationPromise.then(() => {
          // Verify notification was actually created
          // Note: We can't directly check if it's visible, but we can log success
          console.log('[ServiceWorker] ✅ Notification API call completed successfully!');
          console.log('[ServiceWorker] ⚠️ If notification is not visible, check:');
          console.log('[ServiceWorker]   1. Browser notification settings (chrome://settings/content/notifications)');
          console.log('[ServiceWorker]   2. OS notification settings (Windows Settings > System > Notifications)');
          console.log('[ServiceWorker]   3. Do Not Disturb mode');
          console.log('[ServiceWorker]   4. Browser focus state (notifications may go to notification center when tab is active)');
          console.log('[ServiceWorker] ===== NOTIFICATION DISPLAYED =====');
          
          // Try to get active notifications (if supported)
          if (self.registration.getNotifications) {
            self.registration.getNotifications().then(function(notifications) {
              console.log('[ServiceWorker] Active notifications count:', notifications.length);
              for (var i = 0; i < notifications.length; i++) {
                var notif = notifications[i];
                console.log('[ServiceWorker] Notification ' + (i + 1) + ':', {
                  tag: notif.tag,
                  title: notif.title,
                  body: notif.body,
                });
              }
            }).catch(function(err) {
              console.log('[ServiceWorker] Could not get active notifications:', err);
            });
          }
          resolve();
        }).catch(function(error) {
          console.error('[ServiceWorker] ❌ ===== ERROR SHOWING NOTIFICATION =====');
          console.error('[ServiceWorker] Error name:', error.name);
          console.error('[ServiceWorker] Error message:', error.message);
          console.error('[ServiceWorker] Error stack:', error.stack);
          console.error('[ServiceWorker] Full error object:', error);
          
          // Try to get more info about the error
          if (error.message && error.message.indexOf('permission') !== -1) {
            console.error('[ServiceWorker] ⚠️ Permission issue - user may need to grant notification permission');
            console.error('[ServiceWorker] ⚠️ Check browser notification settings');
          }
          
          // If permission is not granted, we can't show notification
          // This is expected if user hasn't granted permission yet
          reject(error);
        });
      } catch (error) {
        console.error('[ServiceWorker] ❌ ===== ERROR SHOWING NOTIFICATION =====');
        console.error('[ServiceWorker] Error name:', error.name);
        console.error('[ServiceWorker] Error message:', error.message);
        console.error('[ServiceWorker] Error stack:', error.stack);
        console.error('[ServiceWorker] Full error object:', error);
        reject(error);
      }
    });
  };

  event.waitUntil(showNotification());
  console.log('[ServiceWorker] ===== PUSH EVENT HANDLED =====');
});

// Handle notification click - enhanced for better UX with action buttons
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification clicked:', event);
  console.log('[ServiceWorker] Action clicked:', event.action);

  event.notification.close();

  // Handle action button clicks
  const notificationData = event.notification.data || {};
  let urlToOpen = notificationData.url || '/';
  
  if (event.action) {
    // Handle specific action buttons
    switch (event.action) {
      case 'view-dashboard':
        urlToOpen = '/superadmin/dashboard';
        break;
      case 'view-leads':
        urlToOpen = '/superadmin/leads';
        break;
      case 'view-notifications':
        urlToOpen = '/superadmin/notifications';
        break;
      default:
        // Use default URL or action-specific URL
        urlToOpen = notificationData.url || '/';
    }
    console.log('[ServiceWorker] Action button clicked:', event.action, '-> Opening:', urlToOpen);
  } else {
    // Main notification body clicked
    urlToOpen = notificationData.url || '/';
    console.log('[ServiceWorker] Notification body clicked -> Opening:', urlToOpen);
  }

  const notificationType = notificationData.type || 'default';

  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // Get origin from registration scope (safer than self.location)
        let origin = '';
        try {
          if (self.registration && self.registration.scope) {
            origin = new URL(self.registration.scope).origin;
          } else if (typeof self.location !== 'undefined' && self.location.origin) {
            origin = self.location.origin;
          } else if (clientList.length > 0 && clientList[0].url) {
            // Fallback: get origin from first client URL
            origin = new URL(clientList[0].url).origin;
          }
        } catch (e) {
          console.warn('[ServiceWorker] Could not determine origin:', e);
        }
        
        // Check if there's already a window/tab open
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          // Focus existing window if it matches our origin (or if origin couldn't be determined, just focus any)
          if ((!origin || client.url.startsWith(origin)) && 'focus' in client) {
            // Navigate to the target URL if different
            if (client.url !== urlToOpen && 'navigate' in client) {
              return client.navigate(urlToOpen).then(() => client.focus());
            }
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
      .catch((error) => {
        console.error('[ServiceWorker] Error handling notification click:', error);
        // Fallback: try to open window anyway
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[ServiceWorker] Notification closed:', event);
  // Can be used for analytics or cleanup if needed
});

// Background sync for offline support (optional enhancement)
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync triggered:', event.tag);
  // Can be used to sync data when connection is restored
});

// Message event - for communication from main thread
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Respond to message
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({ success: true });
  }
});

