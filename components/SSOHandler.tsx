'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * SSOHandler component
 * Detects 'token' parameter in URL and clears existing sessions
 * to ensure a clean slate for the new SSO login.
 */
export const SSOHandler = () => {
    const searchParams = useSearchParams();

    useEffect(() => {
        const ssoToken = searchParams.get('token');

        if (ssoToken) {
            console.log('SSO Token detected. Clearing existing local sessions to prioritize new login.');

            // Clear existing local sessions
            auth.clearAuth();

            // If not already on /auth/login, redirect to /auth/login with all query parameters
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/login')) {
                const search = searchParams.toString();
                window.location.replace(`/auth/login${search ? `?${search}` : ''}`);
            }
        }
    }, [searchParams]);

    return null;
};
