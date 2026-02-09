'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ActivityLogsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/superadmin/reports?tab=activityLogs');
  }, [router]);
  return (
    <div className="flex min-h-[200px] items-center justify-center text-slate-500 dark:text-slate-400">
      Redirecting to Activity Logs…
    </div>
  );
}
