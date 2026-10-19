'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { auth } from '@/lib/auth';
import { CRM_BACKEND_URL, CRM_FRONTEND_URL } from '@/lib/api';

declare global {
  interface Window {
    PydahSwitcher?: {
      init: (config: {
        currentPortal: string;
        apiBaseUrl?: string;
        landingUrl?: string;
        token?: string;
        user?: any;
        position?: string;
      }) => void;
      destroy?: () => void;
      hide?: () => void;
      show?: () => void;
    };
  }
}

const SCRIPT_ID = 'pydah-portal-switcher-cdn-script';
const PORTAL_ID = 'admissions-crm';

/**
 * Pydah Universal Portal Switcher Widget
 *
 * Requirements:
 * 1. Embeds https://crm.pydah.edu.in/portal-switcher.js with data-current-portal="admissions-crm"
 * 2. Only renders for SSO logged-in users (auth.isAuthenticated() && auth.isSSO())
 * 3. Hides/removes widget for non-SSO users and logged-out states
 */
export const PortalSwitcher = () => {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    // Check if user is authenticated via SSO and not on an auth route
    const isAuth = auth.isAuthenticated();
    const isSSO = auth.isSSO();
    const isAuthRoute = pathname ? pathname.startsWith('/auth') : false;

    const shouldRender = isAuth && isSSO && !isAuthRoute;

    const findSwitcherElements = () =>
      document.querySelectorAll(
        'portal-switcher, pydah-portal-switcher, #pydah-portal-switcher, .pydah-portal-switcher, [id*="portal-switcher"], [class*="portal-switcher"]'
      );

    if (!shouldRender) {
      // Hide any existing switcher elements
      findSwitcherElements().forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      if (window.PydahSwitcher?.hide) {
        window.PydahSwitcher.hide();
      }
      return;
    }

    // Ensure switcher elements are visible
    findSwitcherElements().forEach((el) => {
      (el as HTMLElement).style.display = '';
    });
    if (window.PydahSwitcher?.show) {
      window.PydahSwitcher.show();
    }

    const initSwitcher = () => {
      if (window.PydahSwitcher && typeof window.PydahSwitcher.init === 'function') {
        const token = auth.getToken();
        const user = auth.getUser();
        window.PydahSwitcher.init({
          currentPortal: PORTAL_ID,
          apiBaseUrl: CRM_BACKEND_URL || 'https://crm.pydah.edu.in',
          landingUrl: CRM_FRONTEND_URL || 'https://crm.pydah.edu.in',
          token: token,
          user: user || undefined,
          position: 'bottom-right',
        });
      }
    };

    // Check if script tag already exists
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://crm.pydah.edu.in/portal-switcher.js';
      script.async = true;
      script.setAttribute('data-current-portal', PORTAL_ID);
      script.setAttribute('data-api-base-url', CRM_BACKEND_URL || 'https://crm.pydah.edu.in');
      script.setAttribute('data-landing-url', CRM_FRONTEND_URL || 'https://crm.pydah.edu.in');
      script.setAttribute('data-position', 'bottom-right');

      script.onload = () => {
        initSwitcher();
      };

      document.body.appendChild(script);
    } else {
      initSwitcher();
    }
  }, [pathname, isClient]);

  return null;
};
