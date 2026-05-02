'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { JoiningLeadFormWorkspace } from '@/components/joining/JoiningLeadFormWorkspace';

function PublicJoiningByQuery() {
  const searchParams = useSearchParams();
  const token = (searchParams.get('t') || searchParams.get('token') || '').trim();
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-600 dark:text-slate-400">
        <p className="font-medium text-slate-800 dark:text-slate-200">Invalid or expired link</p>
        <p className="mt-2">This page needs a token in the address, for example: …/joining/public?t=…</p>
      </div>
    );
  }
  return <JoiningLeadFormWorkspace publicToken={token} />;
}

export default function PublicJoiningQueryPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-500">Loading form…</div>
      }
    >
      <PublicJoiningByQuery />
    </Suspense>
  );
}
