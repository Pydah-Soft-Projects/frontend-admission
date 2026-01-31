'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formBuilderAPI, leadAPI } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showToast } from '@/lib/toast';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { LeadUploadData } from '@/types';
import { getAllDistricts as getAPDistricts, getMandalsByDistrict as getAPMandals } from '@/lib/andhra-pradesh-data';
import { getAllStates, getDistrictsByState, getMandalsByStateAndDistrict } from '@/lib/indian-states-data';

type LeadFormState = Required<
  Pick<
    LeadUploadData,
    | 'name'
    | 'phone'
    | 'email'
    | 'fatherName'
    | 'fatherPhone'
    | 'motherName'
    | 'hallTicketNumber'
    | 'village'
    | 'district'
    | 'mandal'
    | 'state'
    | 'quota'
    | 'courseInterested'
    | 'applicationStatus'
    | 'gender'
    | 'interCollege'
    | 'rank'
  >
>;

const initialFormState: LeadFormState = {
  name: '',
  phone: '',
  email: '',
  fatherName: '',
  fatherPhone: '',
  motherName: '',
  hallTicketNumber: '',
  village: '',
  district: '',
  mandal: '',
  state: 'Andhra Pradesh',
  quota: 'Not Applicable',
  courseInterested: '',
  applicationStatus: 'Not Provided',
  gender: 'Not Specified',
  interCollege: '',
  rank: '',
};

const requiredFields: Array<keyof LeadFormState> = [
  'name',
  'phone',
  'fatherName',
  'fatherPhone',
  'village',
  'district',
  'mandal',
];

