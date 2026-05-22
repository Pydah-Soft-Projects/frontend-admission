'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLocations } from '@/lib/useLocations';
import { useInstitutions } from '@/lib/useInstitutions';
import { isJoiningRegistrationCertificationStatusField } from '@/lib/joiningRegistrationFieldFilter';
import {
  isJoiningRegistrationBatchField,
  listRegistrationRemarkFieldNames,
} from '@/lib/joiningAcademicYearRegistration';
import {
  isJoiningFatherPortraitFileField,
  isJoiningMotherPortraitFileField,
  isJoiningStudentPortraitUploadField,
} from '@/lib/joiningRegistrationPhotoFields';
import { JoiningCameraCaptureButton } from '@/components/joining/JoiningCameraCaptureButton';
import {
  isApaarIdField,
  isFixedAcademicYearField,
  isFixedSemesterField,
  isJoiningRegistrationIntakeField,
  isPreviousCollegeField,
  joiningStudentProfileFieldRank,
  sortJoiningRegistrationProfileFields,
  splitRegistrationGridFields,
} from '@/lib/joiningRegistrationFieldLayout';

/** Fields with rank below this render above the previous-college / APAAR / contact row. */
const JOINING_PREVIOUS_COLLEGE_CONTACT_ROW_RANK = 80;

export { isApaarIdField } from '@/lib/joiningRegistrationFieldLayout';

export type RegistrationFormField = {
  _id?: string;
  fieldName: string;
  fieldType: string;
  fieldLabel: string;
  placeholder?: string;
  isRequired?: boolean;
  options?: unknown;
  helpText?: string;
  defaultValue?: string;
  displayOrder?: number;
};

function normalizeFieldOptions(rawOptions: unknown): Array<{ value: string; label: string }> {
  let parsed: unknown = rawOptions;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = trimmed.split(',').map((x) => x.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((option: unknown) => {
      if (typeof option === 'string' || typeof option === 'number') {
        const text = String(option).trim();
        return text ? { value: text, label: text } : null;
      }
      if (option && typeof option === 'object') {
        const o = option as Record<string, unknown>;
        const value = String(o.value ?? o.label ?? '').trim();
        const label = String(o.label ?? o.value ?? '').trim();
        if (!value && !label) return null;
        return { value: value || label, label: label || value };
      }
      return null;
    })
    .filter(Boolean) as Array<{ value: string; label: string }>;
}

function isStateField(field: RegistrationFormField) {
  const n = (field.fieldName || '').toLowerCase();
  return n === 'state' || n === 'address_state';
}
function isDistrictField(field: RegistrationFormField) {
  const n = (field.fieldName || '').toLowerCase();
  return n === 'district' || n === 'address_district';
}
function isMandalField(field: RegistrationFormField) {
  const n = (field.fieldName || '').toLowerCase();
  return n === 'mandal' || n === 'address_mandal';
}
function isLocationDropdownField(field: RegistrationFormField) {
  return isStateField(field) || isDistrictField(field) || isMandalField(field);
}
function isSchoolOrCollegeField(field: RegistrationFormField) {
  return (field.fieldName || '').toLowerCase() === 'school_or_college_name';
}

function isRegistrationPortraitField(field: RegistrationFormField): boolean {
  if (field.fieldType !== 'file') return false;
  return (
    isJoiningStudentPortraitUploadField(field) ||
    isJoiningFatherPortraitFileField(field) ||
    isJoiningMotherPortraitFileField(field)
  );
}

/**
 * Detect a "Batch" / admission year field regardless of how the student-database form
 * declares it (text input, number, dropdown, etc). When matched we override the rendering
 * with the same year-picker as the Fee Structure section so both surfaces stay in sync.
 */
function isBatchField(field: RegistrationFormField): boolean {
  return isJoiningRegistrationBatchField(field.fieldName || '', field.fieldLabel || '');
}

/** current ± 3 years, newest first. Same window as the Fee Structure section. */
function buildBatchYears(currentYear: number): number[] {
  const out: number[] = [];
  for (let offset = 3; offset >= -3; offset -= 1) out.push(currentYear + offset);
  return out;
}

function coerceBatchYear(value: unknown): string {
  if (value === undefined || value === null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1900 && numeric < 3000) {
    return String(Math.trunc(numeric));
  }
  return raw;
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.trim());
}

