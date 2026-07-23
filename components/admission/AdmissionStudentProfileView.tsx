'use client';

import type { ReactNode } from 'react';
import {
  GraduationCap,
  Phone,
  User,
  Users,
} from 'lucide-react';
import type { Admission } from '@/types';
import type { CleanRegistrationFieldEntry } from '@/lib/registrationFieldsDisplay';
import {
  formatRegistrationFieldDisplayValue,
  formatRegistrationFieldLabel,
  isRegistrationImageDataUrl,
} from '@/lib/registrationFieldsDisplay';
import { pickStudentPortraitForAdmitCard } from '@/components/joining/PrintableAdmitCard';
import {
  formatCommunicationAddressLines,
  formatRelativeAddressBlock,
} from '@/lib/formatJoiningAddressDisplay';
import { maskPhone } from '@/lib/maskSensitiveDisplay';
import { cn } from '@/lib/utils';

type AdmissionLeadData = Record<string, unknown> & {
  enquiryNumber?: string;
  academicYear?: number | string;
};

type Props = {
  admission: Admission;
  lead?: AdmissionLeadData;
  collegeName?: string;
  courseName?: string;
  branchName?: string;
  studentProfileRegistrationEntries: CleanRegistrationFieldEntry[];
  courseQuotaRegistrationEntries: CleanRegistrationFieldEntry[];
  revealedAadhaars: { student: boolean; father: boolean; mother: boolean };
  onToggleAadhaar: (type: 'student' | 'father' | 'mother') => void;
  maskAadhaar: (value?: string) => string;
  revealedPhones: Record<string, boolean>;
  onTogglePhone: (key: string) => void;
};

function MaskedPhoneField({
  label,
  value,
  phoneKey,
  revealed,
  onToggle,
  className,
}: {
  label: string;
  value?: string;
  phoneKey: string;
  revealed: boolean;
  onToggle: (key: string) => void;
  className?: string;
}) {
  const trimmed = String(value ?? '').trim();
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </p>
        {trimmed ? (
          <button
            type="button"
            onClick={() => onToggle(phoneKey)}
            className="text-[10px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
        {!trimmed ? '—' : revealed ? trimmed : maskPhone(trimmed)}
      </p>
    </div>
  );
}

function safeProfilePhotoSrc(url?: string | null): string | null {
  const s = String(url ?? '').trim();
  if (!s) return null;
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  if (s.startsWith('blob:')) return s;
  return null;
}

function pickParentPhotoFromRegistration(
  registrationFormData: unknown,
  parent: 'father' | 'mother'
): string | null {
  if (!registrationFormData || typeof registrationFormData !== 'object') return null;
  const reg = registrationFormData as Record<string, unknown>;
  const preferredKeys =
    parent === 'father'
      ? ['father_photo', 'fatherPhoto', 'father_picture', 'fatherPicture']
      : ['mother_photo', 'motherPhoto', 'mother_picture', 'motherPicture'];
  for (const key of preferredKeys) {
    const ok = safeProfilePhotoSrc(typeof reg[key] === 'string' ? reg[key] : null);
    if (ok) return ok;
  }
  for (const [key, value] of Object.entries(reg)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const normalized = key.toLowerCase().replace(/\s+/g, '_');
    if (!normalized.includes(parent)) continue;
    if (
      !(
        normalized.includes('photo') ||
        normalized.includes('picture') ||
        normalized.includes('image')
      )
    ) {
      continue;
    }
    const ok = safeProfilePhotoSrc(value);
    if (ok) return ok;
  }
  return null;
}

function ProfilePhoto({
  src,
  label,
  size = 'md',
}: {
  src?: string | null;
  label: string;
  size?: 'lg' | 'md';
}) {
  const frameClass =
    size === 'lg' ? 'h-44 w-full sm:h-48' : 'h-40 w-full sm:h-44';
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <div
        className={cn(
          'overflow-hidden rounded-xl border-2 border-violet-100 bg-slate-100 dark:border-violet-900/40 dark:bg-slate-800',
          frameClass
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-slate-400">
            <User className={size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'} aria-hidden />
            <span className="text-center text-[9px] font-medium uppercase tracking-wide">
              No photo
            </span>
          </div>
        )}
      </div>
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
    </div>
  );
}

function ProfileField({
  label,
  value,
  className,
  mono,
}: {
  label: string;
  value?: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100',
          mono && 'font-mono'
        )}
      >
        {value === undefined || value === null || value === '' ? '—' : value}
      </p>
    </div>
  );
}

function ProfileDetailCard({
  title,
  icon,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/55',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {icon ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
            {icon}
          </div>
        ) : null}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          {title}
        </h3>
      </div>
      <div className={cn('mt-3', bodyClassName)}>{children}</div>
    </div>
  );
}

