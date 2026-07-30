export type CasteCategoryCatalogItem = {
  id: string;
  name: string;
  sortOrder?: number | null;
};

export type CasteCatalogItem = {
  id: string;
  categoryId: string;
  name: string;
  sortOrder?: number | null;
};

export type CasteCatalogPayload = {
  categories: CasteCategoryCatalogItem[];
  castes: CasteCatalogItem[];
  source?: string;
};

export function normalizeCasteKey(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

export function parseCasteCatalogResponse(payload: unknown): CasteCatalogPayload {
  const root = (payload as { data?: unknown } | null | undefined)?.data ?? payload;
  const obj = (root && typeof root === 'object' ? root : {}) as Record<string, unknown>;

  const categoriesRaw = Array.isArray(obj.categories) ? obj.categories : [];
  const castesRaw = Array.isArray(obj.castes)
    ? obj.castes
    : Array.isArray(root)
      ? (root as unknown[])
      : [];

  const categories = categoriesRaw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? '').trim();
      if (!name) return null;
      return {
        id: String(r.id ?? r._id ?? name),
        name,
        sortOrder:
          r.sortOrder != null
            ? Number(r.sortOrder)
            : r.sort_order != null
              ? Number(r.sort_order)
              : null,
      };
    })
    .filter(Boolean) as CasteCategoryCatalogItem[];

  const castes = castesRaw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? '').trim();
      if (!name) return null;
      return {
        id: String(r.id ?? r._id ?? name),
        categoryId: String(r.categoryId ?? r.category_id ?? ''),
        name,
        sortOrder:
          r.sortOrder != null
            ? Number(r.sortOrder)
            : r.sort_order != null
              ? Number(r.sort_order)
              : null,
      };
    })
    .filter(Boolean) as CasteCatalogItem[];

  return {
    categories,
    castes,
    source: obj.source != null ? String(obj.source) : undefined,
  };
}

/** Resolve category id for a stored reservation.general / caste name. */
export function resolveCasteCategoryIdForValue(
  value: string | undefined | null,
  categories: CasteCategoryCatalogItem[],
  castes: CasteCatalogItem[]
): string {
  const key = normalizeCasteKey(value);
  if (!key) return '';

  const casteMatch = castes.find((c) => normalizeCasteKey(c.name) === key);
  if (casteMatch?.categoryId) return String(casteMatch.categoryId);

  const categoryMatch = categories.find((c) => normalizeCasteKey(c.name) === key);
  return categoryMatch ? String(categoryMatch.id) : '';
}

/** Resolve caste catalog row for a stored reservation.general value. */
export function resolveCasteForValue(
  value: string | undefined | null,
  castes: CasteCatalogItem[],
  categoryId?: string | null
): CasteCatalogItem | null {
  const key = normalizeCasteKey(value);
  if (!key) return null;
  const scoped = categoryId
    ? castes.filter((c) => String(c.categoryId) === String(categoryId))
    : castes;
  return scoped.find((c) => normalizeCasteKey(c.name) === key) || null;
}
