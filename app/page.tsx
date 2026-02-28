'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import Image from 'next/image';
import FloatingBubbles from '@/components/FloatingBubbles';

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const user = auth.getUser();
      if (user) {
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
    const timer = setTimeout(checkAuth, 0);
    return () => clearTimeout(timer);
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <p className="text-gray-600 text-sm font-medium">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-white">
      {/* Moving Background Elements */}
      {/* Moving Background Elements */}
      <FloatingBubbles />

      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Image
            src="/Lead Tracker.png"
            alt="Lead Tracker"
            width={36}
            height={36}
            className="h-9 w-9 rounded-xl object-contain"
          />
          <span className="text-lg font-semibold text-gray-800">Lead Tracker</span>
        </div>
        {/* <Link href="/auth/login" className="text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors">
          Sign in
        </Link> */}
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-32">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <p className="inline-flex items-center gap-1.5 rounded-full border border-[#fed7aa] bg-[#fff7ed] px-4 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#c2410c] mb-6 sm:mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f97316] animate-pulse" />
            Admissions &amp; Enquiry Management
          </p>

          {/* Headline */}
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="text-gray-900">
              Lead Management
            </span>
            <br />
            <span style={{ color: '#ea580c' }}>
              Tracker
            </span>
          </h1>
          <p className="mx-auto mt-4 sm:mt-6 max-w-2xl text-base sm:text-xl text-gray-600 leading-relaxed px-2 sm:px-0">
            Streamline enquiries, assign leads effortlessly, and gain real-time insights across your teams with a modern analytics dashboard.
          </p>

          {/* CTAs */}
          <div className="mt-8 sm:mt-10 flex flex-row gap-3 items-center justify-center px-2">
            <Button
              size="lg"
              variant="primary"
              onClick={() => router.push('/auth/login')}
              className="flex-1 sm:flex-none sm:min-w-[200px] shadow-lg shadow-[#f97316]/30 hover:shadow-[#f97316]/40 transition-shadow text-sm sm:text-base h-11 sm:h-auto"
            >
              Get Started
            </Button>
            <Link href="/lead-form" className="flex-1 sm:flex-none">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:min-w-[200px] border-2 border-gray-300 hover:border-[#fb923c] hover:bg-[#fff7ed] text-sm sm:text-base h-11 sm:h-auto"
              >
                Lead Form
              </Button>
            </Link>
          </div>

          <p className="mt-8 text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-semibold text-[#ea580c] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#f97316] opacity-60" />
    </div>
  );
}