function resolveRegistrationValue(
  entries: CleanRegistrationFieldEntry[],
  matchers: string[]
): string {
  const want = new Set(matchers.map((m) => m.toLowerCase()));
  for (const [key, raw] of entries) {
    const n = String(key).trim().toLowerCase().replace(/\s+/g, '_');
    if (!want.has(n)) continue;
    const text = formatRegistrationFieldDisplayValue(key, raw);
    if (text && text !== '—') return text;
  }
  return '';
}

export function AdmissionStudentProfileView({
  admission,
  lead,
  collegeName,
  courseName,
  branchName,
  studentProfileRegistrationEntries,
  courseQuotaRegistrationEntries,
  revealedAadhaars,
  onToggleAadhaar,
  maskAadhaar,
  revealedPhones,
  onTogglePhone,
}: Props) {
  const studentPhoto = pickStudentPortraitForAdmitCard(admission);
  const fatherPhoto =
    safeProfilePhotoSrc(admission.parents?.father?.photo) ||
    pickParentPhotoFromRegistration(admission.registrationFormData, 'father');
  const motherPhoto =
    safeProfilePhotoSrc(admission.parents?.mother?.photo) ||
    pickParentPhotoFromRegistration(admission.registrationFormData, 'mother');
  const commLines = formatCommunicationAddressLines(admission.address?.communication);
  const fullAddress = [
    commLines.doorOrStreet,
    commLines.landmark,
    commLines.locality,
    commLines.pin,
  ]
    .filter((line) => line && line !== '—')
    .join(', ');

  const academicYear =
    resolveRegistrationValue(courseQuotaRegistrationEntries, [
      'academic_year',
      'current_academic_year',
      'admission_academic_year',
    ]) || String(lead?.academicYear ?? '').trim();
  const semester = resolveRegistrationValue(courseQuotaRegistrationEntries, [
    'current_semester',
    'semester',
    'semister',
  ]);
  const rollNo = resolveRegistrationValue(studentProfileRegistrationEntries, [
    'roll_no',
    'roll_number',
    'rollnumber',
  ]);
  const apaarId = resolveRegistrationValue(studentProfileRegistrationEntries, [
    'apaar_id',
    'apaarid',
    'apaar',
  ]);
  const isAdmissionDetailRegistrationKey = (normalizedKey: string) => {
    const n = normalizedKey;
    return (
      n === 'created_from' ||
      n === 'createdfrom' ||
      n === 'student_status' ||
      n === 'studentstatus' ||
      n === 'admission_date' ||
      n === 'admissiondate' ||
      n === 'scholar_status' ||
      n === 'scholarstatus' ||
      n === 'certificates_status' ||
      n === 'certificatesstatus' ||
      n === 'certification_status' ||
      n === 'certificationstatus' ||
      n === 'program_total_years' ||
      n === 'programtotalyears'
    );
  };
  const registrationDetailEntries = studentProfileRegistrationEntries
    .filter(([key, raw]) => {
      if (isRegistrationImageDataUrl(raw)) return false;
      const n = String(key).trim().toLowerCase().replace(/\s+/g, '_');
      if (
        n.includes('aadhaar') ||
        n.includes('aadhar') ||
        n.includes('phone') ||
        n.includes('mobile') ||
        n === 'father_name' ||
        n === 'fathername' ||
        n === 'roll_no' ||
        n === 'roll_number' ||
        n === 'rollnumber' ||
        n === 'apaar_id' ||
        n === 'apaarid' ||
        n === 'apaar' ||
        n === 'date_of_birth' ||
        n === 'dob' ||
        n === 'gender'
      ) {
        return false;
      }
      return true;
    })
    .map(([key, raw]) => ({
      key,
      normalizedKey: String(key).trim().toLowerCase().replace(/\s+/g, '_'),
      label: formatRegistrationFieldLabel(key),
      value: formatRegistrationFieldDisplayValue(key, raw),
    }))
    .filter((entry) => entry.value && entry.value !== '—');
  const admissionDetailExtras = registrationDetailEntries.filter(
    (entry) =>
      isAdmissionDetailRegistrationKey(entry.normalizedKey) &&
      // Admission date is already rendered from admission.admissionDate / createdAt
      entry.normalizedKey !== 'admission_date' &&
      entry.normalizedKey !== 'admissiondate'
  );
  const additionalStudentInfoDetails = registrationDetailEntries.filter(
    (entry) => !isAdmissionDetailRegistrationKey(entry.normalizedKey)
  );
  const fatherName =
    admission.parents?.father?.name ||
    resolveRegistrationValue(studentProfileRegistrationEntries, ['father_name', 'fathername']);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/40 shadow-lg dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-col lg:flex-row">
        {/* Left summary rail */}
        <aside className="w-full shrink-0 border-b border-slate-200/80 bg-white p-5 dark:border-slate-700 dark:bg-slate-900/50 lg:w-80 lg:border-b-0 lg:border-r">
          <div className="flex flex-col items-center">
            <div className="mx-auto w-full max-w-[240px]">
              <ProfilePhoto src={studentPhoto} label="Student photo" size="lg" />
            </div>

            <div className="mt-5 w-full space-y-3 text-left">
              <ProfileField label="Full name" value={admission.studentInfo?.name} />
              <ProfileField label="College" value={collegeName} />
              <ProfileField label="Program" value={courseName || admission.courseInfo?.course} />
              <ProfileField label="Branch" value={branchName || admission.courseInfo?.branch} />
              {(academicYear || semester) && (
                <div className="grid grid-cols-2 gap-2">
                  {academicYear ? <ProfileField label="Year" value={academicYear} /> : null}
                  {semester ? <ProfileField label="Semester" value={semester} /> : null}
                </div>
              )}
              {lead?.enquiryNumber ? (
                <ProfileField label="Enquiry #" value={lead.enquiryNumber} mono />
              ) : null}
            </div>

            <div className="mx-auto mt-5 flex w-full max-w-[240px] flex-col items-center gap-3">
              <ProfilePhoto src={fatherPhoto} label="Father photo" />
              <ProfilePhoto src={motherPhoto} label="Mother photo" />
            </div>
          </div>
        </aside>

        {/* Right detail grid — one-screen compact view */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-2">
            <ProfileDetailCard
              title="Admission details"
              icon={<GraduationCap className="h-4 w-4" aria-hidden />}
              bodyClassName="grid gap-3 sm:grid-cols-2"
            >
              <ProfileField label="Admission number" value={admission.admissionNumber} mono />
              <ProfileField label="Roll no" value={rollNo || '—'} mono />
              <ProfileField label="Quota" value={admission.courseInfo?.quota} />
              <ProfileField label="Status" value={admission.status} />
              <ProfileField
                label="Admission date"
                value={
                  admission.admissionDate || admission.createdAt
                    ? new Date(admission.admissionDate || admission.createdAt!).toLocaleDateString(
                        'en-IN',
                        { day: '2-digit', month: 'short', year: 'numeric' }
                      )
                    : '—'
                }
              />
              {admissionDetailExtras.map((entry) => (
                <ProfileField
                  key={entry.key}
                  label={entry.label}
                  value={entry.value}
                  className={entry.value.length > 40 ? 'sm:col-span-2' : undefined}
                />
              ))}
            </ProfileDetailCard>

            <ProfileDetailCard
              title="Student information"
              icon={<User className="h-4 w-4" aria-hidden />}
              bodyClassName="grid gap-3 sm:grid-cols-2"
            >
              <MaskedPhoneField
                label="Mobile number"
                value={admission.studentInfo?.phone}
                phoneKey="student"
                revealed={!!revealedPhones.student}
                onToggle={onTogglePhone}
              />
              <MaskedPhoneField
                label="Preferred mobile"
                value={admission.studentInfo?.preferredMobileNumber}
                phoneKey="preferred"
                revealed={!!revealedPhones.preferred}
                onToggle={onTogglePhone}
              />
              <ProfileField label="Father name" value={fatherName} />
              <ProfileField label="Date of birth" value={admission.studentInfo?.dateOfBirth} />
              <ProfileField label="Gender" value={admission.studentInfo?.gender} />
              <ProfileField label="APAAR ID" value={apaarId || '—'} mono />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Aadhaar number
                  </p>
                  {admission.studentInfo?.aadhaarNumber ? (
                    <button
                      type="button"
                      onClick={() => onToggleAadhaar('student')}
                      className="text-[10px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
                    >
                      {revealedAadhaars.student ? 'Hide' : 'Show'}
                    </button>
                  ) : null}
                </div>
                <p className="mt-0.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                  {revealedAadhaars.student
                    ? admission.studentInfo?.aadhaarNumber || '—'
                    : maskAadhaar(admission.studentInfo?.aadhaarNumber)}
                </p>
              </div>
              {additionalStudentInfoDetails.map((entry) => (
                <ProfileField
                  key={entry.key}
                  label={entry.label}
                  value={entry.value}
                  className={entry.value.length > 40 ? 'sm:col-span-2' : undefined}
                />
              ))}
              {admission.address ? (
                <ProfileField
                  label="Full address"
                  value={fullAddress || '—'}
                  className="sm:col-span-2"
                />
              ) : null}
            </ProfileDetailCard>

            {admission.parents ? (
              <ProfileDetailCard
                title="Parent information"
                icon={<Phone className="h-4 w-4" aria-hidden />}
                className="xl:col-span-2"
                bodyClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <ProfileField label="Father name" value={admission.parents.father?.name} />
                <MaskedPhoneField
                  label="Father mobile"
                  value={admission.parents.father?.phone}
                  phoneKey="father"
                  revealed={!!revealedPhones.father}
                  onToggle={onTogglePhone}
                />
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Father Aadhaar number
                    </p>
                    {admission.parents.father?.aadhaarNumber ? (
                      <button
                        type="button"
                        onClick={() => onToggleAadhaar('father')}
                        className="text-[10px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
                      >
                        {revealedAadhaars.father ? 'Hide' : 'Show'}
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                    {revealedAadhaars.father
                      ? admission.parents.father?.aadhaarNumber || '—'
                      : maskAadhaar(admission.parents.father?.aadhaarNumber)}
                  </p>
                </div>
                <ProfileField
                  label="Father occupation"
                  value={admission.parents.father?.occupation || '—'}
                />
                <ProfileField label="Mother name" value={admission.parents.mother?.name} />
                <MaskedPhoneField
                  label="Mother mobile"
                  value={admission.parents.mother?.phone}
                  phoneKey="mother"
                  revealed={!!revealedPhones.mother}
                  onToggle={onTogglePhone}
                />
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Mother Aadhaar number
                    </p>
                    {admission.parents.mother?.aadhaarNumber ? (
                      <button
                        type="button"
                        onClick={() => onToggleAadhaar('mother')}
                        className="text-[10px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
                      >
                        {revealedAadhaars.mother ? 'Hide' : 'Show'}
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                    {revealedAadhaars.mother
                      ? admission.parents.mother?.aadhaarNumber || '—'
                      : maskAadhaar(admission.parents.mother?.aadhaarNumber)}
                  </p>
                </div>
                <ProfileField
                  label="Mother occupation"
                  value={admission.parents.mother?.occupation || '—'}
                />
              </ProfileDetailCard>
            ) : null}

            {admission.educationHistory && admission.educationHistory.length > 0 ? (
              <ProfileDetailCard
                title="Education history"
                icon={<GraduationCap className="h-4 w-4" aria-hidden />}
                className="xl:col-span-2"
                bodyClassName="grid gap-2 sm:grid-cols-2"
              >
                {admission.educationHistory.map((edu, idx) => {
                  const label =
                    edu.level === 'other' && edu.otherLevelLabel?.trim()
                      ? edu.otherLevelLabel
                      : edu.level?.replace(/_/g, ' ') || '—';
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <p className="text-xs font-semibold uppercase text-slate-800 dark:text-slate-100">
                        {label}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {[edu.courseOrBranch, edu.yearOfPassing, edu.institutionName]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                    </div>
                  );
                })}
              </ProfileDetailCard>
            ) : null}

            {admission.siblings && admission.siblings.length > 0 ? (
              <ProfileDetailCard
                title="Siblings"
                icon={<Users className="h-4 w-4" aria-hidden />}
                bodyClassName="grid gap-2 sm:grid-cols-2"
              >
                {admission.siblings.map((sibling, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {sibling.name || '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[sibling.relation, sibling.studyingStandard, sibling.institutionName]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                ))}
              </ProfileDetailCard>
            ) : null}

            {admission.remarks ? (
              <ProfileDetailCard
                title="Admission remarks"
                icon={<GraduationCap className="h-4 w-4" aria-hidden />}
                className="xl:col-span-2"
              >
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {admission.remarks}
                </p>
              </ProfileDetailCard>
            ) : null}

            {admission.address?.relatives && admission.address.relatives.length > 0 ? (
              <ProfileDetailCard
                title="Relatives information"
                icon={<Users className="h-4 w-4" aria-hidden />}
                bodyClassName="grid gap-2 sm:grid-cols-2"
              >
                {admission.address.relatives.map((relative, idx) => {
                  const block = formatRelativeAddressBlock(relative);
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {block.header}
                        {relative.isGuardian ? (
                          <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                            Guardian
                          </span>
                        ) : null}
                      </p>
                      {block.addressLine ? (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {block.addressLine}
                        </p>
                      ) : null}
                      {block.mobile ? (
                        <MaskedPhoneField
                          label="Mobile"
                          value={block.mobile}
                          phoneKey={`relative-${idx}`}
                          revealed={!!revealedPhones[`relative-${idx}`]}
                          onToggle={onTogglePhone}
                          className="mt-2"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </ProfileDetailCard>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
