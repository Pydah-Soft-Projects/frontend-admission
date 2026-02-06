'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { leadAPI, utmAPI, formBuilderAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useLocations } from '@/lib/useLocations';
import { useInstitutions } from '@/lib/useInstitutions';

export default function LeadFormPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [dynamicFormData, setDynamicFormData] = useState<Record<string, any>>({});
  
  // Capture UTM parameters from URL
  const [utmParams, setUtmParams] = useState({
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_term: '',
    utm_content: '',
  });

  // Extract UTM parameters and form_id from URL on mount and track click if needed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      setUtmParams({
        utm_source: urlParams.get('utm_source') || '',
        utm_medium: urlParams.get('utm_medium') || '',
        utm_campaign: urlParams.get('utm_campaign') || '',
        utm_term: urlParams.get('utm_term') || '',
        utm_content: urlParams.get('utm_content') || '',
      });

      // Check for form_id in URL parameters (from short URL redirect)
      const formIdFromUrl = urlParams.get('form_id');
      if (formIdFromUrl) {
        setFormId(formIdFromUrl);
      }

      // Track click if redirect=false or redirect parameter is missing (long URL direct click)
      const redirectParam = urlParams.get('redirect');
      if (redirectParam !== 'true' && !formIdFromUrl) {
        // This is a long URL click - track it and get form_id
        utmAPI.trackClick(window.location.href)
          .then((response: any) => {
            // Response structure from backend: { success: true, data: { tracked: true, formId: ... }, message: ... }
            // trackClick returns response.data from axios, so response is { success: true, data: {...}, message: ... }
            const formIdFromResponse = response?.data?.formId || null;
            if (formIdFromResponse) {
              setFormId(formIdFromResponse);
            }
          })
          .catch((err: any) => {
            // Silently fail - tracking is not critical
          });
      }
    }
  }, []);

  // No static form data - only dynamic fields

  // Fetch form definition if formId is available
  const { data: formDataResponse, isLoading: isLoadingForm, error: formError } = useQuery({
    queryKey: ['form-builder', 'form', formId],
    queryFn: async () => {
      if (!formId) return null;
      try {
        // Use public endpoint for lead form
        const response = await formBuilderAPI.getForm(formId, { includeFields: true, showInactive: false, public: true });
        return response;
      } catch (error) {
        return null;
      }
    },
    enabled: !!formId,
  });

  const dynamicForm = useMemo(() => {
    if (!formDataResponse) return null;
    // Response structure: { success: true, data: { id, name, fields: [...] }, message: ... }
    const formData = formDataResponse?.data || formDataResponse;
    return formData;
  }, [formDataResponse]);

  const sortedFormFields = useMemo(() => {
    if (!dynamicForm?.fields) {
      return [];
    }
    const fields = Array.isArray(dynamicForm.fields) ? dynamicForm.fields : [];
    const sorted = [...fields].sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return sorted;
  }, [dynamicForm]);


  // Support both state/district/mandal and address_state/address_district/address_mandal (default student form)
  const selectedState = dynamicFormData.state ?? dynamicFormData.address_state ?? '';
  const selectedDistrict = dynamicFormData.district ?? dynamicFormData.address_district ?? '';

  const { stateNames, districtNames, mandalNames } = useLocations({
    stateName: selectedState || undefined,
    districtName: selectedDistrict || undefined,
  });
  const availableDistricts = districtNames;
  const availableMandals = mandalNames;

  const {
    schools,
    colleges,
    isLoading: institutionsLoading,
  } = useInstitutions();

  const studentGroup = (dynamicFormData.student_group ?? dynamicFormData.studentGroup ?? '') as string;
  const normalizedStudentGroup = studentGroup?.toLowerCase().trim();
  const useSchoolsList = normalizedStudentGroup === '10th';
  const hasSelectedGroup = Boolean(normalizedStudentGroup);
  const activeInstitutions = useSchoolsList ? schools : colleges;

  const handleDynamicFieldChange = (fieldName: string, value: any) => {
    setDynamicFormData((prev) => {
      const newData = { ...prev, [fieldName]: value };
      const key = fieldName.toLowerCase();
      if (key === 'state' || key === 'address_state') {
        delete newData.district;
        delete newData.address_district;
        delete newData.mandal;
        delete newData.address_mandal;
      } else if (key === 'district' || key === 'address_district') {
        delete newData.mandal;
        delete newData.address_mandal;
      } else if (key === 'student_group' || key === 'studentgroup') {
        delete newData.school_or_college_name;
      }
      return newData;
    });
    setError(null);
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
  const isSchoolOrCollegeField = (field: any) =>
    (field.fieldName || '').toLowerCase() === 'school_or_college_name';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Validate required dynamic form fields
    if (sortedFormFields.length > 0) {
      const missingFields: string[] = [];
      const dataCollectionType = dynamicFormData.data_collection_type ?? '';
      const isStaffNameRequired = dataCollectionType === 'Direct' || dataCollectionType === 'Exam Center';

      sortedFormFields.forEach((field: any) => {
        const value = dynamicFormData[field.fieldName];
        const isEmpty = value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '');
        if (field.isRequired && isEmpty) {
          missingFields.push(field.fieldLabel);
        }
      });
      // Staff name is required when Data Collection Type is Direct or Exam Center
      if (isStaffNameRequired) {
        const staffName = dynamicFormData.staff_name;
        const staffNameEmpty = staffName === undefined || staffName === null || staffName === '' || (typeof staffName === 'string' && staffName.trim() === '');
        if (staffNameEmpty) {
          missingFields.push('Staff Name');
        }
      }
      if (missingFields.length > 0) {
        setError(`Please fill in required fields: ${missingFields.join(', ')}`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      // Build dynamic fields object for submission
      const dynamicFields: Record<string, any> = {};
      sortedFormFields.forEach((field: any) => {
        const value = dynamicFormData[field.fieldName];
        if (value !== undefined && value !== null && value !== '') {
          dynamicFields[field.fieldName] = value;
        }
      });

      // Extract common field names from dynamic fields (case-insensitive matching)
      const getFieldValue = (fieldNames: string[]) => {
        for (const fieldName of fieldNames) {
          const key = Object.keys(dynamicFields).find(
            k => k.toLowerCase() === fieldName.toLowerCase()
          );
          if (key && dynamicFields[key]) return dynamicFields[key];
        }
        return '';
      };

      // Submit with dynamic fields mapped to expected backend fields
      await leadAPI.submitPublicLead({
        name: getFieldValue(['name', 'fullName', 'studentName']) || '',
        phone: getFieldValue(['phone', 'phoneNumber', 'mobile', 'contactNumber']) || '',
        email: getFieldValue(['email', 'emailAddress']) || undefined,
        fatherName: getFieldValue(['fatherName', 'father_name', 'fathersName']) || '',
        fatherPhone: getFieldValue(['fatherPhone', 'father_phone', 'fathersPhone', 'fatherPhoneNumber']) || '',
        motherName: getFieldValue(['motherName', 'mother_name', 'mothersName']) || undefined,
        gender: getFieldValue(['gender']) || undefined,
        courseInterested: getFieldValue(['courseInterested', 'course', 'courseName']) || undefined,
        interCollege: getFieldValue(['interCollege', 'college', 'collegeName']) || undefined,
        rank: getFieldValue(['rank']) ? Number(getFieldValue(['rank'])) : undefined,
        village: getFieldValue(['village', 'city', 'town', 'address_village_city']) || '',
        state: getFieldValue(['state']) || '',
        district: getFieldValue(['district']) || '',
        mandal: getFieldValue(['mandal', 'tehsil']) || '',
        isNRI: getFieldValue(['isNRI', 'nri']) === true || getFieldValue(['isNRI', 'nri']) === 'true' || false,
        quota: 'Not Applicable',
        applicationStatus: 'Not Provided',
        source: 'Public Form',
        utmSource: utmParams.utm_source || undefined,
        utmMedium: utmParams.utm_medium || undefined,
        utmCampaign: utmParams.utm_campaign || undefined,
        utmTerm: utmParams.utm_term || undefined,
        utmContent: utmParams.utm_content || undefined,
        dynamicFields: Object.keys(dynamicFields).length > 0 ? dynamicFields : undefined,
      });

      // Show success message
      setShowSuccess(true);

      // Reset form after 2 seconds
      setTimeout(() => {
        setDynamicFormData({});
        setShowSuccess(false);
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* Background - solid warm light theme */}
      <div className="fixed inset-0 bg-gradient-to-br from-orange-50/40 via-amber-50/20 to-orange-50/30 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">Lead Submission Form</h1>
              <Link href="/">
                <Button variant="outline">Home</Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {showSuccess ? (
            <Card>
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
                <p className="text-gray-600 mb-6">
                  Your lead information has been submitted successfully. We will get back to you soon.
                </p>
                <Link href="/">
                  <Button variant="primary">Go to Home</Button>
                </Link>
              </div>
            </Card>
          ) : (
            <Card>
              <form onSubmit={handleSubmit} className="space-y-6">
                <h2 className="text-xl font-semibold mb-6">Please fill in your details</h2>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                {/* Show message if no form is loaded */}
                {!formId && !isLoadingForm && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No form is associated with this URL.</p>
                    <p className="text-sm mt-2">Please use a valid UTM URL with a form selected.</p>
                  </div>
                )}

                {/* Dynamic Form Fields from Form Builder */}
                {isLoadingForm && formId && (
                  <div className="text-center py-8 text-sm text-gray-500">
                    Loading form fields...
                  </div>
                )}

                {formError && (
                  <div className="text-center py-8 text-sm text-red-500">
                    Error loading form. Please try again.
                  </div>
                )}

                {sortedFormFields.length > 0 && (
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-6">
                      {dynamicForm?.name || 'Please fill in your details'}
                    </h3>
                    {dynamicForm?.description && (
                      <p className="text-sm text-gray-600 mb-6">{dynamicForm.description}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {sortedFormFields.map((field: any) => {
                        const fieldValue = dynamicFormData[field.fieldName] || field.defaultValue || '';
                        const dataCollectionType = dynamicFormData.data_collection_type ?? '';
                        const isStaffNameRequired = dataCollectionType === 'Direct' || dataCollectionType === 'Exam Center';
                        const isFieldRequired = field.isRequired || (field.fieldName === 'staff_name' && isStaffNameRequired);

                        // Location dropdowns: state, district, mandal (or address_*) — render as dropdown regardless of fieldType
                        if (isLocationDropdownField(field)) {
                          let dropdownOptions: Array<{ value: string; label: string }> = [];
                          if (isStateField(field)) {
                            dropdownOptions = stateNames.map((state) => ({ value: state, label: state }));
                          } else if (isDistrictField(field)) {
                            dropdownOptions = availableDistricts.map((district) => ({ value: district, label: district }));
                          } else if (isMandalField(field)) {
                            dropdownOptions = availableMandals.map((mandal) => ({ value: mandal, label: mandal }));
                          }
                          const disabled =
                            (isDistrictField(field) && !selectedState) ||
                            (isMandalField(field) && (!selectedState || !selectedDistrict));
                          return (
                            <div key={field._id}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                              </label>
                              <select
                                value={fieldValue}
                                onChange={(e) => handleDynamicFieldChange(field.fieldName, e.target.value)}
                                required={isFieldRequired}
                                disabled={disabled}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                              >
                                <option value="">
                                  {isDistrictField(field) && !selectedState
                                    ? 'Select state first'
                                    : isMandalField(field) && (!selectedState || !selectedDistrict)
                                    ? 'Select district first'
                                    : `Select ${field.fieldLabel}`}
                                </option>
                                {dropdownOptions.map((option: any) => {
                                  const optionValue = typeof option === 'string' ? option : option.value;
                                  const optionLabel = typeof option === 'string' ? option : option.label;
                                  return (
                                    <option key={optionValue} value={optionValue}>
                                      {optionLabel}
                                    </option>
                                  );
                                })}
                              </select>
                              {field.helpText && (
                                <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                              )}
                            </div>
                          );
                        }

                        if (isSchoolOrCollegeField(field)) {
                          const labelSuffix = useSchoolsList ? 'School' : 'College';
                          const disabled = !hasSelectedGroup || institutionsLoading;
                          const datalistId = `${field.fieldName}-institutions`;
                          return (
                            <div key={field._id}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.fieldLabel}{' '}
                                {isFieldRequired && <span className="text-red-500">*</span>}
                              </label>
                              {!hasSelectedGroup && (
                                <p className="mb-2 text-xs text-gray-500">
                                  Select a student group to choose an institution.
                                </p>
                              )}
                              <Input
                                value={fieldValue}
                                onChange={(e) =>
                                  handleDynamicFieldChange(field.fieldName, e.target.value)
                                }
                                list={datalistId}
                                placeholder={
                                  !hasSelectedGroup
                                    ? 'Select student group first'
                                    : institutionsLoading
                                    ? `Loading ${labelSuffix.toLowerCase()}s...`
                                    : `Start typing to search ${labelSuffix.toLowerCase()}`
                                }
                                disabled={disabled}
                              />
                              <datalist id={datalistId}>
                                {activeInstitutions.map((item) => (
                                  <option key={item.id} value={item.name} />
                                ))}
                              </datalist>
                              {hasSelectedGroup && !institutionsLoading && activeInstitutions.length === 0 && (
                                <p className="mt-2 text-xs text-gray-500">
                                  No {labelSuffix.toLowerCase()} names available yet.
                                </p>
                              )}
                            </div>
                          );
                        }

                        // Other dropdowns (from field definition)
                        if (field.fieldType === 'dropdown') {
                          const dropdownOptions: Array<{ value: string; label: string }> = field.options || [];
                          return (
                            <div key={field._id}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                              </label>
                              <select
                                value={fieldValue}
                                onChange={(e) => handleDynamicFieldChange(field.fieldName, e.target.value)}
                                required={isFieldRequired}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                              >
                                <option value="">Select {field.fieldLabel}</option>
                                {dropdownOptions.map((option: any) => {
                                  const optionValue = typeof option === 'string' ? option : option.value;
                                  const optionLabel = typeof option === 'string' ? option : option.label;
                                  return (
                                    <option key={optionValue} value={optionValue}>
                                      {optionLabel}
                                    </option>
                                  );
                                })}
                              </select>
                              {field.helpText && (
                                <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                              )}
                            </div>
                          );
                        }

                        if (field.fieldType === 'radio') {
                          return (
                            <div key={field._id}>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                              </label>
                              <div className="space-y-2">
                                {field.options && field.options.length > 0 && field.options.map((option: any) => (
                                  <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                      type="radio"
                                      name={field.fieldName}
                                      value={option.value}
                                      checked={fieldValue === option.value}
                                      onChange={(e) => handleDynamicFieldChange(field.fieldName, e.target.value)}
                                      required={isFieldRequired}
                                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">{option.label}</span>
                                  </label>
                                ))}
                              </div>
                              {field.helpText && (
                                <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                              )}
                            </div>
                          );
                        }

                        if (field.fieldType === 'checkbox') {
                          return (
                            <div key={field._id} className="md:col-span-2">
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={fieldValue === true || fieldValue === 'true'}
                                  onChange={(e) => handleDynamicFieldChange(field.fieldName, e.target.checked)}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                />
                                <span className="text-sm font-medium text-gray-700">
                                  {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                                </span>
                              </label>
                              {field.helpText && (
                                <p className="text-xs text-gray-500 mt-1 ml-6">{field.helpText}</p>
                              )}
                            </div>
                          );
                        }

                        if (field.fieldType === 'textarea') {
                          return (
                            <div key={field._id} className="md:col-span-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
                              </label>
                              <textarea
                                value={fieldValue}
                                onChange={(e) => handleDynamicFieldChange(field.fieldName, e.target.value)}
                                placeholder={field.placeholder || ''}
                                required={isFieldRequired}
                                rows={4}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
                              />
                              {field.helpText && (
                                <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                              )}
                            </div>
                          );
                        }

                        if (field.fieldType === 'file') {
                          return (
                            <div key={field._id} className="md:col-span-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.fieldLabel} {isFieldRequired && <span className="text-red-500">*</span>}
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
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
                              />
                              {field.helpText && (
                                <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                              )}
                            </div>
                          );
                        }

                        // Default: text, number, email, tel, date
                        return (
                          <div key={field._id}>
                            <Input
                              label={`${field.fieldLabel} ${isFieldRequired ? '*' : ''}`}
                              name={field.fieldName}
                              type={field.fieldType === 'date' ? 'date' : field.fieldType === 'number' ? 'number' : field.fieldType === 'email' ? 'email' : field.fieldType === 'tel' ? 'tel' : 'text'}
                              value={fieldValue}
                              onChange={(e) => handleDynamicFieldChange(field.fieldName, e.target.value)}
                              placeholder={field.placeholder || ''}
                              required={isFieldRequired}
                            />
                            {field.helpText && (
                              <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                  </Button>
                  <Link href="/" className="flex-1">
                    <Button type="button" variant="outline" className="w-full">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </form>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}

