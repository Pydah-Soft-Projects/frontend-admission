/** Column keys for manager team leads Excel export (must match backend). */
export type ManagerLeadsExportColumnKey =
  | 'enquiryNumber'
  | 'name'
  | 'phone'
  | 'email'
  | 'fatherName'
  | 'fatherPhone'
  | 'motherName'
  | 'leadStatus'
  | 'applicationStatus'
  | 'studentGroup'
  | 'courseInterested'
  | 'state'
  | 'district'
  | 'mandal'
  | 'village'
  | 'source'
  | 'gender'
  | 'rank'
  | 'quota'
  | 'interCollege'
  | 'hallTicketNumber'
  | 'academicYear'
  | 'assignedToName'
  | 'notes';

export const MANAGER_LEADS_EXPORT_COLUMNS: {
  key: ManagerLeadsExportColumnKey;
  label: string;
}[] = [
  { key: 'enquiryNumber', label: 'Enquiry Number' },
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'fatherName', label: 'Father Name' },
  { key: 'fatherPhone', label: 'Father Phone' },
  { key: 'motherName', label: 'Mother Name' },
  { key: 'leadStatus', label: 'Lead Status' },
  { key: 'applicationStatus', label: 'Application Status' },
  { key: 'studentGroup', label: 'Student Group' },
  { key: 'courseInterested', label: 'Course Interested' },
  { key: 'state', label: 'State' },
  { key: 'district', label: 'District' },
  { key: 'mandal', label: 'Mandal' },
  { key: 'village', label: 'Village' },
  { key: 'source', label: 'Source' },
  { key: 'gender', label: 'Gender' },
  { key: 'rank', label: 'Rank' },
  { key: 'quota', label: 'Quota' },
  { key: 'interCollege', label: 'Inter College' },
  { key: 'hallTicketNumber', label: 'Hall Ticket Number' },
  { key: 'academicYear', label: 'Academic Year' },
  { key: 'assignedToName', label: 'Assigned To' },
  { key: 'notes', label: 'Notes' },
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
