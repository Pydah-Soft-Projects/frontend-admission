'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { JoiningLeadFormWorkspace } from '@/components/joining/JoiningLeadFormWorkspace';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function JoiningLeadWorkspacePage() {
  const params = useParams();
  const raw = params?.leadId;
  const leadId = Array.isArray(raw) ? raw[0] : raw;

  if (leadId === 'new' || !leadId) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 p-8">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Standalone joining form disabled
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          New joinings must be created with a CRM enquiry. Use <strong>Add Joining Form</strong> from the Joining
          Pipeline so the lead gets an enquiry number and a linked draft.
        </p>
        <Link href="/superadmin/joining">
          <Button variant="primary">Go to Joining Pipeline</Button>
        </Link>
      </Card>
    );
  }

  return <JoiningLeadFormWorkspace adminLeadId={leadId} />;
}
