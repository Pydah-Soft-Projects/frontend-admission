/** Column keys for manager team leads Excel export (must match backend). */
export type ManagerLeadsExportColumnKey =
  | 'enquiryNumber'
  | 'name'
  | 'phone'
  | 'alternateMobile'
  | 'email'
  | 'fatherName'
  | 'fatherPhone'
  | 'motherName'
  | 'address'
  | 'village'
  | 'mandal'
  | 'district'
  | 'state'
  | 'leadStatus'
  | 'callStatus'
  | 'visitStatus'
  | 'applicationStatus'
  | 'studentGroup'
  | 'courseInterested'
  | 'gender'
  | 'rank'
  | 'quota'
  | 'interCollege'
  | 'hallTicketNumber'
  | 'academicYear'
  | 'admissionNumber'
  | 'isNri'
  | 'assignedToName'
  | 'assignedToProName'
  | 'cycleNumber'
  | 'assignedAt'
  | 'counsellorTargetDate'
  | 'proTargetDate'
  | 'targetDate';

export type ManagerLeadsExportColumnGroup =
  | 'basic'
  | 'contact'
  | 'location'
  | 'status'
  | 'academic'
  | 'assignment';

export const MANAGER_LEADS_EXPORT_COLUMN_GROUPS: {
  id: ManagerLeadsExportColumnGroup;
  label: string;
}[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'contact', label: 'Contact & family' },
  { id: 'location', label: 'Location & address' },
  { id: 'status', label: 'Status' },
  { id: 'academic', label: 'Academic' },
  { id: 'assignment', label: 'Assignment' },
];

export const MANAGER_LEADS_EXPORT_COLUMNS: {
  key: ManagerLeadsExportColumnKey;
  label: string;
  group: ManagerLeadsExportColumnGroup;
}[] = [
  { key: 'enquiryNumber', label: 'Enquiry Number', group: 'basic' },
  { key: 'name', label: 'Name', group: 'basic' },
  { key: 'phone', label: 'Phone', group: 'basic' },
  { key: 'alternateMobile', label: 'Alternate Mobile', group: 'contact' },
  { key: 'email', label: 'Email', group: 'contact' },
  { key: 'fatherName', label: 'Father Name', group: 'contact' },
  { key: 'fatherPhone', label: 'Father Phone', group: 'contact' },
  { key: 'motherName', label: 'Mother Name', group: 'contact' },
  { key: 'address', label: 'Address', group: 'location' },
  { key: 'village', label: 'Village', group: 'location' },
  { key: 'mandal', label: 'Mandal', group: 'location' },
  { key: 'district', label: 'District', group: 'location' },
  { key: 'state', label: 'State', group: 'location' },
  { key: 'leadStatus', label: 'Lead Status', group: 'status' },
  { key: 'callStatus', label: 'Call Status', group: 'status' },
  { key: 'visitStatus', label: 'Visit Status', group: 'status' },
  { key: 'applicationStatus', label: 'Application Status', group: 'status' },
  { key: 'studentGroup', label: 'Student Group', group: 'academic' },
  { key: 'courseInterested', label: 'Course Interested', group: 'academic' },
  { key: 'gender', label: 'Gender', group: 'academic' },
  { key: 'rank', label: 'Rank', group: 'academic' },
  { key: 'quota', label: 'Quota', group: 'academic' },
  { key: 'interCollege', label: 'Inter College', group: 'academic' },
  { key: 'hallTicketNumber', label: 'Hall Ticket Number', group: 'academic' },
  { key: 'academicYear', label: 'Academic Year', group: 'academic' },
  { key: 'admissionNumber', label: 'Admission Number', group: 'academic' },
  { key: 'isNri', label: 'NRI', group: 'academic' },
  { key: 'assignedToName', label: 'Assigned Counsellor', group: 'assignment' },
  { key: 'assignedToProName', label: 'Assigned PRO', group: 'assignment' },
  { key: 'cycleNumber', label: 'Cycle Number', group: 'assignment' },
  { key: 'assignedAt', label: 'Assigned At', group: 'assignment' },
  { key: 'counsellorTargetDate', label: 'Counsellor Target Date', group: 'assignment' },
  { key: 'proTargetDate', label: 'PRO Target Date', group: 'assignment' },
  { key: 'targetDate', label: 'Target Date', group: 'assignment' },
];

/** Checked by default when the export modal opens. */
export const MANAGER_LEADS_EXPORT_DEFAULT_KEYS: ManagerLeadsExportColumnKey[] = [
  'enquiryNumber',
  'name',
  'phone',
  'leadStatus',
  'studentGroup',
  'district',
  'assignedToName',
];

export function getDefaultExportColumnSelection(): Record<ManagerLeadsExportColumnKey, boolean> {
  const defaultSet = new Set(MANAGER_LEADS_EXPORT_DEFAULT_KEYS);
  return MANAGER_LEADS_EXPORT_COLUMNS.reduce(
    (acc, col) => {
      acc[col.key] = defaultSet.has(col.key);
      return acc;
    },
    {} as Record<ManagerLeadsExportColumnKey, boolean>
  );
}

export function getSelectedExportColumnKeys(
  selection: Record<ManagerLeadsExportColumnKey, boolean>
): ManagerLeadsExportColumnKey[] {
  return MANAGER_LEADS_EXPORT_COLUMNS.filter((col) => selection[col.key]).map((col) => col.key);
}

export function getExportColumnsByGroup(group: ManagerLeadsExportColumnGroup) {
  return MANAGER_LEADS_EXPORT_COLUMNS.filter((col) => col.group === group);
}
