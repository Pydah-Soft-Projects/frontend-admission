'use client';

import { useParams } from 'next/navigation';
import { JoiningLeadFormWorkspace } from '@/components/joining/JoiningLeadFormWorkspace';

export default function PublicJoiningFormPage() {
  const params = useParams();
  const raw = params?.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  return <JoiningLeadFormWorkspace publicToken={token ?? null} />;
}
