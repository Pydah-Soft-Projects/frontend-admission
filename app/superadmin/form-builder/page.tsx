'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formBuilderAPI } from '@/lib/api';
import { showToast } from '@/lib/toast';
import { useDashboardHeader, useModulePermission } from '@/components/layout/DashboardShell';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { useLocations } from '@/lib/useLocations';

type FormField = {
  id: string;
  _id: string;
  formId: string;
  fieldName: string;
  fieldType: string;
  fieldLabel: string;
  placeholder?: string;
  isRequired: boolean;
  validationRules: Record<string, any>;
  displayOrder: number;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  helpText?: string;
  isActive: boolean;
};

type Form = {
  id: string;
  _id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  fields?: FormField[];
  fieldCount?: number;
};

type FieldFormState = {
  fieldName: string;
  fieldType: string;
  fieldLabel: string;
  placeholder: string;
  isRequired: boolean;
  validationRules: Record<string, any>;
  displayOrder: number;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
  helpText: string;
};

const emptyFieldForm: FieldFormState = {
  fieldName: '',
  fieldType: 'text',
  fieldLabel: '',
  placeholder: '',
  isRequired: false,
  validationRules: {},
  displayOrder: 0,
  options: [],
  defaultValue: '',
  helpText: '',
};

// Type for fields being created during form creation (before form is saved)
type DraftField = {
  id: string; // Temporary ID
  fieldName: string;
  fieldType: string;
  fieldLabel: string;
  placeholder?: string;
  isRequired: boolean;
  displayOrder: number;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  helpText?: string;
};

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'file', label: 'File Upload' },
];

// Helper function to convert string to snake_case
const toSnakeCase = (str: string): string => {
  return str
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2') // Insert underscore between lowercase and uppercase
    .replace(/[\s\-]+/g, '_') // Replace spaces and hyphens with underscores
    .replace(/[^a-zA-Z0-9_]/g, '') // Remove special characters
    .toLowerCase()
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
};

