'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy Joining Desk root — pipeline now lives at `/joining/pipeline`. */
export default function JoiningDeskIndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/superadmin/joining/pipeline');
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Opening Joining Pipeline…
    </div>
  );
}
