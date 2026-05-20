export type StudentQuotaCatalogItem = {
  id: string;
  name: string;
  code: string;
  sortOrder?: number | null;
};

export function parseStudentQuotasResponse(payload: unknown): StudentQuotaCatalogItem[] {
  const root = payload as { data?: unknown } | unknown[] | null | undefined;
  const list = Array.isArray(root)
    ? root
    : Array.isArray((root as { data?: unknown })?.data)
      ? (root as { data: unknown[] }).data
      : [];
  return list
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? '').trim();
      if (!name) return null;
      return {
        id: String(r.id ?? r._id ?? name),
        name,
        code: String(r.code ?? '').trim(),
        sortOrder:
          r.sortOrder != null
            ? Number(r.sortOrder)
            : r.sort_order != null
              ? Number(r.sort_order)
              : null,
      };
    })
    .filter(Boolean) as StudentQuotaCatalogItem[];
}

export function quotaLabelsFromCatalog(items: StudentQuotaCatalogItem[]): string[] {
  return items.map((item) => item.name).filter(Boolean);
}

/** Keeps a legacy stored value visible when it is not in the secondary catalog. */
export function mergeQuotaSelectOptions(catalogLabels: string[], currentValue?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  for (const label of catalogLabels) add(label);
  if (currentValue) add(currentValue);
  return out;
}
