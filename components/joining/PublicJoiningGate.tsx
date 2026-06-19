'use client';

import { useQuery } from '@tanstack/react-query';
import { joiningPublicApi, type JoiningPublicBootstrapData } from '@/lib/joiningPublicApi';
import { JoiningLeadFormWorkspace } from '@/components/joining/JoiningLeadFormWorkspace';

// ─── Error / loading screens ────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
      Loading form…
    </div>
  );
}

function ExpiredScreen() {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <div className="mb-4 flex justify-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <svg
            className="h-7 w-7 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
          </svg>
        </span>
      </div>
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">This link has expired</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        The 5-minute joining form link is no longer valid. Please contact the admissions desk
        and ask them to send you a new link.
      </p>
    </div>
  );
}

function InvalidScreen() {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Link invalid or expired</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Ask your admissions desk for a new joining form link.
      </p>
    </div>
  );
}

// ─── Gate ───────────────────────────────────────────────────────────────────

type Props = { token: string };

export function PublicJoiningGate({ token }: Props) {
  const bootstrapQuery = useQuery({
    queryKey: ['joining-public-bootstrap', token],
    queryFn: () => joiningPublicApi.getBootstrap(token),
    retry: false,
    staleTime: 30_000,
  });

  if (bootstrapQuery.isLoading) {
    return <LoadingScreen />;
  }

  if (bootstrapQuery.isError) {
    const err = bootstrapQuery.error as (Error & { statusCode?: number }) | null;
    const isExpired =
      err?.statusCode === 410 ||
      (err?.message ?? '').includes('LINK_EXPIRED') ||
      (err?.message ?? '').toLowerCase().includes('expired');
    return isExpired ? <ExpiredScreen /> : <InvalidScreen />;
  }

  const bootstrapData = bootstrapQuery.data?.data as JoiningPublicBootstrapData | undefined;

  if (!bootstrapData) {
    return <InvalidScreen />;
  }

  // Token is valid — mount the workspace with pre-fetched bootstrap data.
  return (
    <JoiningLeadFormWorkspace
      publicToken={token}
      publicBootstrapData={bootstrapData}
    />
  );
}