/** Safe ASCII-ish slug for filenames (student name, etc.). */
function slugifyForFileName(raw: string, max = 40): string {
  const s = String(raw || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const out = s.slice(0, max).replace(/^_+|_+$/g, '');
  return out || 'student';
}

function stemFromLabel(label: string, fieldName: string, max = 36): string {
  const raw = String(label || fieldName || 'photo').trim();
  return slugifyForFileName(raw, max);
}

function extensionFromMime(mime: string): string {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  return 'jpg';
}

function buildRenamedImageFile(
  file: File,
  photoBaseSlug: string,
  fieldStem: string,
  source: 'camera' | 'gallery'
): File {
  const fromMime = extensionFromMime(file.type);
  const fromName = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const rawExt = fromMime || fromName || 'jpg';
  const safeExt = ['png', 'webp', 'jpg', 'jpeg'].includes(rawExt) ? (rawExt === 'jpeg' ? 'jpg' : rawExt) : 'jpg';
  const finalName = `${photoBaseSlug}_${fieldStem}_${source}_${Date.now()}.${safeExt}`;
  const mime = file.type && file.type.startsWith('image/') ? file.type : `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`;
  try {
    return new File([file], finalName, { type: mime, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

type ReadImageMeta = {
  photoBaseSlug: string;
  fieldLabel: string;
  fieldName: string;
  source: 'camera' | 'gallery';
  onSuccessMeta?: (meta: { fileName: string }) => void;
};

function readImageFileToFormValue(
  file: File,
  fieldName: string,
  onChange: (fieldName: string, value: unknown) => void,
  meta?: ReadImageMeta
) {
  const toRead =
    meta != null
      ? buildRenamedImageFile(file, meta.photoBaseSlug, stemFromLabel(meta.fieldLabel, meta.fieldName), meta.source)
      : file;
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    meta?.onSuccessMeta?.({ fileName: toRead.name });
    onChange(fieldName, result || toRead.name);
  };
  reader.onerror = () => {
    onChange(fieldName, toRead.name);
  };
  reader.readAsDataURL(toRead);
}

type PortraitSlotProps = {
  label: string;
  required?: boolean;
  helpText?: string;
  fieldName: string;
  fieldLabelForFile: string;
  value: unknown;
  onChange: (fieldName: string, value: unknown) => void;
  photoBaseSlug: string;
  subjectDisplayName: string;
};

function RegistrationPortraitSlot({
  label,
  required,
  helpText,
  fieldName,
  fieldLabelForFile,
  value,
  onChange,
  photoBaseSlug,
  subjectDisplayName,
}: PortraitSlotProps) {
  const fileLabel = String(value || '').trim();
  const hasPreview = isImageDataUrl(value);
  const [lastSavedFilename, setLastSavedFilename] = useState<string | null>(null);
  useEffect(() => {
    if (!value || !isImageDataUrl(value)) setLastSavedFilename(null);
  }, [value]);

  const galleryInputId = `joining-reg-photo-gal-${fieldName}`;
  const inputNameGal = `joining_registration_photo_${fieldName}_gallery`;

  const pick =
    (source: 'camera' | 'gallery'): ChangeEventHandler<HTMLInputElement> =>
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      readImageFileToFormValue(file, fieldName, onChange, {
        photoBaseSlug,
        fieldLabel: fieldLabelForFile,
        fieldName,
        source,
        onSuccessMeta: ({ fileName }) => setLastSavedFilename(fileName),
      });
    };
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center rounded-xl border border-white/80 bg-white/70 p-4 shadow-inner dark:border-slate-600 dark:bg-slate-800/60">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-white/90 dark:border-slate-600 dark:bg-slate-800/90">
        {hasPreview ? (
          <img
            src={String(value)}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : fileLabel ? (
          <span className="px-2 text-center text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            File selected
          </span>
        ) : (
          <Camera className="h-9 w-9 text-blue-400 dark:text-blue-500" aria-hidden />
        )}
      </div>
      <p className="mt-3 text-center text-xs font-semibold text-gray-900 dark:text-slate-100">
        {label}
        {required ? <span className="text-red-500"> *</span> : <span className="font-normal text-slate-500"> (optional)</span>}
      </p>
      {helpText ? <p className="mt-1 text-center text-[10px] text-gray-600 dark:text-slate-400">{helpText}</p> : null}
      {fileLabel && !hasPreview ? (
        <p className="mt-1 max-w-full truncate text-center text-[10px] font-medium text-blue-800 dark:text-blue-300" title={fileLabel}>
          {fileLabel}
        </p>
      ) : null}
      {lastSavedFilename ? (
        <p className="mt-1 max-w-full truncate text-center text-[10px] text-slate-600 dark:text-slate-400" title={lastSavedFilename}>
          Saved as <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{lastSavedFilename}</span>
        </p>
      ) : null}
      <div className="mt-3 flex w-full flex-col gap-2">
        <JoiningCameraCaptureButton
          aria-label={`Take ${label} with camera — ${subjectDisplayName}`}
          buttonClassName="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900"
          onCapture={(file) =>
            readImageFileToFormValue(file, fieldName, onChange, {
              photoBaseSlug,
              fieldLabel: fieldLabelForFile,
              fieldName,
              source: 'camera',
              onSuccessMeta: ({ fileName }) => setLastSavedFilename(fileName),
            })
          }
        >
          <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {fileLabel ? 'Retake (camera)' : 'Take photo'}
        </JoiningCameraCaptureButton>
        <input
          id={galleryInputId}
          name={inputNameGal}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={`Upload ${label} from gallery — ${subjectDisplayName}`}
          onChange={pick('gallery')}
        />
        <label
          htmlFor={galleryInputId}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
        >
          <ImagePlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {fileLabel ? 'Change (gallery)' : 'Upload'}
        </label>
      </div>
    </div>
  );
}

type Props = {
  formTitle?: string;
  formDescription?: string;
  fields: RegistrationFormField[];
  /** Current values for all rendered fields (mapped + extras). */
  getValue: (fieldName: string) => string | boolean;
  onChange: (fieldName: string, value: unknown) => void;
  /** State / district names for location dropdowns (from parent merged address + extras). */
  selectedState: string;
  selectedDistrict: string;
  /**
   * Locked intake year / semester for non–B.Tech programs (calendar year + 1-1).
   * B.Tech: year is only a display default when empty; real value comes from `getValue`.
   */
  fixedRegistrationAcademicYear: string;
  fixedRegistrationSemester: string;
  /** B.Tech: allow current vs prior academic year; semester stays fixed (2-1). */
  isBtechJoining?: boolean;
  btechYearOptions?: Array<{ value: string; label: string }>;
  /**
   * Student (or applicant) identity for naming camera files and accessible labels.
   * `baseSlug` is typically the raw name; it is slugified inside this component.
   */
  photoUploadContext?: {
    baseSlug: string;
    displayName: string;
  };
  /** Shown on the same row as APAAR ID (structured joining student fields). */
  studentContactFields?: {
    phone: string;
    onPhoneChange: (value: string) => void;
    aadhaarNumber: string;
    onAadhaarChange: (value: string) => void;
    showAadhaar: boolean;
    onToggleShowAadhaar: () => void;
  };
  /** Current academic year / semester are shown beside Course & Quota on the joining page. */
  omitIntakeYearSemesterFromGrid?: boolean;
};

export function JoiningDynamicRegistrationFields({
  formTitle,
  formDescription,
  fields,
  getValue,
  onChange,
  selectedState,
  selectedDistrict,
  fixedRegistrationAcademicYear,
  fixedRegistrationSemester,
  isBtechJoining = false,
  btechYearOptions,
  photoUploadContext,
  studentContactFields,
  omitIntakeYearSemesterFromGrid = false,
}: Props) {
  const { stateNames, districtNames, mandalNames } = useLocations({
    stateName: selectedState || undefined,
    districtName: selectedDistrict || undefined,
  });

  const studentGroup = String(
    (getValue('student_group') as string) || (getValue('studentGroup') as string) || ''
  )
    .toLowerCase()
    .trim();
  const useSchoolsList = studentGroup === '10th';
  const hasSelectedGroup = Boolean(studentGroup);
  const { schools, colleges, isLoading: institutionsLoading } = useInstitutions();
  const activeInstitutions = useSchoolsList ? schools : colleges;

  const photoBaseSlug = useMemo(
    () => slugifyForFileName(photoUploadContext?.baseSlug ?? ''),
    [photoUploadContext?.baseSlug]
  );
  const subjectDisplayName = useMemo(() => {
    const d = String(photoUploadContext?.displayName || '').trim();
    return d || 'Student';
  }, [photoUploadContext?.displayName]);

  const sorted = useMemo(() => sortJoiningRegistrationProfileFields(fields), [fields]);

  /** Remark / comment fields stay at the bottom so the 3-column grid packs without gaps. */
  const remarkFieldNames = useMemo(
    () => new Set(listRegistrationRemarkFieldNames(sorted)),
    [sorted]
  );

  const displayOrderedFields = useMemo(() => {
    const remarks: RegistrationFormField[] = [];
    const photos: RegistrationFormField[] = [];
    const main: RegistrationFormField[] = [];

    for (const field of sorted) {
      if (remarkFieldNames.has(field.fieldName)) {
        remarks.push(field);
      } else if (isRegistrationPortraitField(field)) {
        photos.push(field);
      } else {
        main.push(field);
      }
    }

    return [...main, ...photos, ...remarks];
  }, [sorted, remarkFieldNames]);

  const apaarField = useMemo(
    () => displayOrderedFields.find(isApaarIdField) ?? null,
    [displayOrderedFields]
  );

  const contactBesidePreviousCollege = useMemo(
    () =>
      Boolean(
        apaarField &&
          studentContactFields &&
          displayOrderedFields.some(isPreviousCollegeField)
      ),
    [displayOrderedFields, apaarField, studentContactFields]
  );

  const gridFields = useMemo(() => {
    let list = displayOrderedFields;
    if (contactBesidePreviousCollege) {
      list = list.filter((f) => !isApaarIdField(f));
    }
    if (omitIntakeYearSemesterFromGrid) {
      list = list.filter((f) => !isJoiningRegistrationIntakeField(f));
    }
    return list;
  }, [displayOrderedFields, contactBesidePreviousCollege, omitIntakeYearSemesterFromGrid]);

  const registrationGridLayout = useMemo(
    () => splitRegistrationGridFields(gridFields, { omitApaar: false, omitIntake: false }),
    [gridFields]
  );

  const mainGridFields = useMemo(() => {
    if (
      !registrationGridLayout.showPreviousCollegeContactRow ||
      !apaarField ||
      !studentContactFields
    ) {
      return gridFields;
    }
    return [
      ...registrationGridLayout.beforePreviousCollege,
      ...registrationGridLayout.afterPreviousCollege,
    ];
  }, [gridFields, registrationGridLayout, apaarField, studentContactFields]);

  const fieldsBeforePreviousCollegeContactRow = useMemo(
    () =>
      mainGridFields.filter(
        (f) => joiningStudentProfileFieldRank(f) < JOINING_PREVIOUS_COLLEGE_CONTACT_ROW_RANK
      ),
    [mainGridFields]
  );

  const fieldsAfterPreviousCollegeContactRow = useMemo(
    () =>
      mainGridFields.filter(
        (f) => joiningStudentProfileFieldRank(f) >= JOINING_PREVIOUS_COLLEGE_CONTACT_ROW_RANK
      ),
    [mainGridFields]
  );

  const gridRenderSequence = useMemo(() => {
    type SeqItem =
      | { kind: 'field'; field: RegistrationFormField }
      | { kind: 'student-mobile' }
      | { kind: 'student-aadhaar' }
      | { kind: 'apaar'; field: RegistrationFormField };

    const seq: SeqItem[] = fieldsBeforePreviousCollegeContactRow.map((field) => ({
      kind: 'field' as const,
      field,
    }));

    if (studentContactFields) {
      seq.push({ kind: 'student-mobile' });
      seq.push({ kind: 'student-aadhaar' });
    }

    if (!contactBesidePreviousCollege) {
      return mainGridFields.map((field) => ({ kind: 'field' as const, field }));
    }

    for (const field of registrationGridLayout.previousCollegeFields) {
      seq.push({ kind: 'field', field });
    }
    if (apaarField) {
      seq.push({ kind: 'apaar', field: apaarField });
    }

    for (const field of fieldsAfterPreviousCollegeContactRow) {
      seq.push({ kind: 'field', field });
    }
    return seq;
  }, [
    mainGridFields,
    contactBesidePreviousCollege,
    apaarField,
    studentContactFields,
    fieldsBeforePreviousCollegeContactRow,
    fieldsAfterPreviousCollegeContactRow,
    registrationGridLayout.previousCollegeFields,
  ]);

  /** When we render the combined student + parent portrait row, skip standalone father/mother file fields. */
  const portraitSiblingSkip = useMemo(() => {
    const skip = new Set<string>();
    const hasStudentSlot = sorted.some(
      (f) => f.fieldType === 'file' && isJoiningStudentPortraitUploadField(f)
    );
    if (!hasStudentSlot) return skip;
    for (const f of sorted) {
      if (f.fieldType === 'file' && (isJoiningFatherPortraitFileField(f) || isJoiningMotherPortraitFileField(f))) {
        if (f.fieldName) skip.add(f.fieldName);
      }
    }
    return skip;
  }, [sorted]);

  // Batch year dropdown setup — same window as the Fee Structure section so both surfaces
  // stay aligned. The user can still pick any year inside the ±3 window; values outside
  // the window are appended so historical drafts remain editable.
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const batchBaseYears = useMemo(() => buildBatchYears(currentYear), [currentYear]);

  // Auto-default any empty Batch field to the current year on first render. We track
  // which fields we've already defaulted to avoid an effect loop or overwriting a value
  // the user just cleared on purpose.
  const defaultedBatchFieldsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const field of sorted) {
      if (!isBatchField(field)) continue;
      const key = field.fieldName;
      if (defaultedBatchFieldsRef.current.has(key)) continue;
      const current = coerceBatchYear(getValue(key));
      if (!current) {
        onChange(key, String(currentYear));
      }
      defaultedBatchFieldsRef.current.add(key);
    }
    // Only re-run when the set of rendered fields changes (e.g. form definition swap).
    // getValue / onChange are not in deps on purpose — they're parent refs that change on
    // every render and would cause an infinite loop here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, currentYear]);

  if (sorted.length === 0 && !studentContactFields) return null;

  const renderCompactRegistrationField = (field: RegistrationFormField) => {
    const rawVal = getValue(field.fieldName);
    const fieldValue =
      rawVal === undefined || rawVal === null ? '' : field.fieldType === 'checkbox' ? rawVal : String(rawVal);
    const isFieldRequired = Boolean(field.isRequired);

    if (isSchoolOrCollegeField(field)) {
      const labelSuffix = useSchoolsList ? 'School' : 'College';
      const disabled = !hasSelectedGroup || institutionsLoading;
      const datalistId = `joining-reg-${field.fieldName}-list`;
      return (
        <>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
            {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
          </label>
          <Input
            value={String(fieldValue)}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            list={datalistId}
            placeholder={
              !hasSelectedGroup
                ? 'Select student group first'
                : institutionsLoading
                  ? `Loading ${labelSuffix.toLowerCase()}s…`
                  : `Start typing to search ${labelSuffix.toLowerCase()}`
            }
            disabled={disabled}
          />
          <datalist id={datalistId}>
            {activeInstitutions.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
        </>
      );
    }

    if (field.fieldType === 'dropdown') {
      const dropdownOptions = normalizeFieldOptions(field.options);
      return (
        <>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
            {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
          </label>
          <select
            value={String(fieldValue)}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
          >
            <option value="">Select {field.fieldLabel}</option>
            {dropdownOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      );
    }

    const inputType =
      field.fieldType === 'date'
        ? 'date'
        : field.fieldType === 'number'
          ? 'number'
          : field.fieldType === 'email'
            ? 'email'
            : field.fieldType === 'tel'
              ? 'tel'
              : 'text';

    return (
      <Input
        label={`${field.fieldLabel}${isFieldRequired ? ' *' : ''}`}
        name={field.fieldName}
        type={inputType as 'text' | 'email' | 'tel' | 'number' | 'date'}
        value={String(fieldValue)}
        onChange={(e) => onChange(field.fieldName, e.target.value)}
        placeholder={field.placeholder || ''}
      />
    );
  };

  const renderApaarFieldControl = (field: RegistrationFormField) => {
    const rawVal = getValue(field.fieldName);
    const fieldValue =
      rawVal === undefined || rawVal === null ? '' : field.fieldType === 'checkbox' ? rawVal : String(rawVal);
    const isFieldRequired = Boolean(field.isRequired);

    if (field.fieldType === 'dropdown') {
      const dropdownOptions = normalizeFieldOptions(field.options);
      return (
        <>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
            {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
          </label>
          <select
            value={String(fieldValue)}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
          >
            <option value="">Select {field.fieldLabel}</option>
            {dropdownOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      );
    }

    if (field.fieldType === 'radio') {
      const radioOptions = normalizeFieldOptions(field.options);
      return (
        <>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
            {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
          </label>
          <div className="flex flex-wrap gap-3">
            {radioOptions.map((option) => (
              <label
                key={option.value}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
              >
                <input
                  type="radio"
                  name={field.fieldName}
                  value={option.value}
                  checked={String(fieldValue) === option.value}
                  onChange={(e) => onChange(field.fieldName, e.target.value)}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {option.label}
              </label>
            ))}
          </div>
        </>
      );
    }

    return (
      <Input
        label={`${field.fieldLabel}${isFieldRequired ? ' *' : ''}`}
        name={field.fieldName}
        value={String(fieldValue)}
        onChange={(e) => onChange(field.fieldName, e.target.value)}
        placeholder={field.placeholder || ''}
      />
    );
  };

  return (
    <div className="space-y-4">
      {formTitle ? (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{formTitle}</h2>
          {formDescription ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{formDescription}</p>
          ) : null}
          <p className="mt-2 text-xs text-blue-600 dark:text-blue-300">
            Shown fields mirror the student-database registration form (course / branch / quota / student type /
            Aadhaar / caste / address are omitted here when they duplicate the joining form). Update that source to change labels, order,
            or options.
          </p>
        </div>
      ) : null}
      {apaarField && studentContactFields && !contactBesidePreviousCollege ? (
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="min-w-0">{renderApaarFieldControl(apaarField)}</div>
          <div className="min-w-0">
            <Input
              label="Student mobile number"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={studentContactFields.phone}
              onChange={(e) => studentContactFields.onPhoneChange(e.target.value.replace(/\D/g, ''))}
              placeholder="10-digit mobile"
              maxLength={15}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
              Aadhaar Number
            </label>
            <div className="flex gap-2">
              <input
                type={studentContactFields.showAadhaar ? 'text' : 'password'}
                value={studentContactFields.aadhaarNumber}
                onChange={(e) => studentContactFields.onAadhaarChange(e.target.value)}
                placeholder="12-digit Aadhaar number"
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70"
                maxLength={14}
              />
              <Button type="button" variant="secondary" onClick={studentContactFields.onToggleShowAadhaar}>
                {studentContactFields.showAadhaar ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {gridRenderSequence.map((item) => {
          if (item.kind === 'student-mobile' && studentContactFields) {
            return (
              <div key="joining-student-mobile" className="min-w-0">
                <Input
                  label="Student mobile number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={studentContactFields.phone}
                  onChange={(e) =>
                    studentContactFields.onPhoneChange(e.target.value.replace(/\D/g, ''))
                  }
                  placeholder="10-digit mobile"
                  maxLength={15}
                />
              </div>
            );
          }

          if (item.kind === 'student-aadhaar' && studentContactFields) {
            return (
              <div key="joining-student-aadhaar" className="min-w-0">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Aadhaar Number
                </label>
                <div className="flex gap-2">
                  <input
                    type={studentContactFields.showAadhaar ? 'text' : 'password'}
                    value={studentContactFields.aadhaarNumber}
                    onChange={(e) => studentContactFields.onAadhaarChange(e.target.value)}
                    placeholder="12-digit Aadhaar number"
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70"
                    maxLength={14}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={studentContactFields.onToggleShowAadhaar}
                  >
                    {studentContactFields.showAadhaar ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </div>
            );
          }

          if (item.kind === 'apaar') {
            return (
              <div key={item.field._id || item.field.fieldName} className="min-w-0">
                {renderApaarFieldControl(item.field)}
              </div>
            );
          }

          const field = item.field;
          if (portraitSiblingSkip.has(field.fieldName)) {
            return null;
          }
          const isRemarkField = remarkFieldNames.has(field.fieldName);
          const gridItemClass = isRemarkField ? 'md:col-span-3' : undefined;
          const rawVal = getValue(field.fieldName);
          const fieldValue =
            rawVal === undefined || rawVal === null ? '' : field.fieldType === 'checkbox' ? rawVal : String(rawVal);
          const dataCollectionType = String(getValue('data_collection_type') || '');
          const isStaffNameRequired =
            dataCollectionType === 'Direct' || dataCollectionType === 'Exam Center';
          const isFieldRequired =
            Boolean(field.isRequired) || (field.fieldName === 'staff_name' && isStaffNameRequired);

          if (isJoiningRegistrationCertificationStatusField(field)) {
            const v = String(fieldValue || '').trim() || 'Unverified';
            const isVerified = v.toLowerCase() === 'verified';
            return (
              <div key={field._id || field.fieldName} className="md:col-span-3">
                <div className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      isVerified
                        ? 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                        : 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
                    }
                  >
                    {v}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Set from the certificate information checklist in this form.
                  </span>
                </div>
                {field.helpText ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{field.helpText}</p>
                ) : null}
              </div>
            );
          }

          if (isLocationDropdownField(field)) {
            let dropdownOptions: Array<{ value: string; label: string }> = [];
            if (isStateField(field)) {
              dropdownOptions = stateNames.map((s) => ({ value: s, label: s }));
            } else if (isDistrictField(field)) {
              dropdownOptions = districtNames.map((d) => ({ value: d, label: d }));
            } else if (isMandalField(field)) {
              dropdownOptions = mandalNames.map((m) => ({ value: m, label: m }));
            }
            const disabled =
              (isDistrictField(field) && !selectedState) ||
              (isMandalField(field) && (!selectedState || !selectedDistrict));
            return (
              <div key={field._id || field.fieldName} className={gridItemClass}>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={String(fieldValue)}
                  onChange={(e) => onChange(field.fieldName, e.target.value)}
                  disabled={disabled}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:disabled:bg-slate-800"
                >
                  <option value="">
                    {isDistrictField(field) && !selectedState
                      ? 'Select state first'
                      : isMandalField(field) && (!selectedState || !selectedDistrict)
                        ? 'Select district first'
                        : `Select ${field.fieldLabel}`}
                  </option>
                  {dropdownOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {field.helpText ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{field.helpText}</p>
                ) : null}
              </div>
            );
          }

          if (isBatchField(field)) {
            // Match the Fee Structure section: current ± 3 years, newest first, with
            // out-of-window values appended so legacy data stays selectable.
            const currentValue = coerceBatchYear(fieldValue);
            const displayValue = currentValue || String(currentYear);
            const numericCurrent = Number(currentValue);
            const yearOptions =
              currentValue && Number.isFinite(numericCurrent) && !batchBaseYears.includes(numericCurrent)
                ? [...batchBaseYears, numericCurrent].sort((a, b) => b - a)
                : batchBaseYears;
            return (
              <div key={field._id || field.fieldName} className={gridItemClass}>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={displayValue}
                  onChange={(e) => onChange(field.fieldName, e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                      {year === currentYear ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  {field.helpText ||
                    'Admission batch (academic year). Defaults to the current year; pick any year in the ±3 window.'}
                </p>
              </div>
            );
          }

          if (isSchoolOrCollegeField(field)) {
            const labelSuffix = useSchoolsList ? 'School' : 'College';
            const disabled = !hasSelectedGroup || institutionsLoading;
            const datalistId = `joining-reg-${field.fieldName}-list`;
            return (
              <div key={field._id || field.fieldName} className={gridItemClass}>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                {!hasSelectedGroup ? (
                  <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">
                    Select a student group to choose an institution.
                  </p>
                ) : null}
                <Input
                  value={String(fieldValue)}
                  onChange={(e) => onChange(field.fieldName, e.target.value)}
                  list={datalistId}
                  placeholder={
                    !hasSelectedGroup
                      ? 'Select student group first'
                      : institutionsLoading
                        ? `Loading ${labelSuffix.toLowerCase()}s…`
                        : `Start typing to search ${labelSuffix.toLowerCase()}`
                  }
                  disabled={disabled}
                />
                <datalist id={datalistId}>
                  {activeInstitutions.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </div>
            );
          }

          if (field.fieldType === 'dropdown') {
            const btechYearPick =
              Boolean(isBtechJoining && isFixedAcademicYearField(field) && btechYearOptions?.length);
            const dropdownOptions = btechYearPick
              ? (btechYearOptions as Array<{ value: string; label: string }>)
              : isFixedAcademicYearField(field)
              ? [{ value: fixedRegistrationAcademicYear, label: fixedRegistrationAcademicYear }]
              : isFixedSemesterField(field)
              ? [{ value: fixedRegistrationSemester, label: fixedRegistrationSemester }]
              : normalizeFieldOptions(field.options);
            const forceDisabled =
              (isFixedAcademicYearField(field) || isFixedSemesterField(field)) && !btechYearPick;
            return (
              <div key={field._id || field.fieldName} className={gridItemClass}>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={
                    btechYearPick
                      ? String(fieldValue || fixedRegistrationAcademicYear)
                      : isFixedAcademicYearField(field)
                      ? fixedRegistrationAcademicYear
                      : isFixedSemesterField(field)
                      ? fixedRegistrationSemester
                      : String(fieldValue)
                  }
                  onChange={(e) => onChange(field.fieldName, e.target.value)}
                  disabled={forceDisabled}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:disabled:bg-slate-800"
                >
                  <option value="">Select {field.fieldLabel}</option>
                  {dropdownOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {field.helpText ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{field.helpText}</p>
                ) : null}
                {btechYearPick ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Current year → semester <span className="font-medium">1-1</span> (regular). Prior year →{' '}
                    <span className="font-medium">lateral entry</span> and semester <span className="font-medium">2-1</span>
                    ; remarks update automatically.
                  </p>
                ) : null}
                {forceDisabled ? (
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                    Fixed by admissions workflow configuration.
                  </p>
                ) : null}
              </div>
            );
          }

          if (field.fieldType === 'radio') {
            const radioOptions = normalizeFieldOptions(field.options);
            const radioSpanClass =
              joiningStudentProfileFieldRank(field) >= 40 &&
              joiningStudentProfileFieldRank(field) < JOINING_PREVIOUS_COLLEGE_CONTACT_ROW_RANK
                ? gridItemClass
                : 'md:col-span-3';
            return (
              <div key={field._id || field.fieldName} className={radioSpanClass}>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                <div className="mt-2 space-y-2">
                  {radioOptions.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={field.fieldName}
                        value={option.value}
                        checked={String(fieldValue) === option.value}
                        onChange={(e) => onChange(field.fieldName, e.target.value)}
                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          }

          if (field.fieldType === 'checkbox') {
            const checked = fieldValue === true || fieldValue === 'true';
            return (
              <div key={field._id || field.fieldName} className="md:col-span-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(field.fieldName, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-200">
                    {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                  </span>
                </label>
              </div>
            );
          }

          if (field.fieldType === 'textarea') {
            return (
              <div key={field._id || field.fieldName} className="md:col-span-3">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={String(fieldValue)}
                  onChange={(e) => onChange(field.fieldName, e.target.value)}
                  placeholder={field.placeholder || ''}
                  rows={4}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                />
              </div>
            );
          }

          if (field.fieldType === 'file' && isJoiningStudentPortraitUploadField(field)) {
            const fatherField = sorted.find((f) => isJoiningFatherPortraitFileField(f)) ?? null;
            const motherField = sorted.find((f) => isJoiningMotherPortraitFileField(f)) ?? null;
            const fatherKey = fatherField?.fieldName || 'father_photo';
            const motherKey = motherField?.fieldName || 'mother_photo';
            const fatherLabel = (fatherField?.fieldLabel || '').trim() || 'Father photo';
            const motherLabel = (motherField?.fieldLabel || '').trim() || 'Mother photo';

            return (
              <div key={field._id || field.fieldName} className="md:col-span-3">
                <div className="rounded-2xl border-2 border-dashed border-blue-300 bg-gradient-to-br from-blue-50/90 to-indigo-50/60 p-6 shadow-sm dark:border-blue-600/70 dark:from-slate-900/80 dark:to-slate-900/40">
                  <p className="mb-1 text-center text-sm font-semibold text-gray-900 dark:text-slate-100 sm:text-left">
                    Applicant & parent photos
                  </p>
                  <p className="mb-4 text-center text-xs text-gray-600 dark:text-slate-400 sm:text-left">
                    Student, father, and mother photos are all optional. <strong>Take photo</strong> opens the live
                    camera — choose <strong>Front</strong> or <strong>Rear</strong> for any photo. <strong>Upload</strong>{' '}
                    picks from your gallery. Files use the student prefix <span className="font-mono">{photoBaseSlug}</span>.
                  </p>
                  <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:justify-between md:gap-4">
                    <RegistrationPortraitSlot
                      label={field.fieldLabel || 'Student photo'}
                      helpText="Passport-style image, optional — camera or gallery."
                      fieldName={field.fieldName}
                      fieldLabelForFile={field.fieldLabel || 'Student photo'}
                      value={fieldValue}
                      onChange={onChange}
                      photoBaseSlug={photoBaseSlug}
                      subjectDisplayName={subjectDisplayName}
                    />
                    <RegistrationPortraitSlot
                      label={fatherLabel}
                      helpText="Optional — camera or gallery."
                      fieldName={fatherKey}
                      fieldLabelForFile={fatherLabel}
                      value={getValue(fatherKey)}
                      onChange={onChange}
                      photoBaseSlug={photoBaseSlug}
                      subjectDisplayName={subjectDisplayName}
                    />
                    <RegistrationPortraitSlot
                      label={motherLabel}
                      helpText="Optional — camera or gallery."
                      fieldName={motherKey}
                      fieldLabelForFile={motherLabel}
                      value={getValue(motherKey)}
                      onChange={onChange}
                      photoBaseSlug={photoBaseSlug}
                      subjectDisplayName={subjectDisplayName}
                    />
                  </div>
                  {field.helpText ? (
                    <p className="mt-3 text-center text-xs text-gray-500 dark:text-slate-500 sm:text-left">{field.helpText}</p>
                  ) : null}
                </div>
              </div>
            );
          }

          if (field.fieldType === 'file') {
            const galId = `joining-reg-file-gal-${field.fieldName}`;
            const onGalleryPick: ChangeEventHandler<HTMLInputElement> = (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              readImageFileToFormValue(file, field.fieldName, onChange, {
                photoBaseSlug,
                fieldLabel: field.fieldLabel || field.fieldName,
                fieldName: field.fieldName,
                source: 'gallery',
              });
            };
            return (
              <div key={field._id || field.fieldName} className="md:col-span-3">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">
                  Images only — <strong>Take photo</strong> opens the live camera (front or rear); <strong>Upload</strong>{' '}
                  picks from your gallery or files. New photos use the student file prefix{' '}
                  <span className="font-mono">{photoBaseSlug}</span>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <JoiningCameraCaptureButton
                    aria-label={`Take photo for ${field.fieldLabel} — ${subjectDisplayName}`}
                    buttonClassName="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    onCapture={(file) =>
                      readImageFileToFormValue(file, field.fieldName, onChange, {
                        photoBaseSlug,
                        fieldLabel: field.fieldLabel || field.fieldName,
                        fieldName: field.fieldName,
                        source: 'camera',
                      })
                    }
                  >
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                    Take photo
                  </JoiningCameraCaptureButton>
                  <input
                    id={galId}
                    name={`joining_registration_file_${field.fieldName}_gallery`}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label={`Upload file for ${field.fieldLabel} — ${subjectDisplayName}`}
                    onChange={onGalleryPick}
                  />
                  <label
                    htmlFor={galId}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                    Upload
                  </label>
                </div>
                {field.helpText ? (
                  <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{field.helpText}</p>
                ) : null}
              </div>
            );
          }

          const inputType =
            field.fieldType === 'date'
              ? 'date'
              : field.fieldType === 'number'
                ? 'number'
                : field.fieldType === 'email'
                  ? 'email'
                  : field.fieldType === 'tel'
                    ? 'tel'
                    : 'text';

          return (
            <div key={field._id || field.fieldName} className={gridItemClass}>
              <Input
                label={`${field.fieldLabel}${isFieldRequired ? ' *' : ''}`}
                name={field.fieldName}
                type={inputType as 'text' | 'email' | 'tel' | 'number' | 'date'}
                value={String(fieldValue)}
                onChange={(e) => onChange(field.fieldName, e.target.value)}
                placeholder={field.placeholder || ''}
              />
              {field.helpText ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{field.helpText}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
