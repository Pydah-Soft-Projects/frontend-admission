'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellIcon } from '@/components/layout/DashboardShell';
import { notificationAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  data?: any;
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: notificationsData, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const response = await notificationAPI.getAll({ limit: 20, unreadOnly: false });
        console.log('[NotificationBell] Raw API response:', response);
        // Backend returns { success, message, data: { notifications, unreadCount } }
        // API already extracts response.data, so we get { success, message, data }
        // We need to extract the nested data
        const actualData = response?.data || response;
        console.log('[NotificationBell] Extracted data:', actualData);
        return actualData;
      } catch (err) {
        console.error('[NotificationBell] Error fetching notifications:', err);
        throw err;
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 2,
  });

  // Log errors separately
  useEffect(() => {
    if (error) {
      console.error('[NotificationBell] Query error:', error);
    }
  }, [error]);

  // Extract data - notificationsData should now be the actual data object
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const notifications = Array.isArray(notificationsData?.notifications) ? notificationsData.notifications : [];

  // Debug logging
  useEffect(() => {
    if (isOpen) {
      console.log('[NotificationBell] Dropdown opened');
      console.log('[NotificationBell] Full response:', notificationsData);
      console.log('[NotificationBell] Notifications array:', notifications);
      console.log('[NotificationBell] Unread count:', unreadCount);
      console.log('[NotificationBell] Loading:', isLoading);
      console.log('[NotificationBell] Error:', error);
    }
  }, [isOpen, notificationsData, notifications, unreadCount, isLoading, error]);

  const queryClient = useQueryClient();

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => notificationAPI.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationAPI.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Close panel with ESC key and prevent body scroll
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when panel is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification._id);
    }
    setIsOpen(false);
  };

  // Render panel using portal to ensure it's at root level
  const panelContent = isOpen && mounted ? (
    <>
      {/* Backdrop - Full screen overlay */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        style={{ zIndex: 99998 }}
        onClick={() => setIsOpen(false)}
      />

      {/* Notification Panel - Right Side, Full Screen Height, Above Everything */}
      <div
        ref={dropdownRef}
        className="fixed right-0 top-0 h-screen w-96 bg-white shadow-2xl dark:bg-slate-800 flex flex-col border-l border-slate-200 dark:border-slate-700"
        style={{ zIndex: 99999 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <BellIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
            {unreadCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ef4444] text-xs font-bold text-[#ffffff]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            aria-label="Close notifications"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Actions */}
        {unreadCount > 0 && (
          <div className="border-b border-slate-200 px-6 py-3 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button
              onClick={() => markAllAsReadMutation.mutate()}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              disabled={markAllAsReadMutation.isPending}
            >
              {markAllAsReadMutation.isPending ? 'Marking...' : 'Mark all as read'}
            </button>
          </div>
        )}

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading notifications...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center">
                <p className="text-sm text-red-500 dark:text-red-400 mb-2">
                  Failed to load notifications
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center">
                <BellIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No notifications</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  You're all caught up!
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {notifications.map((notification: Notification) => (
                <div
                  key={notification._id}
                  className={cn(
                    'px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group',
                    !notification.read && 'bg-blue-50/50 dark:bg-blue-900/10 border-l-4 border-l-blue-600'
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        {!notification.read && (
                          <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-600 flex-shrink-0"></span>
                        )}
                        <div className="flex-1">
                          <p className={cn('text-sm font-medium text-slate-900 dark:text-slate-100', !notification.read && 'font-semibold')}>
                            {notification.title}
                          </p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                            {notification.message}
                          </p>
                          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </p>
                          {notification.actionUrl && (
                            <Link
                              href={notification.actionUrl}
                              className="mt-2 inline-flex items-center text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View details
                              <svg className="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(notification._id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 transition-opacity"
                      aria-label="Delete notification"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
        aria-label="Notifications"
      >
        <BellIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-[#ef4444] text-xs font-bold text-[#ffffff]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Render panel at root level using portal */}
      {mounted && typeof window !== 'undefined' && createPortal(panelContent, document.body)}
    </>
  );
}