export default function FormBuilderPage() {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const router = useRouter();
  const { hasAccess: canAccessFormBuilder, canWrite: canEditForms } = useModulePermission('formBuilder');
  const [currentUser, setCurrentUser] = useState(auth.getUser());
  const canDeleteForms = canEditForms && currentUser?.roleName === 'Super Admin';

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isCreateFieldOpen, setIsCreateFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [newForm, setNewForm] = useState({ name: '', description: '' });
  const [fieldForm, setFieldForm] = useState<FieldFormState>(emptyFieldForm);
  
  // State for form creation modal with field management
  const [draftFields, setDraftFields] = useState<DraftField[]>([]);
  const [editingDraftField, setEditingDraftField] = useState<DraftField | null>(null);
  const [draftFieldForm, setDraftFieldForm] = useState<FieldFormState>(emptyFieldForm);
  const [includeAddress, setIncludeAddress] = useState(false);
  const [isCreatingForm, setIsCreatingForm] = useState(false);
  const [showAddFieldForm, setShowAddFieldForm] = useState(false);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverFieldIndex, setDragOverFieldIndex] = useState<number | null>(null);

  const { stateNames } = useLocations();
  const [draggedDraftFieldId, setDraggedDraftFieldId] = useState<string | null>(null);
  const [dragOverDraftIndex, setDragOverDraftIndex] = useState<number | null>(null);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Lead Form Builder</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Create and manage dynamic lead forms. Forms can be used in UTM Builder and lead capture.
        </p>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    setCurrentUser(auth.getUser());
  }, []);

  useEffect(() => {
    if (!canAccessFormBuilder) {
      router.replace('/superadmin/dashboard');
    }
  }, [canAccessFormBuilder, router]);

  const { data: formsData, isLoading: isLoadingForms, refetch: refetchForms } = useQuery({
    queryKey: ['form-builder', 'forms'],
    queryFn: async () => {
      const response = await formBuilderAPI.listForms({ showInactive: true, includeFieldCount: true });
      return response;
    },
  });

  const forms: Form[] = useMemo(() => {
    const payload = formsData?.data;
    if (Array.isArray(payload)) {
      return payload as Form[];
    }
    if (payload && Array.isArray((payload as any).data)) {
      return (payload as any).data as Form[];
    }
    return [];
  }, [formsData]);

  const { data: formData, isLoading: isLoadingForm, refetch: refetchForm } = useQuery({
    queryKey: ['form-builder', 'form', selectedFormId],
    queryFn: async () => {
      if (!selectedFormId) return null;
      const response = await formBuilderAPI.getForm(selectedFormId, { includeFields: true, showInactive: true });
      return response;
    },
    enabled: !!selectedFormId,
  });

  const selectedForm: Form | null = useMemo(() => {
    if (!formData?.data) return null;
    return formData.data as Form;
  }, [formData]);

  const sortedFields = useMemo(() => {
    if (!selectedForm?.fields) return [];
    return [...selectedForm.fields].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [selectedForm]);

  const createFormMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => formBuilderAPI.createForm(data),
    onSuccess: () => {
      showToast.success('Form created successfully');
      setNewForm({ name: '', description: '' });
      setIsCreateFormOpen(false);
      refetchForms();
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to create form');
    },
  });

  const updateFormMutation = useMutation({
    mutationFn: ({ formId, data }: { formId: string; data: any }) => formBuilderAPI.updateForm(formId, data),
    onSuccess: () => {
      showToast.success('Form updated successfully');
      refetchForms();
      if (selectedFormId) {
        refetchForm();
      }
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to update form');
    },
  });

  const deleteFormMutation = useMutation({
    mutationFn: (formId: string) => formBuilderAPI.deleteForm(formId),
    onSuccess: () => {
      showToast.success('Form deleted successfully');
      setSelectedFormId(null);
      refetchForms();
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to delete form');
    },
  });

  const createFieldMutation = useMutation({
    mutationFn: ({ formId, data }: { formId: string; data: any }) => formBuilderAPI.createField(formId, data),
    onSuccess: () => {
      showToast.success('Field created successfully');
      setFieldForm(emptyFieldForm);
      setIsCreateFieldOpen(false);
      if (selectedFormId) {
        refetchForm();
      }
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to create field');
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: any }) => formBuilderAPI.updateField(fieldId, data),
    onSuccess: () => {
      showToast.success('Field updated successfully');
      setEditingField(null);
      if (selectedFormId) {
        refetchForm();
      }
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to update field');
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) => formBuilderAPI.deleteField(fieldId),
    onSuccess: () => {
      showToast.success('Field deleted successfully');
      if (selectedFormId) {
        refetchForm();
      }
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to delete field');
    },
  });

  const reorderFieldsMutation = useMutation({
    mutationFn: ({ formId, fieldIds }: { formId: string; fieldIds: string[] }) =>
      formBuilderAPI.reorderFields(formId, fieldIds),
    onSuccess: () => {
      showToast.success('Fields reordered successfully');
      if (selectedFormId) {
        refetchForm();
      }
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to reorder fields');
    },
  });

  // Handle address toggle - auto-create address fields
  useEffect(() => {
    if (includeAddress) {
      // Check if address fields already exist
      const hasState = draftFields.some(f => f.fieldName.toLowerCase() === 'state');
      const hasDistrict = draftFields.some(f => f.fieldName.toLowerCase() === 'district');
      const hasMandal = draftFields.some(f => f.fieldName.toLowerCase() === 'mandal');
      const hasVillage = draftFields.some(f => f.fieldName.toLowerCase() === 'village');

      const maxOrder = draftFields.length > 0 ? Math.max(...draftFields.map(f => f.displayOrder)) : -1;
      let nextOrder = maxOrder + 1;

      if (!hasState) {
        const states = stateNames;
        setDraftFields(prev => [...prev, {
          id: `temp-state-${Date.now()}`,
          fieldName: 'state',
          fieldType: 'dropdown',
          fieldLabel: 'State',
          placeholder: 'Select state',
          isRequired: true,
          displayOrder: nextOrder++,
          options: states.map(s => ({ value: s, label: s })),
          helpText: 'Select your state',
        }]);
      }

      if (!hasDistrict) {
        // District dropdown will be populated dynamically based on state selection
        // We'll store a special marker in validationRules to indicate this is a dynamic field
        setDraftFields(prev => [...prev, {
          id: `temp-district-${Date.now()}`,
          fieldName: 'district',
          fieldType: 'dropdown',
          fieldLabel: 'District',
          placeholder: 'Select district',
          isRequired: true,
          displayOrder: nextOrder++,
          options: [],
          helpText: 'Select your district (options depend on selected state)',
        }]);
      }

      if (!hasMandal) {
        // Mandal dropdown will be populated dynamically based on district selection
        setDraftFields(prev => [...prev, {
          id: `temp-mandal-${Date.now()}`,
          fieldName: 'mandal',
          fieldType: 'dropdown',
          fieldLabel: 'Mandal',
          placeholder: 'Select mandal',
          isRequired: true,
          displayOrder: nextOrder++,
          options: [],
          helpText: 'Select your mandal (options depend on selected district)',
        }]);
      }

      if (!hasVillage) {
        setDraftFields(prev => [...prev, {
          id: `temp-village-${Date.now()}`,
          fieldName: 'village',
          fieldType: 'text',
          fieldLabel: 'Village',
          placeholder: 'Enter village name',
          isRequired: true,
          displayOrder: nextOrder++,
          options: [],
          helpText: 'Enter your village name',
        }]);
      }
    } else {
      // Remove address fields when toggle is off
      setDraftFields(prev => prev.filter(f => 
        !['state', 'district', 'mandal', 'village'].includes(f.fieldName.toLowerCase())
      ));
    }
  }, [includeAddress]);

  // Update district options when state changes
  useEffect(() => {
    const stateField = draftFields.find(f => f.fieldName.toLowerCase() === 'state');
    const districtField = draftFields.find(f => f.fieldName.toLowerCase() === 'district');
    const mandalField = draftFields.find(f => f.fieldName.toLowerCase() === 'mandal');

    if (stateField && districtField) {
      // This will be handled when form is rendered - we'll update dynamically
    }
  }, [draftFields]);

  const handleCreateForm = async () => {
    if (!canEditForms) {
      showToast.error('You do not have permission to create forms');
      return;
    }
    if (!newForm.name.trim()) {
      showToast.error('Form name is required');
      return;
    }

    setIsCreatingForm(true);
    try {
      // First create the form
      const formResponse = await formBuilderAPI.createForm({
        name: newForm.name.trim(),
        description: newForm.description?.trim() || undefined,
      });

      const createdForm = formResponse.data;
      const formId = createdForm.id || createdForm._id;

      if (!formId) {
        showToast.error('Failed to create form');
        setIsCreatingForm(false);
        return;
      }

      // Then create all draft fields
      const sortedDraftFields = [...draftFields].sort((a, b) => a.displayOrder - b.displayOrder);
      
      for (const draftField of sortedDraftFields) {
        await formBuilderAPI.createField(formId, {
          fieldName: draftField.fieldName,
          fieldType: draftField.fieldType,
          fieldLabel: draftField.fieldLabel,
          placeholder: draftField.placeholder || undefined,
          isRequired: draftField.isRequired,
          displayOrder: draftField.displayOrder,
          options: draftField.options,
          defaultValue: draftField.defaultValue || undefined,
          helpText: draftField.helpText || undefined,
        });
      }

      showToast.success('Form created successfully with all fields');
      setNewForm({ name: '', description: '' });
      setDraftFields([]);
      setIncludeAddress(false);
      setDraftFieldForm(emptyFieldForm);
      setEditingDraftField(null);
      setShowAddFieldForm(false);
      setIsCreateFormOpen(false);
      refetchForms();
      
      // Select the newly created form
      setSelectedFormId(formId);
    } catch (error: any) {
      showToast.error(error?.response?.data?.message || 'Failed to create form');
    } finally {
      setIsCreatingForm(false);
    }
  };

  const handleAddDraftField = () => {
    if (!draftFieldForm.fieldName.trim()) {
      showToast.error('Field name is required');
      return;
    }
    if (!draftFieldForm.fieldLabel.trim()) {
      showToast.error('Field label is required');
      return;
    }

    const maxOrder = draftFields.length > 0 ? Math.max(...draftFields.map(f => f.displayOrder)) : -1;

    if (editingDraftField) {
      // Update existing draft field
      setDraftFields(prev => prev.map(f => 
        f.id === editingDraftField.id
          ? {
              ...f,
              fieldName: draftFieldForm.fieldName.trim(),
              fieldType: draftFieldForm.fieldType,
              fieldLabel: draftFieldForm.fieldLabel.trim(),
              placeholder: draftFieldForm.placeholder || undefined,
              isRequired: draftFieldForm.isRequired,
              options: draftFieldForm.fieldType === 'dropdown' || draftFieldForm.fieldType === 'radio' 
                ? draftFieldForm.options 
                : [],
              defaultValue: draftFieldForm.defaultValue || undefined,
              helpText: draftFieldForm.helpText || undefined,
            }
          : f
      ));
      setEditingDraftField(null);
      setShowAddFieldForm(false);
    } else {
      // Add new draft field
      setDraftFields(prev => [...prev, {
        id: `temp-${Date.now()}-${Math.random()}`,
        fieldName: draftFieldForm.fieldName.trim(),
        fieldType: draftFieldForm.fieldType,
        fieldLabel: draftFieldForm.fieldLabel.trim(),
        placeholder: draftFieldForm.placeholder || undefined,
        isRequired: draftFieldForm.isRequired,
        displayOrder: maxOrder + 1,
        options: draftFieldForm.fieldType === 'dropdown' || draftFieldForm.fieldType === 'radio' 
          ? draftFieldForm.options 
          : [],
        defaultValue: draftFieldForm.defaultValue || undefined,
        helpText: draftFieldForm.helpText || undefined,
      }]);
      setShowAddFieldForm(false);
    }

    setDraftFieldForm(emptyFieldForm);
  };

  const handleEditDraftField = (field: DraftField) => {
    setEditingDraftField(field);
    setShowAddFieldForm(true);
    setDraftFieldForm({
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      fieldLabel: field.fieldLabel,
      placeholder: field.placeholder || '',
      isRequired: field.isRequired,
      validationRules: {},
      displayOrder: field.displayOrder,
      options: field.options || [],
      defaultValue: field.defaultValue || '',
      helpText: field.helpText || '',
    });
  };

  const handleDeleteDraftField = (fieldId: string) => {
    if (auth.getUser()?.roleName === 'Sub Super Admin') {
      showToast.error('You do not have permission to delete fields');
      return;
    }
    const field = draftFields.find(f => f.id === fieldId);
    if (field && ['state', 'district', 'mandal', 'village'].includes(field.fieldName.toLowerCase())) {
      setIncludeAddress(false);
    }
    setDraftFields(prev => prev.filter(f => f.id !== fieldId));
  };

  const handleMoveDraftField = (fieldId: string, direction: 'up' | 'down') => {
    const sorted = [...draftFields].sort((a, b) => a.displayOrder - b.displayOrder);
    const index = sorted.findIndex(f => f.id === fieldId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sorted.length) return;

    const newFields = [...sorted];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];

    // Update display orders
    newFields.forEach((f, i) => {
      f.displayOrder = i;
    });

    setDraftFields(newFields);
  };

  const sortedDraftFields = useMemo(() => {
    return [...draftFields].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [draftFields]);

  const handleDeleteForm = (form: Form) => {
    if (auth.getUser()?.roleName === 'Sub Super Admin') {
      showToast.error('You do not have permission to delete forms');
      return;
    }
    if (!canEditForms) {
      showToast.error('You do not have permission to delete forms');
      return;
    }
    if (form.isDefault) {
      showToast.error('Cannot delete default form');
      return;
    }
    const confirmed = window.confirm(`Delete form "${form.name}"? This action cannot be undone.`);
    if (!confirmed) return;
    deleteFormMutation.mutate(form._id);
  };

  const handleCreateField = () => {
    if (!canEditForms) {
      showToast.error('You do not have permission to create fields');
      return;
    }
    if (!selectedFormId) {
      showToast.error('Please select a form first');
      return;
    }
    if (!fieldForm.fieldName.trim()) {
      showToast.error('Field name is required');
      return;
    }
    if (!fieldForm.fieldLabel.trim()) {
      showToast.error('Field label is required');
      return;
    }

    const maxOrder = sortedFields.length > 0 ? Math.max(...sortedFields.map((f) => f.displayOrder)) : -1;

    createFieldMutation.mutate({
      formId: selectedFormId,
      data: {
        ...fieldForm,
        fieldName: fieldForm.fieldName.trim(),
        fieldLabel: fieldForm.fieldLabel.trim(),
        displayOrder: maxOrder + 1,
        options: fieldForm.fieldType === 'dropdown' || fieldForm.fieldType === 'radio' ? fieldForm.options : [],
      },
    });
  };

  const handleEditField = (field: FormField) => {
    if (!canEditForms) {
      showToast.error('You do not have permission to edit fields');
      return;
    }
    setEditingField(field);
    setFieldForm({
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      fieldLabel: field.fieldLabel,
      placeholder: field.placeholder || '',
      isRequired: field.isRequired,
      validationRules: field.validationRules || {},
      displayOrder: field.displayOrder,
      options: field.options || [],
      defaultValue: field.defaultValue || '',
      helpText: field.helpText || '',
    });
    setIsCreateFieldOpen(true);
  };

  const handleUpdateField = () => {
    if (!editingField) return;
    if (!fieldForm.fieldName.trim()) {
      showToast.error('Field name is required');
      return;
    }
    if (!fieldForm.fieldLabel.trim()) {
      showToast.error('Field label is required');
      return;
    }

    updateFieldMutation.mutate({
      fieldId: editingField._id,
      data: {
        ...fieldForm,
        fieldName: fieldForm.fieldName.trim(),
        fieldLabel: fieldForm.fieldLabel.trim(),
        options: fieldForm.fieldType === 'dropdown' || fieldForm.fieldType === 'radio' ? fieldForm.options : [],
      },
    });
  };

  const handleDeleteField = (field: FormField) => {
    if (auth.getUser()?.roleName === 'Sub Super Admin') {
      showToast.error('You do not have permission to delete fields');
      return;
    }
    if (!canEditForms) {
      showToast.error('You do not have permission to delete fields');
      return;
    }
    const confirmed = window.confirm(`Delete field "${field.fieldLabel}"?`);
    if (!confirmed) return;
    deleteFieldMutation.mutate(field._id);
  };

  const handleAddOption = () => {
    setFieldForm((prev) => ({
      ...prev,
      options: [...prev.options, { value: '', label: '' }],
    }));
  };

  const handleUpdateOption = (index: number, key: 'value' | 'label', value: string) => {
    setFieldForm((prev) => {
      const newOptions = [...prev.options];
      newOptions[index] = { ...newOptions[index], [key]: value };
      return { ...prev, options: newOptions };
    });
  };

  const handleRemoveOption = (index: number) => {
    setFieldForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const handleMoveField = (fieldId: string, direction: 'up' | 'down') => {
    if (!selectedFormId || !sortedFields.length) return;

    const currentIndex = sortedFields.findIndex((f) => f._id === fieldId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedFields.length) return;

    const newOrder = [...sortedFields];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];

    reorderFieldsMutation.mutate({
      formId: selectedFormId,
      fieldIds: newOrder.map((f) => f._id),
    });
  };

  const handleSavedFieldDragStart = (e: React.DragEvent, fieldId: string) => {
    setDraggedFieldId(fieldId);
    e.dataTransfer.setData('text/plain', fieldId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleSavedFieldDragEnd = () => {
    setDraggedFieldId(null);
    setDragOverFieldIndex(null);
  };
  const handleSavedFieldDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFieldIndex(index);
  };
  const handleSavedFieldDragLeave = () => setDragOverFieldIndex(null);
  const handleSavedFieldDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDraggedFieldId(null);
    setDragOverFieldIndex(null);
    const fieldId = e.dataTransfer.getData('text/plain');
    if (!selectedFormId || !fieldId) return;
    const dragIndex = sortedFields.findIndex((f) => f._id === fieldId);
    if (dragIndex === -1 || dragIndex === dropIndex) return;
    const newOrder = [...sortedFields];
    const [removed] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    reorderFieldsMutation.mutate({
      formId: selectedFormId,
      fieldIds: newOrder.map((f) => f._id),
    });
  };

  const handleDraftFieldDragStart = (e: React.DragEvent, fieldId: string) => {
    setDraggedDraftFieldId(fieldId);
    e.dataTransfer.setData('text/plain', fieldId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDraftFieldDragEnd = () => {
    setDraggedDraftFieldId(null);
    setDragOverDraftIndex(null);
  };
  const handleDraftFieldDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDraftIndex(index);
  };
  const handleDraftFieldDragLeave = () => setDragOverDraftIndex(null);
  const handleDraftFieldDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDraggedDraftFieldId(null);
    setDragOverDraftIndex(null);
    const fieldId = e.dataTransfer.getData('text/plain');
    if (!fieldId) return;
    const sorted = [...draftFields].sort((a, b) => a.displayOrder - b.displayOrder);
    const dragIndex = sorted.findIndex((f) => f.id === fieldId);
    if (dragIndex === -1 || dragIndex === dropIndex) return;
    const newOrder = [...sorted];
    const [removed] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    setDraftFields(
      newOrder.map((f, i) => ({ ...f, displayOrder: i }))
    );
  };

  if (!canAccessFormBuilder) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Forms</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select a form to manage its fields, or create a new form.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => refetchForms()} disabled={isLoadingForms}>
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!canEditForms) {
                showToast.error('You do not have permission to create forms');
                return;
              }
              setIsCreateFormOpen(true);
            }}
            disabled={!canEditForms}
          >
            Create Form
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Forms List */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {isLoadingForms ? (
              <div className="p-6 text-center text-sm text-slate-500">Loading forms...</div>
            ) : forms.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No forms found. Create your first form to get started.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {forms.map((form) => (
                  <div
                    key={form._id}
                    className={`p-4 cursor-pointer transition-colors ${
                      selectedFormId === form._id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => setSelectedFormId(form._id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {form.name}
                          </h3>
                          {form.isDefault && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full dark:bg-blue-900/30 dark:text-blue-300">
                              Default
                            </span>
                          )}
                        </div>
                        {form.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {form.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {form.fieldCount !== undefined ? form.fieldCount : form.fields?.length || 0} fields
                          </span>
                          {!form.isActive && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">Inactive</span>
                          )}
                        </div>
                      </div>
                      {canDeleteForms && !form.isDefault && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteForm(form);
                          }}
                          className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                          title="Delete form"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fields Management */}
        <div className="lg:col-span-2">
          {!selectedFormId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-slate-700 dark:bg-slate-900/30">
              <p className="text-slate-500 dark:text-slate-400">Select a form from the list to manage its fields</p>
            </div>
          ) : isLoadingForm ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-slate-500 dark:text-slate-400">Loading form fields...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {selectedForm?.name}
                    </h3>
                    {selectedForm?.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {selectedForm.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (!canEditForms) {
                        showToast.error('You do not have permission to create fields');
                        return;
                      }
                      setEditingField(null);
                      setFieldForm(emptyFieldForm);
                      setIsCreateFieldOpen(true);
                    }}
                    disabled={!canEditForms}
                  >
                    Add Field
                  </Button>
                </div>
                {canEditForms && sortedFields.length > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-2">Drag fields to change display order.</p>
                )}

                {sortedFields.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                    No fields yet. Add your first field to get started.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedFields.map((field, index) => (
                      <div
                        key={field._id}
                        draggable={canEditForms}
                        onDragStart={(e) => canEditForms && handleSavedFieldDragStart(e, field._id)}
                        onDragEnd={handleSavedFieldDragEnd}
                        onDragOver={(e) => canEditForms && handleSavedFieldDragOver(e, index)}
                        onDragLeave={handleSavedFieldDragLeave}
                        onDrop={(e) => canEditForms && handleSavedFieldDrop(e, index)}
                        className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                          draggedFieldId === field._id
                            ? 'opacity-50 border-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
                            : dragOverFieldIndex === index
                              ? 'border-blue-400 border-2 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50'
                        } ${canEditForms ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      >
                        {canEditForms && (
                          <div className="shrink-0 pt-0.5 text-slate-400" title="Drag to reorder" aria-hidden>
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {field.displayOrder + 1}.
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {field.fieldLabel}
                            </span>
                            {field.isRequired && (
                              <span className="text-xs text-red-500">*</span>
                            )}
                            <span className="px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-700 rounded dark:bg-slate-700 dark:text-slate-300">
                              {field.fieldType}
                            </span>
                            {!field.isActive && (
                              <span className="text-xs text-amber-600 dark:text-amber-400">Inactive</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {field.fieldName} {field.placeholder && `• ${field.placeholder}`}
                          </p>
                          {field.helpText && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{field.helpText}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMoveField(field._id, 'up')}
                            disabled={index === 0 || !canEditForms}
                            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleMoveField(field._id, 'down')}
                            disabled={index === sortedFields.length - 1 || !canEditForms}
                            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {canEditForms && (
                            <button
                              onClick={() => handleEditField(field)}
                              className="p-1 text-blue-500 hover:text-blue-700"
                              title="Edit field"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {canDeleteForms && (
                            <button
                              onClick={() => handleDeleteField(field)}
                              className="p-1 text-red-500 hover:text-red-700"
                              title="Delete field"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Form Modal with Split View */}
      {isCreateFormOpen && !editingField && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center px-4 py-8">
            <div className="w-full max-w-7xl rounded-3xl border border-white/60 bg-white/95 shadow-xl shadow-blue-100/30 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Form</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Create a new form with fields. Preview on the left, manage fields on the right.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateFormOpen(false);
                  setNewForm({ name: '', description: '' });
                  setDraftFields([]);
                  setIncludeAddress(false);
                  setDraftFieldForm(emptyFieldForm);
                  setEditingDraftField(null);
                  setShowAddFieldForm(false);
                }}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
              {/* Left Side - Preview */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Form Preview</h4>
                  <div className="rounded-xl border-2 border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {newForm.name || 'Form Name'}
                        </h3>
                        {newForm.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{newForm.description}</p>
                        )}
                      </div>
                      <div className="space-y-4 mt-6">
                        {sortedDraftFields.length === 0 ? (
                          <p className="text-sm text-slate-400 italic">No fields added yet. Add fields on the right.</p>
                        ) : (
                          sortedDraftFields.map((field) => (
                            <div key={field.id} className="space-y-1">
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                                {field.fieldLabel}
                                {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                              </label>
                              {field.fieldType === 'dropdown' && (
                                <select
                                  className="w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                  disabled
                                >
                                  <option>{field.placeholder || 'Select an option'}</option>
                                  {field.options.map((opt, idx) => (
                                    <option key={idx} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              )}
                              {field.fieldType === 'textarea' && (
                                <textarea
                                  className="w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                  placeholder={field.placeholder}
                                  disabled
                                  rows={3}
                                />
                              )}
                              {field.fieldType === 'checkbox' && (
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" disabled className="rounded border-gray-300" />
                                  <span className="text-sm text-slate-500">{field.placeholder || 'Check this option'}</span>
                                </div>
                              )}
                              {field.fieldType === 'radio' && (
                                <div className="space-y-2">
                                  {field.options.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                      <input type="radio" name={field.fieldName} disabled className="rounded border-gray-300" />
                                      <span className="text-sm text-slate-500">{opt.label}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {!['dropdown', 'textarea', 'checkbox', 'radio'].includes(field.fieldType) && (
                                <input
                                  type={field.fieldType}
                                  className="w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                  placeholder={field.placeholder}
                                  disabled
                                />
                              )}
                              {field.helpText && (
                                <p className="text-xs text-slate-400">{field.helpText}</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side - Form Details & Field Management */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Form Details</h4>
                  <div className="space-y-4">
                    <Input
                      label="Form Name *"
                      value={newForm.name}
                      onChange={(e) => setNewForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Student Details"
                    />
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                        Description
                      </label>
                      <textarea
                        value={newForm.description}
                        onChange={(e) => setNewForm((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="Optional description for this form"
                        className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 mb-1">
                        <input
                          type="checkbox"
                          checked={includeAddress}
                          onChange={(e) => setIncludeAddress(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          Include Address Fields (State, District, Mandal, Village)
                        </span>
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Automatically adds state, district, mandal, and village fields with proper dropdowns
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Fields</h4>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setEditingDraftField(null);
                        setDraftFieldForm(emptyFieldForm);
                        setShowAddFieldForm(true);
                      }}
                    >
                      Add Field
                    </Button>
                  </div>
                  {sortedDraftFields.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Drag fields to change display order.</p>
                  )}

                  {sortedDraftFields.length === 0 ? (
                    <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No fields added yet. Click "Add Field" to get started.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                      {sortedDraftFields.map((field, index) => (
                        <div
                          key={field.id}
                          draggable
                          onDragStart={(e) => handleDraftFieldDragStart(e, field.id)}
                          onDragEnd={handleDraftFieldDragEnd}
                          onDragOver={(e) => handleDraftFieldDragOver(e, index)}
                          onDragLeave={handleDraftFieldDragLeave}
                          onDrop={(e) => handleDraftFieldDrop(e, index)}
                          className={`flex items-start gap-2 p-3 rounded-lg border transition-colors cursor-grab active:cursor-grabbing ${
                            draggedDraftFieldId === field.id
                              ? 'opacity-50 border-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
                              : dragOverDraftIndex === index
                                ? 'border-blue-400 border-2 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50'
                          }`}
                        >
                          <div className="shrink-0 pt-0.5 text-slate-400" title="Drag to reorder" aria-hidden>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-slate-500">{index + 1}.</span>
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {field.fieldLabel}
                              </span>
                              {field.isRequired && <span className="text-xs text-red-500">*</span>}
                              <span className="px-2 py-0.5 text-xs bg-slate-200 text-slate-700 rounded dark:bg-slate-700 dark:text-slate-300">
                                {field.fieldType}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">{field.fieldName}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleMoveDraftField(field.id, 'up')}
                              disabled={index === 0}
                              className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                              title="Move up"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleMoveDraftField(field.id, 'down')}
                              disabled={index === sortedDraftFields.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                              title="Move down"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleEditDraftField(field)}
                              className="p-1 text-blue-500 hover:text-blue-700"
                              title="Edit"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {canDeleteForms && (
                              <button
                                onClick={() => handleDeleteDraftField(field.id)}
                                className="p-1 text-red-500 hover:text-red-700"
                                title="Delete"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add/Edit Field Form */}
                {(showAddFieldForm || editingDraftField) && (
                  <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                    <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                      {editingDraftField ? 'Edit Field' : 'Add New Field'}
                    </h5>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-200">
                            Field Name * <span className="text-slate-400 font-normal">(Auto-generated)</span>
                          </label>
                          <input
                            type="text"
                            value={draftFieldForm.fieldName}
                            disabled
                            className="w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-sm bg-slate-100 text-slate-600 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                            placeholder="Auto-generated from field label"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-200">
                            Field Type *
                          </label>
                          <select
                            value={draftFieldForm.fieldType}
                            onChange={(e) => {
                              setDraftFieldForm((prev) => ({
                                ...prev,
                                fieldType: e.target.value,
                                options: e.target.value === 'dropdown' || e.target.value === 'radio' ? prev.options : [],
                              }));
                            }}
                            className="w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                          >
                            {fieldTypes.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Input
                        label="Field Label *"
                        value={draftFieldForm.fieldLabel}
                        onChange={(e) => {
                          const newLabel = e.target.value;
                          const newFieldName = toSnakeCase(newLabel);
                          setDraftFieldForm((prev) => {
                            // Auto-populate field name if it's empty or matches the previous snake_case version
                            const previousSnakeCase = toSnakeCase(prev.fieldLabel);
                            const shouldUpdateFieldName = !prev.fieldName || prev.fieldName === previousSnakeCase;
                            return {
                              ...prev,
                              fieldLabel: newLabel,
                              fieldName: shouldUpdateFieldName ? newFieldName : prev.fieldName,
                            };
                          });
                        }}
                        placeholder="e.g. Student Name"
                      />
                      <Input
                        label="Placeholder"
                        value={draftFieldForm.placeholder}
                        onChange={(e) => setDraftFieldForm((prev) => ({ ...prev, placeholder: e.target.value }))}
                        placeholder="Enter placeholder text"
                      />
                      <div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draftFieldForm.isRequired}
                            onChange={(e) => setDraftFieldForm((prev) => ({ ...prev, isRequired: e.target.checked }))}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Required Field</span>
                        </label>
                      </div>
                      {(draftFieldForm.fieldType === 'dropdown' || draftFieldForm.fieldType === 'radio') && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Options</label>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setDraftFieldForm((prev) => ({
                                  ...prev,
                                  options: [...prev.options, { value: '', label: '' }],
                                }));
                              }}
                            >
                              Add Option
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {draftFieldForm.options.map((option, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <Input
                                  value={option.value}
                                  onChange={(e) => {
                                    const newOptions = [...draftFieldForm.options];
                                    newOptions[index] = { ...newOptions[index], value: e.target.value };
                                    setDraftFieldForm((prev) => ({ ...prev, options: newOptions }));
                                  }}
                                  placeholder="Value"
                                  className="flex-1"
                                />
                                <Input
                                  value={option.label}
                                  onChange={(e) => {
                                    const newOptions = [...draftFieldForm.options];
                                    newOptions[index] = { ...newOptions[index], label: e.target.value };
                                    setDraftFieldForm((prev) => ({ ...prev, options: newOptions }));
                                  }}
                                  placeholder="Label"
                                  className="flex-1"
                                />
                                <button
                                  onClick={() => {
                                    setDraftFieldForm((prev) => ({
                                      ...prev,
                                      options: prev.options.filter((_, i) => i !== index),
                                    }));
                                  }}
                                  className="p-2 text-red-500 hover:text-red-700"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleAddDraftField}
                          className="flex-1"
                        >
                          {editingDraftField ? 'Update Field' : 'Add Field'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingDraftField(null);
                            setDraftFieldForm(emptyFieldForm);
                            setShowAddFieldForm(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 p-6 border-t border-slate-200 dark:border-slate-700">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsCreateFormOpen(false);
                  setNewForm({ name: '', description: '' });
                  setDraftFields([]);
                  setIncludeAddress(false);
                  setDraftFieldForm(emptyFieldForm);
                  setEditingDraftField(null);
                  setShowAddFieldForm(false);
                }}
                disabled={isCreatingForm}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateForm}
                disabled={isCreatingForm || !newForm.name.trim()}
              >
                {isCreatingForm ? 'Creating...' : 'Create Form'}
              </Button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Create/Edit Field Modal */}
      {isCreateFieldOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl shadow-blue-100/30 dark:border-slate-800 dark:bg-slate-900/95 my-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {editingField ? 'Edit Field' : 'Add Field'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {editingField ? 'Update field properties' : 'Add a new field to this form'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateFieldOpen(false);
                  setEditingField(null);
                  setFieldForm(emptyFieldForm);
                }}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Field Name * <span className="text-slate-400 font-normal">(Auto-generated)</span>
                  </label>
                  <input
                    type="text"
                    value={fieldForm.fieldName}
                    disabled
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm bg-slate-100 text-slate-600 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                    placeholder="Auto-generated from field label"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Field Type *
                  </label>
                  <select
                    value={fieldForm.fieldType}
                    onChange={(e) => {
                      setFieldForm((prev) => ({
                        ...prev,
                        fieldType: e.target.value,
                        options: e.target.value === 'dropdown' || e.target.value === 'radio' ? prev.options : [],
                      }));
                    }}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    {fieldTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Input
                label="Field Label *"
                value={fieldForm.fieldLabel}
                onChange={(e) => {
                  const newLabel = e.target.value;
                  const newFieldName = toSnakeCase(newLabel);
                  setFieldForm((prev) => {
                    // Auto-populate field name if it's empty or matches the previous snake_case version
                    const previousSnakeCase = toSnakeCase(prev.fieldLabel);
                    const shouldUpdateFieldName = !prev.fieldName || prev.fieldName === previousSnakeCase;
                    return {
                      ...prev,
                      fieldLabel: newLabel,
                      fieldName: shouldUpdateFieldName ? newFieldName : prev.fieldName,
                    };
                  });
                }}
                placeholder="e.g. Student Name"
              />

              <Input
                label="Placeholder"
                value={fieldForm.placeholder}
                onChange={(e) => setFieldForm((prev) => ({ ...prev, placeholder: e.target.value }))}
                placeholder="Enter placeholder text"
              />

              <div>
                <label className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    checked={fieldForm.isRequired}
                    onChange={(e) => setFieldForm((prev) => ({ ...prev, isRequired: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Required Field</span>
                </label>
              </div>

              {(fieldForm.fieldType === 'dropdown' || fieldForm.fieldType === 'radio') && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Options</label>
                    <Button variant="secondary" size="sm" onClick={handleAddOption}>
                      Add Option
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {fieldForm.options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={option.value}
                          onChange={(e) => handleUpdateOption(index, 'value', e.target.value)}
                          placeholder="Value"
                          className="flex-1"
                        />
                        <Input
                          value={option.label}
                          onChange={(e) => handleUpdateOption(index, 'label', e.target.value)}
                          placeholder="Label"
                          className="flex-1"
                        />
                        <button
                          onClick={() => handleRemoveOption(index)}
                          className="p-2 text-red-500 hover:text-red-700"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Input
                label="Default Value"
                value={fieldForm.defaultValue}
                onChange={(e) => setFieldForm((prev) => ({ ...prev, defaultValue: e.target.value }))}
                placeholder="Default value for this field"
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Help Text</label>
                <textarea
                  value={fieldForm.helpText}
                  onChange={(e) => setFieldForm((prev) => ({ ...prev, helpText: e.target.value }))}
                  placeholder="Optional help text for users"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsCreateFieldOpen(false);
                  setEditingField(null);
                  setFieldForm(emptyFieldForm);
                }}
                disabled={createFieldMutation.isPending || updateFieldMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={editingField ? handleUpdateField : handleCreateField}
                disabled={createFieldMutation.isPending || updateFieldMutation.isPending}
              >
                {editingField
                  ? updateFieldMutation.isPending
                    ? 'Updating...'
                    : 'Update Field'
                  : createFieldMutation.isPending
                  ? 'Creating...'
                  : 'Create Field'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
