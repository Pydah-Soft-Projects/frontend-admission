'use client';

import { useMemo } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { useLocations } from '@/lib/useLocations';
import { useInstitutions } from '@/lib/useInstitutions';
import { isJoiningRegistrationCertificationStatusField } from '@/lib/joiningRegistrationFieldFilter';

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

function normKey(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isFixedAcademicYearField(field: RegistrationFormField): boolean {
  const n = normKey(field.fieldName || '');
  return n === 'academic_year' || n === 'academicyear' || n === 'current_year' || n === 'currentyear';
}

function isFixedSemesterField(field: RegistrationFormField): boolean {
  const n = normKey(field.fieldName || '');
  return n === 'current_semester' || n === 'currentsemester' || n === 'semester' || n === 'semister';
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.trim());
}

/** Student/applicant portrait — not parent docs or generic certificates. */
function isStudentPhotoUploadField(field: RegistrationFormField): boolean {
  if (field.fieldType !== 'file') return false;
  const name = normKey(field.fieldName);
  const label = normKey(field.fieldLabel);
  if (
    name.includes('father') ||
    name.includes('mother') ||
    name.includes('parent') ||
    name.includes('guardian') ||
    label.includes('father') ||
    label.includes('mother') ||
    label.includes('parent') ||
    label.includes('guardian')
  ) {
    return false;
  }
  const hay = `${name} ${label}`;
  if (hay.includes('aadhaar') || hay.includes('marksheet') || hay.includes('certificate')) return false;
  if (name.includes('student_photo') || name.includes('studentphoto')) return true;
  if (hay.includes('student') && (hay.includes('photo') || hay.includes('picture') || hay.includes('image'))) {
    return true;
  }
  if (hay.includes('applicant') && (hay.includes('photo') || hay.includes('picture'))) return true;
  if (hay.includes('passport') && hay.includes('photo')) return true;
  if (hay.includes('profile') && hay.includes('photo')) return true;
  return false;
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
};

export function JoiningDynamicRegistrationFields({
  formTitle,
  formDescription,
  fields,
  getValue,
  onChange,
  selectedState,
  selectedDistrict,
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

  const sorted = useMemo(() => {
    return [...fields].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [fields]);

  if (sorted.length === 0) return null;

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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sorted.map((field) => {
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
              <div key={field._id || field.fieldName} className="md:col-span-2">
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
              <div key={field._id || field.fieldName}>
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

          if (isSchoolOrCollegeField(field)) {
            const labelSuffix = useSchoolsList ? 'School' : 'College';
            const disabled = !hasSelectedGroup || institutionsLoading;
            const datalistId = `joining-reg-${field.fieldName}-list`;
            return (
              <div key={field._id || field.fieldName}>
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
            const dropdownOptions = isFixedAcademicYearField(field)
              ? [{ value: '2026', label: '2026' }]
              : isFixedSemesterField(field)
              ? [{ value: '1-1', label: '1-1' }]
              : normalizeFieldOptions(field.options);
            const forceDisabled = isFixedAcademicYearField(field) || isFixedSemesterField(field);
            return (
              <div key={field._id || field.fieldName}>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={
                    isFixedAcademicYearField(field)
                      ? '2026'
                      : isFixedSemesterField(field)
                      ? '1-1'
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
            return (
              <div key={field._id || field.fieldName} className="md:col-span-2">
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
              <div key={field._id || field.fieldName} className="md:col-span-2">
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
              <div key={field._id || field.fieldName} className="md:col-span-2">
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

          if (field.fieldType === 'file' && isStudentPhotoUploadField(field)) {
            const fileLabel = String(fieldValue || '').trim();
            const hasPreview = isImageDataUrl(fieldValue);
            const inputId = `joining-reg-photo-${field.fieldName}`;
            return (
              <div key={field._id || field.fieldName} className="md:col-span-2">
                <div className="rounded-2xl border-2 border-dashed border-blue-300 bg-gradient-to-br from-blue-50/90 to-indigo-50/60 p-6 shadow-sm dark:border-blue-600/70 dark:from-slate-900/80 dark:to-slate-900/40">
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 border-white bg-white/90 shadow-inner dark:border-slate-600 dark:bg-slate-800/90">
                      {hasPreview ? (
                        <img
                          src={String(fieldValue)}
                          alt={field.fieldLabel || 'Student photo'}
                          className="h-full w-full rounded-xl object-cover"
                        />
                      ) : fileLabel ? (
                        <span className="px-2 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          File selected
                        </span>
                      ) : (
                        <Camera className="h-10 w-10 text-blue-400 dark:text-blue-500" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                        {field.fieldLabel}
                        {isFieldRequired ? <span className="text-red-500"> *</span> : null}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">
                        Passport-style photo (JPG / PNG). Max one file; the file name is stored with the draft.
                      </p>
                      {fileLabel ? (
                        <p className="mt-2 truncate text-xs font-medium text-blue-800 dark:text-blue-300" title={fileLabel}>
                          {fileLabel}
                        </p>
                      ) : null}
                      {field.helpText ? (
                        <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">{field.helpText}</p>
                      ) : null}
                      <div className="mt-4">
                        <input
                          id={inputId}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const result = typeof reader.result === 'string' ? reader.result : '';
                              // Keep compatibility with secondary DB longtext photo storage.
                              onChange(field.fieldName, result || file.name);
                            };
                            reader.onerror = () => {
                              onChange(field.fieldName, file.name);
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        <label
                          htmlFor={inputId}
                          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                        >
                          <ImagePlus className="h-4 w-4 shrink-0" aria-hidden />
                          {fileLabel ? 'Change photo' : 'Choose photo'}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (field.fieldType === 'file') {
            return (
              <div key={field._id || field.fieldName} className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = typeof reader.result === 'string' ? reader.result : '';
                      onChange(field.fieldName, result || file.name);
                    };
                    reader.onerror = () => {
                      onChange(field.fieldName, file.name);
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="w-full text-sm text-gray-700 dark:text-slate-300"
                />
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
            <div key={field._id || field.fieldName}>
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
