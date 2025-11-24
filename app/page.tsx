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
      <div className="min-h-screen flex items-center justify-center bg-purple-50 dark:bg-slate-950">
        <p className="text-purple-900 dark:text-slate-100">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 via-blue-50/40 to-pink-50/50 dark:bg-gradient-to-br dark:from-slate-950/80 dark:via-slate-900/70 dark:to-slate-900/80"></div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-200/30 dark:bg-purple-900/30 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-200/30 dark:bg-blue-900/30 rounded-full blur-3xl animate-pulse delay-1000"></div>

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
            className="text-purple-600 dark:text-purple-300 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
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
            size="lg"
            variant="primary"
            className="px-8 py-3 text-lg"
            onClick={() => router.push('/auth/login')}
          >
            Get Started
          </Button>
          <Link href="/lead-form">
            <Button
              size="lg"
              variant="outline"
              className="px-8 py-3 text-lg"
            >
              Submit Lead Form
            </Button>
          </Link>
        </div>
        
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Already onboarded?{' '}
          <Link href="/auth/login" className="text-purple-600 dark:text-purple-300 font-semibold hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
