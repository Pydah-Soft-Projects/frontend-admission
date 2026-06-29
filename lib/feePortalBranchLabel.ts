/** Branch row shape from course catalog / payment settings APIs. */
export type FeePortalBranchCatalogRow = {
  _id?: string;
  name?: string | null;
  code?: string | null;
};

const normBranchToken = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/**
 * Fee Management `feestructures.branch` uses catalog display name (e.g. CSE),
 * not roll/internal code (e.g. BCSE).
 */
export function resolveFeePortalBranchLabel(
  catalogRow?: FeePortalBranchCatalogRow | null,
  branchHint = ''
): string {
  const name = String(catalogRow?.name ?? '').trim();
  const code = String(catalogRow?.code ?? '').trim();
  const hint = String(branchHint ?? '').trim();

  if (hint) {
    if (name && normBranchToken(hint) === normBranchToken(name)) return name;
    if (code && normBranchToken(hint) === normBranchToken(code)) {
      if (name && normBranchToken(name) !== normBranchToken(code)) return name;
      return code;
    }
  }

  if (name && code && normBranchToken(name) !== normBranchToken(code)) {
    return name;
  }
  return name || code || hint;
}

export function findBranchInCatalog(
  branches: FeePortalBranchCatalogRow[] | undefined,
  branchId?: string | null
): FeePortalBranchCatalogRow | undefined {
  const target = String(branchId ?? '').trim();
  if (!target || !Array.isArray(branches)) return undefined;
  return branches.find((branch) => String(branch._id ?? '').trim() === target);
}

export function resolveFeePortalBranchFromCatalog(
  branches: FeePortalBranchCatalogRow[] | undefined,
  branchId?: string | null,
  branchHint = ''
): string {
  const selected = findBranchInCatalog(branches, branchId);
  if (selected) return resolveFeePortalBranchLabel(selected, branchHint);
  return String(branchHint ?? '').trim();
}