const IndividualLeadPage = () => {
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [formState, setFormState] = useState<LeadFormState>(initialFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [dynamicFormData, setDynamicFormData] = useState<Record<string, any>>({});

  // Get districts from AP data (manual form uses AP only)
  const districts = useMemo(() => getAPDistricts(), []);

  // Get mandals based on selected district
  const mandals = useMemo(() => {
    if (!formState.district) return [];
    return getAPMandals(formState.district);
  }, [formState.district]);

  // -------- Dynamic Form Builder integration --------

  const {
    data: formsData,
    isLoading: isLoadingForms,
  } = useQuery({
    queryKey: ['form-builder', 'forms'],
    queryFn: async () => {
      const response = await formBuilderAPI.listForms({ showInactive: false, includeFieldCount: true });
      return response;
    },
  });

  const forms = useMemo(() => {
    const payload = (formsData as any)?.data ?? formsData;
    if (!payload) return [] as any[];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray((payload as any).data)) return (payload as any).data;
    return [] as any[];
  }, [formsData]);

  // Auto-select default form (if any) on first load
  useEffect(() => {
    if (!selectedFormId && forms.length > 0) {
      const defaultForm = forms.find((f: any) => f.isDefault) ?? forms[0];
      if (defaultForm) {
        setSelectedFormId(defaultForm.id || defaultForm._id);
      }
    }
  }, [forms, selectedFormId]);

  const {
    data: formDataResponse,
    isLoading: isLoadingForm,
  } = useQuery({
    queryKey: ['form-builder', 'form', selectedFormId],
    queryFn: async () => {
      if (!selectedFormId) return null;
      const response = await formBuilderAPI.getForm(selectedFormId, {
        includeFields: true,
        showInactive: false,
      });
      return response;
    },
    enabled: !!selectedFormId,
  });

  const dynamicForm = useMemo(() => {
    if (!formDataResponse) return null;
    const payload = (formDataResponse as any).data ?? formDataResponse;
    return payload || null;
  }, [formDataResponse]);

  const sortedFormFields = useMemo(() => {
    if (!dynamicForm?.fields) return [] as any[];
    const fields = Array.isArray(dynamicForm.fields) ? dynamicForm.fields : [];
    return [...fields].sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [dynamicForm]);

  // Support both state/district/mandal and address_state/address_district/address_mandal (default student form)
  const selectedState =
    dynamicFormData.state ??
    dynamicFormData.address_state ??
    '';
  const selectedDistrict =
    dynamicFormData.district ??
    dynamicFormData.address_district ??
    '';

  const availableDistricts = useMemo(() => {
    if (!selectedState) return [] as string[];
    if (selectedState.toLowerCase() === 'andhra pradesh') return getAPDistricts();
    return getDistrictsByState(selectedState);
  }, [selectedState]);

  const availableMandals = useMemo(() => {
    if (!selectedState || !selectedDistrict) return [] as string[];
    const mandalsFromStates = getMandalsByStateAndDistrict(selectedState, selectedDistrict);
    if (mandalsFromStates.length > 0) return mandalsFromStates;
    if (selectedState.toLowerCase() === 'andhra pradesh') {
      return getAPMandals(selectedDistrict);
    }
    return [];
  }, [selectedState, selectedDistrict]);

  const handleDynamicFieldChange = (fieldName: string, value: any) => {
    setDynamicFormData((prev) => {
      const next = { ...prev, [fieldName]: value };
      const key = fieldName.toLowerCase();
      // Clear dependent location fields when parent changes (state/district/mandal or address_*)
      if (key === 'state' || key === 'address_state') {
        delete (next as any).district;
        delete (next as any).address_district;
        delete (next as any).mandal;
        delete (next as any).address_mandal;
      } else if (key === 'district' || key === 'address_district') {
        delete (next as any).mandal;
        delete (next as any).address_mandal;
      }
      return next;
    });
    setErrors({});
  };

  const isStateField = (field: any) => {
    const n = (field.fieldName || '').toLowerCase();
    return n === 'state' || n === 'address_state';
  };
  const isDistrictField = (field: any) => {
    const n = (field.fieldName || '').toLowerCase();
    return n === 'district' || n === 'address_district';
  };
  const isMandalField = (field: any) => {
    const n = (field.fieldName || '').toLowerCase();
    return n === 'mandal' || n === 'address_mandal';
  };
  const isLocationDropdownField = (field: any) =>
    isStateField(field) || isDistrictField(field) || isMandalField(field);

  const isDynamicMode = !!(selectedFormId && sortedFormFields.length > 0);

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Individual Lead</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Capture a single prospect manually and slot them straight into your admissions workflow.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  const createLeadMutation = useMutation({
    mutationFn: async () => {
      // If a dynamic Form Builder template is selected, build the payload from dynamic fields
      if (isDynamicMode) {
        const dynamicFields: Record<string, any> = {};
        sortedFormFields.forEach((field: any) => {
          // Prefer user-entered value, otherwise fall back to field.defaultValue
          const rawValue =
            dynamicFormData[field.fieldName] !== undefined
              ? dynamicFormData[field.fieldName]
              : field.defaultValue;

          if (rawValue === undefined || rawValue === null) {
            return;
          }

          if (typeof rawValue === 'string') {
            if (!rawValue.trim()) return;
          }

          dynamicFields[field.fieldName] = rawValue;
        });

        const getFieldValue = (fieldNames: string[]) => {
          for (const fieldName of fieldNames) {
            const key = Object.keys(dynamicFields).find(
              (k) => k.toLowerCase() === fieldName.toLowerCase()
            );
            if (key && dynamicFields[key]) return dynamicFields[key];
          }
          return '';
        };

        const rankRaw = getFieldValue(['rank']);
        const rankValue =
          rankRaw && !Number.isNaN(Number(rankRaw)) ? Number(rankRaw) : undefined;

        const payload = {
          name: getFieldValue(['name', 'fullName', 'studentName', 'student_name']) || '',
          phone: getFieldValue(['phone', 'phoneNumber', 'mobile', 'contactNumber', 'student_phone']) || '',
          email: getFieldValue(['email', 'emailAddress', 'student_email']) || undefined,
          fatherName: getFieldValue(['fatherName', 'father_name', 'fathersName']) || '',
          fatherPhone:
            getFieldValue(['fatherPhone', 'father_phone', 'fathersPhone', 'fatherPhoneNumber']) ||
            '',
          motherName: getFieldValue(['motherName', 'mother_name', 'mothersName']) || undefined,
          gender: getFieldValue(['gender', 'student_gender']) || 'Not Specified',
          courseInterested:
            getFieldValue(['courseInterested', 'course', 'courseName']) || undefined,
          interCollege:
            getFieldValue(['interCollege', 'college', 'collegeName']) || undefined,
          rank: rankValue,
          village: getFieldValue(['village', 'city', 'town', 'address_village_city']) || '',
          state: getFieldValue(['state', 'address_state']) || '',
          district: getFieldValue(['district', 'address_district']) || '',
          mandal: getFieldValue(['mandal', 'tehsil', 'address_mandal']) || '',
          quota: 'Not Applicable',
          applicationStatus: 'Not Provided',
          source: 'Manual Form',
          dynamicFields: Object.keys(dynamicFields).length > 0 ? dynamicFields : undefined,
        };

        return leadAPI.create(payload);
      }

      // Fallback: existing static manual form
      const rankInput =
        typeof formState.rank === 'number'
          ? String(formState.rank)
          : formState.rank.trim();
      const rankValue =
        rankInput && !Number.isNaN(Number(rankInput)) ? Number(rankInput) : undefined;
      const payload = {
        ...formState,
        hallTicketNumber: formState.hallTicketNumber || undefined,
        email: formState.email || undefined,
        motherName: formState.motherName || undefined,
        courseInterested: formState.courseInterested || undefined,
        interCollege: formState.interCollege || undefined,
        rank: rankValue,
      };
      return leadAPI.create(payload);
    },
    onSuccess: (data: any) => {
      showToast.success('Lead created successfully');
      setFormState(initialFormState);
      setErrors({});
      const leadId = data?.data?._id || data?._id;
      if (leadId) {
        router.push(`/superadmin/leads/${leadId}`);
      } else {
        router.push('/superadmin/leads');
      }
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Unable to create lead');
    },
  });

  const validate = () => {
    // Dynamic mode: validate required dynamic fields from selected template
    if (isDynamicMode) {
      const nextErrors: Record<string, string> = {};
      const dataCollectionType = dynamicFormData.data_collection_type ?? '';
      const isStaffNameRequired = dataCollectionType === 'Direct' || dataCollectionType === 'Exam Center';

      sortedFormFields.forEach((field: any) => {
        if (!field.isRequired) return;
        const value =
          dynamicFormData[field.fieldName] !== undefined
            ? dynamicFormData[field.fieldName]
            : field.defaultValue;
        if (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && !value.trim())
        ) {
          nextErrors[field.fieldName] = 'Required';
        }
      });
      // Staff name is required when Data Collection Type is Direct or Exam Center
      if (isStaffNameRequired) {
        const staffName = dynamicFormData.staff_name;
        const staffNameEmpty =
          staffName === undefined ||
          staffName === null ||
          staffName === '' ||
          (typeof staffName === 'string' && !staffName.trim());
        if (staffNameEmpty) {
          nextErrors.staff_name = 'Required when Data Collection Type is Direct or Exam Center';
        }
      }
      setErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
    }

    const nextErrors: Record<string, string> = {};
    requiredFields.forEach((field) => {
      const value = formState[field];
      if (typeof value === 'string') {
        if (!value.trim()) {
          nextErrors[field] = 'Required';
        }
      } else if (value === undefined || value === null) {
        nextErrors[field] = 'Required';
      }
    });
    if (formState.phone && formState.phone.length < 10) {
      nextErrors.phone = 'Enter a valid phone number';
    }
    if (formState.fatherPhone && formState.fatherPhone.length < 10) {
      nextErrors.fatherPhone = 'Enter a valid phone number';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleChange =
    (field: keyof LeadFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { value } = event.target;
      setFormState((prev) => {
        const newState = { ...prev, [field]: value };
        // Reset mandal if district is changed
        if (field === 'district') {
          newState.mandal = '';
        }
        return newState;
      });
    };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    createLeadMutation.mutate();
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Card className="p-6 shadow-lg shadow-blue-100/40 dark:shadow-none">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Form Builder template selector */}
          <div className="grid gap-4 md:grid-cols-2 md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Form Template
              </label>
              <select
                value={selectedFormId || ''}
                onChange={(e) => setSelectedFormId(e.target.value || null)}
                className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
              >
                <option value="">Manual form (no template)</option>
                {forms.map((form: any) => (
                  <option key={form.id || form._id} value={form.id || form._id}>
                    {form.name}
                    {form.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
              {isLoadingForms && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Loading forms…
                </p>
              )}
            </div>
          </div>

          {/* When a template is selected, render dynamic fields from Form Builder.
              Otherwise fall back to the original manual form. */}
          {isDynamicMode ? (
            <>
              {isLoadingForm && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Loading form fields…
                </p>
              )}
              {!isLoadingForm && dynamicForm && (
                <>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                      {dynamicForm.name}
                    </h2>
                    {dynamicForm.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {dynamicForm.description}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {sortedFormFields.map((field: any) => {
                      const fieldValue =
                        dynamicFormData[field.fieldName] ?? field.defaultValue ?? '';
                      const fieldError = errors[field.fieldName];
                      const dataCollectionType = dynamicFormData.data_collection_type ?? '';
                      const isStaffNameRequired = dataCollectionType === 'Direct' || dataCollectionType === 'Exam Center';
                      const isFieldRequired = field.isRequired || (field.fieldName === 'staff_name' && isStaffNameRequired);

                      // Location dropdowns: state, district, mandal (or address_*) — render as dropdown regardless of fieldType
                      if (isLocationDropdownField(field)) {
                        let dropdownOptions: Array<{ value: string; label: string }> = [];
                        if (isStateField(field)) {
                          dropdownOptions = getAllStates().map((state) => ({
                            value: state,
                            label: state,
                          }));
                        } else if (isDistrictField(field)) {
                          dropdownOptions = availableDistricts.map((district) => ({
                            value: district,
                            label: district,
                          }));
                        } else if (isMandalField(field)) {
                          dropdownOptions = availableMandals.map((mandal) => ({
                            value: mandal,
                            label: mandal,
                          }));
                        }
                        const disabled =
                          (isDistrictField(field) && !selectedState) ||
                          (isMandalField(field) && (!selectedState || !selectedDistrict));
                        return (
                          <div key={field._id}>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                              {field.fieldLabel}{' '}
                              {isFieldRequired && <span className="text-red-500">*</span>}
                            </label>
                            <select
                              value={fieldValue}
                              onChange={(e) =>
                                handleDynamicFieldChange(field.fieldName, e.target.value)
                              }
                              required={isFieldRequired}
                              disabled={disabled}
                              className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                            >
                              <option value="">
                                {isDistrictField(field) && !selectedState
                                  ? 'Select state first'
                                  : isMandalField(field) && (!selectedState || !selectedDistrict)
                                  ? 'Select district first'
                                  : `Select ${field.fieldLabel}`}
                              </option>
                              {dropdownOptions.map((option: any) => {
                                const optionValue =
                                  typeof option === 'string' ? option : option.value;
                                const optionLabel =
                                  typeof option === 'string' ? option : option.label;
                                return (
                                  <option key={optionValue} value={optionValue}>
                                    {optionLabel}
                                  </option>
                                );
                              })}
                            </select>
                            {fieldError && (
                              <p className="mt-1 text-sm text-red-600">{fieldError}</p>
                            )}
                            {field.helpText && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {field.helpText}
                              </p>
                            )}
                          </div>
                        );
                      }

                      // Other dropdowns (from field definition)
                      if (field.fieldType === 'dropdown') {
                        const dropdownOptions: Array<{ value: string; label: string }> =
                          field.options || [];
                        return (
                          <div key={field._id}>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                              {field.fieldLabel}{' '}
                              {isFieldRequired && <span className="text-red-500">*</span>}
                            </label>
                            <select
                              value={fieldValue}
                              onChange={(e) =>
                                handleDynamicFieldChange(field.fieldName, e.target.value)
                              }
                              required={isFieldRequired}
                              className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                            >
                              <option value="">Select {field.fieldLabel}</option>
                              {dropdownOptions.map((option: any) => {
                                const optionValue =
                                  typeof option === 'string' ? option : option.value;
                                const optionLabel =
                                  typeof option === 'string' ? option : option.label;
                                return (
                                  <option key={optionValue} value={optionValue}>
                                    {optionLabel}
                                  </option>
                                );
                              })}
                            </select>
                            {fieldError && (
                              <p className="mt-1 text-sm text-red-600">{fieldError}</p>
                            )}
                            {field.helpText && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {field.helpText}
                              </p>
                            )}
                          </div>
                        );
                      }

                      if (field.fieldType === 'radio') {
                        return (
                          <div key={field._id}>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                              {field.fieldLabel}{' '}
                              {isFieldRequired && <span className="text-red-500">*</span>}
                            </label>
                            <div className="space-y-2">
                              {field.options &&
                                field.options.length > 0 &&
                                field.options.map((option: any) => (
                                  <label
                                    key={option.value}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <input
                                      type="radio"
                                      name={field.fieldName}
                                      value={option.value}
                                      checked={fieldValue === option.value}
                                      onChange={(e) =>
                                        handleDynamicFieldChange(
                                          field.fieldName,
                                          e.target.value
                                        )
                                      }
                                      required={isFieldRequired}
                                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-200">
                                      {option.label}
                                    </span>
                                  </label>
                                ))}
                            </div>
                            {fieldError && (
                              <p className="mt-1 text-sm text-red-600">{fieldError}</p>
                            )}
                            {field.helpText && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {field.helpText}
                              </p>
                            )}
                          </div>
                        );
                      }

                      if (field.fieldType === 'checkbox') {
                        return (
                          <div key={field._id} className="md:col-span-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={fieldValue === true || fieldValue === 'true'}
                                onChange={(e) =>
                                  handleDynamicFieldChange(
                                    field.fieldName,
                                    e.target.checked
                                  )
                                }
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
                              />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {field.fieldLabel}{' '}
                                {isFieldRequired && <span className="text-red-500">*</span>}
                              </span>
                            </label>
                            {fieldError && (
                              <p className="mt-1 text-sm text-red-600">{fieldError}</p>
                            )}
                            {field.helpText && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 ml-6">
                                {field.helpText}
                              </p>
                            )}
                          </div>
                        );
                      }

                      if (field.fieldType === 'textarea') {
                        return (
                          <div key={field._id} className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                              {field.fieldLabel}{' '}
                              {isFieldRequired && <span className="text-red-500">*</span>}
                            </label>
                            <textarea
                              value={fieldValue}
                              onChange={(e) =>
                                handleDynamicFieldChange(field.fieldName, e.target.value)
                              }
                              placeholder={field.placeholder || ''}
                              required={isFieldRequired}
                              rows={4}
                              className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                            />
                            {fieldError && (
                              <p className="mt-1 text-sm text-red-600">{fieldError}</p>
                            )}
                            {field.helpText && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {field.helpText}
                              </p>
                            )}
                          </div>
                        );
                      }

                      if (field.fieldType === 'file') {
                        return (
                          <div key={field._id} className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                              {field.fieldLabel}{' '}
                              {isFieldRequired && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleDynamicFieldChange(field.fieldName, file.name);
                                }
                              }}
                              required={isFieldRequired}
                              className="block w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                            />
                            {fieldError && (
                              <p className="mt-1 text-sm text-red-600">{fieldError}</p>
                            )}
                            {field.helpText && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {field.helpText}
                              </p>
                            )}
                          </div>
                        );
                      }

                      // Default single-line input
                      return (
                        <div key={field._id}>
                          <Input
                            label={`${field.fieldLabel}${isFieldRequired ? ' *' : ''}`}
                            name={field.fieldName}
                            type={
                              field.fieldType === 'date'
                                ? 'date'
                                : field.fieldType === 'number'
                                ? 'number'
                                : field.fieldType === 'email'
                                ? 'email'
                                : field.fieldType === 'tel'
                                ? 'tel'
                                : 'text'
                            }
                            value={fieldValue}
                            onChange={(e) =>
                              handleDynamicFieldChange(field.fieldName, e.target.value)
                            }
                            placeholder={field.placeholder || ''}
                            error={fieldError}
                          />
                          {field.helpText && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {field.helpText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <Input
                  label="Student Name *"
                  name="name"
                  value={formState.name}
                  onChange={handleChange('name')}
                  error={errors.name}
                  placeholder="Enter full name"
                />
                <Input
                  label="Primary Phone *"
                  name="phone"
                  value={formState.phone}
                  onChange={handleChange('phone')}
                  error={errors.phone}
                  placeholder="10 digit mobile number"
                />
                <Input
                  label="Email"
                  name="email"
                  type="email"
                  value={formState.email}
                  onChange={handleChange('email')}
                  placeholder="student@email.com"
                />
                <Input
                  label="Hall Ticket Number"
                  name="hallTicketNumber"
                  value={formState.hallTicketNumber}
                  onChange={handleChange('hallTicketNumber')}
                  placeholder="Optional"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Input
                  label="Father's Name *"
                  name="fatherName"
                  value={formState.fatherName}
                  onChange={handleChange('fatherName')}
                  error={errors.fatherName}
                />
                <Input
                  label="Father's Phone *"
                  name="fatherPhone"
                  value={formState.fatherPhone}
                  onChange={handleChange('fatherPhone')}
                  error={errors.fatherPhone}
                />
                <Input
                  label="Mother's Name"
                  name="motherName"
                  value={formState.motherName}
                  onChange={handleChange('motherName')}
                />
                <Input
                  label="Rank"
                  name="rank"
                  value={formState.rank}
                  onChange={handleChange('rank')}
                  placeholder="Rank (if available)"
                  inputMode="numeric"
                />
                <div>
                  <Input
                    label="Intermediate / Diploma College"
                    name="interCollege"
                    value={formState.interCollege}
                    onChange={handleChange('interCollege')}
                    placeholder="Where did the student study last?"
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Input
                  label="Village / City *"
                  name="village"
                  value={formState.village}
                  onChange={handleChange('village')}
                  error={errors.village}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    District *
                  </label>
                  <select
                    name="district"
                    value={formState.district}
                    onChange={handleChange('district')}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    <option value="">Select district</option>
                    {districts.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                  {errors.district && (
                    <p className="mt-1 text-sm text-red-600">{errors.district}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Mandal *
                  </label>
                  <select
                    name="mandal"
                    value={formState.mandal}
                    onChange={handleChange('mandal')}
                    disabled={!formState.district}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {formState.district ? 'Select mandal' : 'Select district first'}
                    </option>
                    {mandals.map((mandal) => (
                      <option key={mandal} value={mandal}>
                        {mandal}
                      </option>
                    ))}
                  </select>
                  {errors.mandal && (
                    <p className="mt-1 text-sm text-red-600">{errors.mandal}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    State *
                  </label>
                  <select
                    name="state"
                    value={formState.state}
                    onChange={handleChange('state')}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    <option value="Andhra Pradesh">Andhra Pradesh</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Quota *
                  </label>
                  <select
                    name="quota"
                    value={formState.quota}
                    onChange={handleChange('quota')}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    {['Not Applicable', 'Management', 'Convenor'].map((quota) => (
                      <option key={quota} value={quota}>
                        {quota}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Input
                    label="Programme Interest"
                    name="courseInterested"
                    value={formState.courseInterested}
                    onChange={handleChange('courseInterested')}
                    placeholder="Programme / Branch"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Gender
                  </label>
                  <select
                    name="gender"
                    value={formState.gender}
                    onChange={handleChange('gender')}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    {['Not Specified', 'Male', 'Female', 'Other'].map((gender) => (
                      <option key={gender} value={gender}>
                        {gender}
                      </option>
                    ))}
                  </select>  
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Application Status
                  </label>
                  <select
                    name="applicationStatus"
                    value={formState.applicationStatus}
                    onChange={handleChange('applicationStatus')}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    {['Not Provided', 'Submitted', 'Not Submitted'].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fields marked with * are mandatory. Ensure contact numbers are reachable before saving.
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormState(initialFormState);
                  setErrors({});
                }}
                disabled={createLeadMutation.isPending}
              >
                Reset
              </Button>
              <Button type="submit" variant="primary" disabled={createLeadMutation.isPending}>
                {createLeadMutation.isPending ? 'Saving…' : 'Create Lead'}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default IndividualLeadPage;
