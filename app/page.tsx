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
          <p className="text-gray-600 text-sm font-medium">..Redirecting..</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-slate-950">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/Admission-cell-background.jpg"
          alt="Admission Cell Background"
          fill
          priority
          className="object-cover"
          style={{ filter: 'brightness(0.9)' }}
        />
        {/* Cinematic Gradient Overlay - Darker in the middle for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-50/10 via-white/10 to-amber-100/10" />
        <div className="absolute inset-0 bg-black/20" /> {/* Extra layer for overall depth */}
      </div>

      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Image
            src="/Lead Tracker.png"
            alt="Lead Tracker"
            width={36}
            height={36}
            className="h-9 w-9 rounded-xl object-contain bg-white/10 backdrop-blur-sm p-1"
          />
          <span className="text-lg font-semibold text-white/90">Lead Tracker</span>
        </div>
        {/* <Link href="/auth/login" className="text-sm font-medium text-gray-300 hover:text-orange-400 transition-colors">
          Sign in
        </Link> */}
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-32">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-md px-4 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white mb-6 sm:mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
            Admissions &amp; Enquiry Managementttttt
          </p>

          {/* Headline */}
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            <span className=" block sm:inline">
              Admissions &amp; Enquiry Portal
            </span>
          </h1>
          {/* <p className="mx-auto mt-4 sm:mt-6 max-w-2xl text-base sm:text-xl text-slate-200 leading-relaxed px-2 sm:px-0 drop-shadow-sm">
            Streamline admissions, assign leads effortlessly, and gain real-time insights across your teams with a modern analytics dashboard.
          </p> */}

          {/* CTAs */}
          <div className="mt-8 sm:mt-10 flex flex-row gap-3 items-center justify-center px-2">
            <Button
              size="lg"
              variant="primary"
              onClick={() => router.push('/auth/login')}
              className="flex-1 sm:flex-none sm:min-w-[200px] bg-orange-600 hover:bg-orange-500 shadow-lg shadow-orange-950/50 transition-all text-sm sm:text-base h-11 sm:h-auto border-none"
            >
              Get Started
            </Button>
            <Link href="/lead-form" className="flex-1 sm:flex-none">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:min-w-[200px] border-2 border-slate-700 bg-slate-900/50 backdrop-blur-sm hover:border-orange-500/50 hover:bg-slate-800 text-white text-sm sm:text-base h-11 sm:h-auto"
              >
                Lead Form
              </Button>
            </Link>
          </div>

          <p className="mt-8 text-sm text-slate-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-semibold text-orange-400 hover:text-orange-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </main>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-80" />
    </div>
  );
}
