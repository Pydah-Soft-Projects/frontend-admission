'use client';

import { useParams } from 'next/navigation';
import { PublicJoiningGate } from '@/components/joining/PublicJoiningGate';

export default function PublicJoiningFormPage() {
  const params = useParams();
  const raw = params?.token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-600 dark:text-slate-400">
        <p className="text-base font-medium text-slate-800 dark:text-slate-200">Invalid or expired link</p>
        <p className="mt-2 leading-relaxed">No token found in the URL.</p>
      </div>
    );
  }
  return <PublicJoiningGate token={token} />;
}
