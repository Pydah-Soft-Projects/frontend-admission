'use client';

import type { CertificateGuidance, JoiningDocumentStatus } from '@/types';
import { listCertificateItemOptions } from '@/lib/certificateChecklistEntry';

const documentStatusOptions: JoiningDocumentStatus[] = ['pending', 'received'];

export type CertificateChecklistParsedEntry = {
  status: JoiningDocumentStatus;
  option?: string;
};

export function CertificateInformationChecklistBlock({
  variant,
  radioNameSuffix = '',
  derivedCertificationStatus,
  programLevelTrimmed,
  isLoadingCertificateGuidance,
  certificateGuidance,
  certificateChecklistParsed,
  onChecklistOptionChange,
  onChecklistStatusChange,
  readOnly = false,
  title = 'Certificate information checklist',
}: {
  variant: 'below-documents' | 'post-admission-step' | 'admission-step-two';
  radioNameSuffix?: string;
  derivedCertificationStatus: string | null;
  programLevelTrimmed: string;
  isLoadingCertificateGuidance: boolean;
  certificateGuidance: CertificateGuidance | null;
  certificateChecklistParsed: Record<string, CertificateChecklistParsedEntry>;
  onChecklistOptionChange: (itemId: string, encoded: string) => void;
  onChecklistStatusChange: (
    itemId: string,
    status: JoiningDocumentStatus,
    hasCertOptions: boolean
  ) => void;
  readOnly?: boolean;
  title?: string;
}) {
  const wrapClass =
    variant === 'below-documents'
      ? 'mt-10 border-t border-slate-200 pt-8 dark:border-slate-700'
      : 'mt-8 border-t border-slate-200 pt-8 dark:border-slate-700';
  return (
    <div className={wrapClass}>
      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
        {title}
      </h3>
      {derivedCertificationStatus !== null && (
        <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
          <span className="font-medium text-gray-900 dark:text-slate-100">Certification status</span>
          {': '}
          <span
            className={
              derivedCertificationStatus === 'Verified'
                ? 'ml-1 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                : 'ml-1 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
            }
          >
            {derivedCertificationStatus}
          </span>
        </p>
      )}
      {!programLevelTrimmed ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
          Select a program level in Course &amp; Quota on the joining workspace to load this checklist.
        </p>
      ) : isLoadingCertificateGuidance ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Loading certificate rules…</p>
      ) : certificateGuidance?.format === 'certificate_config' &&
        certificateGuidance.items &&
        certificateGuidance.items.length > 0 ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {certificateGuidance.items
            .filter((item) => String(item.id || item.name || '').trim())
            .map((item) => {
              const itemId = String(item.id || item.name || '').trim();
              const certOpts = listCertificateItemOptions(item);
              const hasCertOptions = certOpts.length > 0;
              const parsed = certificateChecklistParsed[itemId] ?? {
                status: 'pending' as JoiningDocumentStatus,
              };
              const status = parsed.status === 'received' ? 'received' : 'pending';
              const selectedEncoded =
                hasCertOptions &&
                parsed.option &&
                certOpts.some((o) => o.encoded === parsed.option)
                  ? parsed.option!
                  : hasCertOptions
                    ? certOpts[0]!.encoded
                    : undefined;
              return (
                <div
                  key={itemId}
                  className="flex flex-col gap-2 rounded-xl border border-indigo-200/80 bg-indigo-50/40 px-4 py-3 shadow-sm dark:border-indigo-900/50 dark:bg-indigo-950/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{item.name}</p>
                    <span
                      className={
                        item.required
                          ? 'shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/50 dark:text-rose-200'
                          : 'shrink-0 rounded-full bg-slate-200/90 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-200'
                      }
                    >
                      {item.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                  {hasCertOptions ? (
                    readOnly ? (
                      <p className="text-xs font-medium text-indigo-900 dark:text-indigo-100">
                        {certOpts.find((o) => o.encoded === selectedEncoded)?.label || '—'}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {certOpts.map(({ encoded, label }) => (
                          <label
                            key={encoded}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
                              selectedEncoded === encoded
                                ? 'border-indigo-500 bg-white text-indigo-950 shadow-sm ring-1 ring-indigo-300 dark:border-indigo-400 dark:bg-indigo-900/40 dark:text-indigo-50 dark:ring-indigo-600'
                                : 'border-indigo-200/80 bg-white/70 text-indigo-900 hover:border-indigo-400 dark:border-indigo-800 dark:bg-slate-800/60 dark:text-indigo-100 dark:hover:border-indigo-500'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`cert-option-${itemId}${radioNameSuffix}`}
                              value={encoded}
                              checked={selectedEncoded === encoded}
                              onChange={() => onChecklistOptionChange(itemId, encoded)}
                              className="h-3 w-3 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    )
                  ) : null}
                  <div className="mt-1 flex justify-end gap-3 border-t border-indigo-200/60 pt-2 dark:border-indigo-800/50">
                    {readOnly ? (
                      <span
                        className={`inline-flex items-center rounded-lg border px-3 py-1 text-xs font-semibold uppercase ${
                          status === 'received'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                            : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                        }`}
                      >
                        {status === 'received' ? 'Received' : 'Pending'}
                      </span>
                    ) : (
                      documentStatusOptions.map((statusOption) => (
                        <label
                          key={`${itemId}-${statusOption}`}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-semibold uppercase transition ${
                            status === statusOption
                              ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-900/30 dark:text-blue-200'
                              : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-blue-400 dark:hover:text-blue-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`cert-checklist-${itemId}${radioNameSuffix}`}
                            value={statusOption}
                            checked={status === statusOption}
                            onChange={() => onChecklistStatusChange(itemId, statusOption, hasCertOptions)}
                            className="h-3 w-3 border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>{statusOption === 'received' ? 'Received' : 'Pending'}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ) : certificateGuidance?.format === 'certificate_config' ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">
            No certificate rules are configured for program level{' '}
            <span className="font-mono">{certificateGuidance.level || programLevelTrimmed}</span>.
          </p>
          <p className="mt-1 text-xs">
            Add a{' '}
            <span className="font-mono">
              {`"${(certificateGuidance.level || programLevelTrimmed).toLowerCase()}"`}
            </span>{' '}
            bucket to <span className="font-mono">student_database.settings.certificate_config</span> to populate this
            checklist.
          </p>
        </div>
      ) : certificateGuidance &&
        (certificateGuidance.format === 'html' || certificateGuidance.format === 'text') &&
        String(certificateGuidance.body || '').trim() ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/50">
          {certificateGuidance.format === 'html' ? (
            <div
              className="certificate-guidance-html max-w-none [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: certificateGuidance.body || '' }}
            />
          ) : (
            <div className="whitespace-pre-wrap">{certificateGuidance.body}</div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">Certificate configuration is not set up in the secondary student database.</p>
          <p className="mt-1 text-xs">
            Add a row to <span className="font-mono">student_database.settings</span> with key{' '}
            <span className="font-mono">certificate_config</span> and a JSON value such as{' '}
            <span className="font-mono">{`{"diploma":[…],"ug":[…],"pg":[…]}`}</span> to drive this checklist for program
            level <span className="font-mono">{programLevelTrimmed}</span>.
          </p>
        </div>
      )}
    </div>
  );
}
