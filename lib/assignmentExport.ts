/** Dynamic field column descriptor from assign API exportMeta. */
export type AssignmentExportDynamicColumn = {
  key: string;
  label: string;
};

export type AssignmentExportMeta = {
  source?: string;
  minRank?: number | null;
  maxRank?: number | null;
  includeRankColumn?: boolean;
  dynamicFieldColumns?: AssignmentExportDynamicColumn[];
};

export type AssignedLeadExportRow = {
  name?: string;
  phone?: string;
  fatherName?: string;
  fatherPhone?: string;
  enquiryNumber?: string;
  remarks?: string;
  rank?: number | string;
  source?: string;
  district?: string;
  mandal?: string;
  village?: string;
  address?: string;
  dynamicFields?: Record<string, unknown>;
};

/**
 * Build one Excel row for post-assignment download.
 * When exportMeta includes source filters, adds Rank + dynamic_fields columns from assigned leads.
 */
export function buildAssignedLeadExcelRow(
  lead: AssignedLeadExportRow,
  isProExport: boolean,
  exportMeta: AssignmentExportMeta | null
): Record<string, string | number> {
  const dynamicFields =
    lead.dynamicFields && typeof lead.dynamicFields === 'object' ? lead.dynamicFields : {};

  const row: Record<string, string | number> = {
    'Lead Name': lead.name ?? '',
    'Phone Number': lead.phone ?? '',
    'Father Name': lead.fatherName ?? '',
    'Father Phone': lead.fatherPhone ?? '',
  };

  if (exportMeta?.includeRankColumn) {
    row.Rank = lead.rank != null && lead.rank !== '' ? lead.rank : '';
    if (exportMeta.source) {
      row.Source = exportMeta.source;
    }
  }

  const dynamicCols = exportMeta?.dynamicFieldColumns ?? [];
  dynamicCols.forEach(({ key, label }) => {
    const v = dynamicFields[key];
    row[label] = v == null ? '' : String(v);
  });

  if (isProExport) {
    row.District = lead.district ?? '';
    row.Mandal = lead.mandal ?? '';
    row.Village = lead.village ?? '';
    row['Full Address'] = lead.address ?? '';
  }

  row.Remarks = lead.remarks ?? '';

  if (lead.enquiryNumber) {
    row['Enquiry Number'] = lead.enquiryNumber;
  }

  return row;
}
