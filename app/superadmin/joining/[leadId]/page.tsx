'use client';

import { useParams } from 'next/navigation';
import { JoiningLeadFormWorkspace } from '@/components/joining/JoiningLeadFormWorkspace';

export default function JoiningLeadWorkspacePage() {
  const params = useParams();
  const raw = params?.leadId;
  const leadId = Array.isArray(raw) ? raw[0] : raw;
  return <JoiningLeadFormWorkspace adminLeadId={leadId ?? null} />;
}
