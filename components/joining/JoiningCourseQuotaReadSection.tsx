'use client';

import type { ReactNode } from 'react';
import { formatRegistrationFieldLabel } from '@/lib/registrationFieldsDisplay';
import type { CleanRegistrationFieldEntry } from '@/lib/registrationFieldsDisplay';
import {
  formatJoiningQualificationMediums,
  formatJoiningQualifiedExams,
  formatJoiningReservationGeneral,
} from '@/lib/joiningApplicationViewDisplay';
import type { Joining } from '@/types';

function ReadCell({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{value ?? '—'}</p>
    </div>
  );
}

type Props = {
  joining: Joining;
  collegeName?: string;
  courseName?: string;
  branchName?: string;
  intakeRegistrationEntries: CleanRegistrationFieldEntry[];
  reference1?: string;
  /** When set, replaces the read-only Reference cell (e.g. editable reference on admission detail). */
  referenceSlot?: ReactNode;
};

/** Read-only Course &amp; quota — mirrors Step 1 on the joining edit form. */
export function JoiningCourseQuotaReadSection({
  joining,
  collegeName,
  courseName,
  branchName,
  intakeRegistrationEntries,
  reference1,
  referenceSlot,
}: Props) {
  const reservation = joining.reservation;
  const qualifications = joining.qualifications;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-6 md:gap-y-5">
      <ReadCell label="Program level" value={joining.courseInfo?.programLevel || '—'} />
      <ReadCell label="Quota" value={joining.courseInfo?.quota || '—'} />
      <ReadCell label="College" value={collegeName || '—'} />
      <ReadCell label="Course" value={courseName || joining.courseInfo?.course || '—'} />
      <ReadCell label="Branch" value={branchName || joining.courseInfo?.branch || '—'} />
      <ReadCell
        label="General reservation category"
        value={formatJoiningReservationGeneral(reservation?.general)}
      />
      {intakeRegistrationEntries.map(([key, raw]) => (
        <ReadCell
          key={key}
          label={formatRegistrationFieldLabel(key)}
          value={typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}
        />
      ))}
      <ReadCell label="EWS (Economically Weaker Section)" value={reservation?.isEws ? 'Yes' : 'No'} />
      <div className="min-w-0 md:col-span-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Other reservations
        </p>
        {reservation?.other?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {reservation.other.map((cat) => (
              <span
                key={cat}
                className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
              >
                {cat}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">—</p>
        )}
      </div>
      <ReadCell label="Qualified examinations" value={formatJoiningQualifiedExams(qualifications)} />
      <ReadCell
        label="Medium of instruction"
        value={formatJoiningQualificationMediums(
          qualifications?.mediums,
          qualifications?.otherMediumLabel
        )}
      />
      <ReadCell
        label="Merit"
        value={
          qualifications?.merit === true ? 'Yes' : qualifications?.merit === false ? 'No' : '—'
        }
      />
      {referenceSlot != null ? (
        <div className="min-w-0">{referenceSlot}</div>
      ) : (
        <ReadCell label="Reference" value={reference1?.trim() || '—'} />
      )}
    </div>
  );
}
