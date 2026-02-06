'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Use a small delay to avoid synchronous setState
    const checkAuth = () => {
      const user = auth.getUser();
      if (user) {
        // Prevent logged-in users from accessing home - redirect to dashboard
        if (user.roleName === 'Super Admin' || user.roleName === 'Sub Super Admin') {
          router.replace('/superadmin/dashboard');
        } else if (user.roleName === 'Data Entry User') {
          router.replace('/superadmin/leads/individual');
        } else if (user.isManager) {
          router.replace('/manager/dashboard');
        } else {
          router.replace('/user/dashboard');
        }
      } else {
        setIsChecking(false);
      }
    };

    // Use setTimeout to avoid synchronous setState in effect
    const timer = setTimeout(checkAuth, 0);
    return () => clearTimeout(timer);
  }, [router]);

  // Show loading state while checking auth
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <p className="text-slate-700 dark:text-slate-100">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gray-50 dark:bg-slate-950" />

      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-6 text-center relative z-10">
        {/* Icon and Title */}
        <div className="flex items-center gap-4 group">
          {/* Lead Tracker Icon - Chart/Graph Icon */}
          <svg
            width="72"
            height="72"
            viewBox="0 0 72 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-orange-600 dark:text-orange-300 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
          >
            {/* Chart bars */}
            <rect x="12" y="40" width="8" height="20" rx="2" fill="currentColor" opacity="0.8" />
            <rect x="24" y="32" width="8" height="28" rx="2" fill="currentColor" opacity="0.9" />
            <rect x="36" y="24" width="8" height="36" rx="2" fill="currentColor" />
            <rect x="48" y="28" width="8" height="32" rx="2" fill="currentColor" opacity="0.85" />

            {/* Target/Arrow pointing up */}
            <path
              d="M36 12L40 18H32L36 12Z"
              fill="currentColor"
            />
            <circle cx="36" cy="20" r="3" fill="currentColor" />

            {/* Connection lines */}
            <path
              d="M16 40L20 32L28 24L36 20L44 28L52 28"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity="0.6"
            />
          </svg>

          <div className="text-left">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-slate-100">
              Lead Management Tracker
            </h1>
            <p className="text-base sm:text-lg text-gray-600 dark:text-slate-300 max-w-2xl mt-3">
              Streamline enquiries, assign leads effortlessly, and gain real-time insights across your teams with our modern analytics dashboard.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <Button
            size="xl"
            variant="primary"
            onClick={() => router.push('/auth/login')}
          >
            Get Started
          </Button>
          <Link href="/lead-form">
            <Button
              size="xl"
              variant="outline"
            >
              Submit Lead Form
            </Button>
          </Link>
        </div>

        <p className="text-sm text-gray-500 dark:text-slate-400">
          Already onboarded?{' '}
          <Link href="/auth/login" className="text-orange-600 dark:text-orange-300 font-semibold hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
