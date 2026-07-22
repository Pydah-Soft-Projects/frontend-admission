export type OverallConcessionLine = {
  feeHeadId?: string | null;
  feeHeadCode?: string;
  studentYear?: number | string;
  concessionType?: string;
  /** Builder / new storage: raw entered value. */
  amount?: number | string;
  /** Legacy storage — resolved at read time when `amount` is absent. */
  actualAmount?: number | string;
  revisedAmount?: number | string;
  concessionAmount?: number | string;
};

export type ResolvedOverallConcession = {
  concessionType: 'CONCESSION' | 'REVISED_FEE';
  /** Value shown in concession/revised column (deduction or revised fee). */
  adjustmentAmount: number;
  /** Payable after applying type against catalog actual. */
  payableAmount: number;
};

export function normalizeOverallConcessionType(
  raw?: string | null
): 'CONCESSION' | 'REVISED_FEE' | null {
  const type = String(raw || '').trim().toUpperCase();
  if (type === 'CONCESSION') return 'CONCESSION';
  if (type === 'REVISED_FEE' || type === 'REVISED') return 'REVISED_FEE';
  return null;
}

const readPositive = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Resolve display/payable amounts from an overall_concessions line + live catalog actual.
 * Supports new format (concessionType + amount) and legacy pre-computed rows.
 */
export function resolveOverallConcessionLine(
  line: OverallConcessionLine,
  catalogAmount = 0
): ResolvedOverallConcession | null {
  const concessionType = normalizeOverallConcessionType(line.concessionType);
  if (!concessionType) return null;

  const actual = catalogAmount > 0 ? catalogAmount : Number(line.actualAmount) || 0;
  const storedAmount = readPositive(line.amount);

  if (storedAmount !== null) {
    if (concessionType === 'CONCESSION') {
      return {
        concessionType,
        adjustmentAmount: storedAmount,
        payableAmount: Math.max(actual - storedAmount, 0),
      };
    }
    return {
      concessionType,
      adjustmentAmount: actual > 0 && storedAmount !== actual ? storedAmount : storedAmount,
      payableAmount: storedAmount,
    };
  }

  // Legacy rows (actualAmount + revisedAmount + concessionAmount)
  if (concessionType === 'CONCESSION') {
    const deduction =
      readPositive(line.concessionAmount) ??
      (actual > 0 &&
      readPositive(line.revisedAmount) !== null &&
      Number(line.revisedAmount) < actual
        ? actual - Number(line.revisedAmount)
        : readPositive(line.revisedAmount));
    if (deduction === null) return null;
    return {
      concessionType,
      adjustmentAmount: deduction,
      payableAmount: Math.max(actual - deduction, 0),
    };
  }

  const revised = readPositive(line.revisedAmount);
  if (revised === null) return null;
  if (actual > 0 && revised === actual) return null;
  return {
    concessionType,
    adjustmentAmount: actual > 0 && revised !== actual ? revised : revised,
    payableAmount: revised,
  };
}

/** Print table cell: concession/revised column value (0 if none). */
export function resolveOverallConcessionPrintAdjustment(
  line: OverallConcessionLine | undefined,
  catalogActual: number
): number {
  if (!line) return 0;
  const resolved = resolveOverallConcessionLine(line, catalogActual);
  if (!resolved) return 0;
  if (resolved.concessionType === 'CONCESSION') {
    return resolved.adjustmentAmount > 0 ? resolved.adjustmentAmount : 0;
  }
  return resolved.adjustmentAmount > 0 && resolved.adjustmentAmount !== catalogActual
    ? resolved.adjustmentAmount
    : resolved.payableAmount > 0 && resolved.payableAmount !== catalogActual
      ? resolved.payableAmount
      : 0;
}

/** Only lines with an explicit amount for that year should persist or sync. */
export function filterPersistableBuilderConcessionLines<
  T extends { concessionType?: string; amount?: number | null | string },
>(lines: T[] = []): T[] {
  return lines.filter((line) => {
    const type = normalizeOverallConcessionType(line.concessionType);
    if (!type) return false;
    return readPositive(line.amount) !== null;
  });
}

/** True when at least one concession/revised-fee line has an entered amount (builder or overall_concessions). */
export function hasPersistableOverallConcessionAmounts(
  lines: OverallConcessionLine[] = []
): boolean {
  return lines.some((line) => {
    const type = normalizeOverallConcessionType(line.concessionType);
    if (!type) return false;
    if (readPositive(line.amount) !== null) return true;
    if (type === 'CONCESSION') {
      return (
        readPositive(line.concessionAmount) !== null || readPositive(line.revisedAmount) !== null
      );
    }
    return readPositive(line.revisedAmount) !== null;
  });
}

export function isPersistableBuilderConcessionLine(line: {
  concessionType?: string;
  amount?: number | null | string;
}): boolean {
  return filterPersistableBuilderConcessionLines([line]).length > 0;
}

type FeeStructureCatalogRow = {
  _id?: string;
  feeHead?: string | null;
  feeHeadCode?: string;
  feeHeadName?: string;
  studentYear?: number | null;
  amount?: number;
};

type FeeHeadMasterRow = {
  _id?: string;
  id?: string;
  code?: string;
  name?: string;
};

/** overall_concessions.revised_fees → Step 4 builder editable lines. */
export function overallConcessionLinesToBuilderLines<
  T extends {
    structureId: string;
    amount: number;
    remarks?: string;
    concessionType: 'CONCESSION' | 'REVISED_FEE';
    feeHeadId?: string;
    feeHeadCode?: string;
    feeHeadName?: string;
    studentYear?: number;
  },
>(
  overallLines: OverallConcessionLine[] = [],
  catalogRows: FeeStructureCatalogRow[] = [],
  feeHeadRows: FeeHeadMasterRow[] = []
): T[] {
  const result: T[] = [];

  for (const line of overallLines) {
    if (!line || typeof line !== 'object') continue;
    const concessionType = normalizeOverallConcessionType(line.concessionType);
    if (!concessionType) continue;

    const feeHeadId = line.feeHeadId ? String(line.feeHeadId).trim() : '';
    const rawCode = line.feeHeadCode ? String(line.feeHeadCode).trim() : '';
    const feeHeadCode = String(rawCode).trim().toUpperCase() === 'OTH02' ? 'OTH1' : rawCode;
    const year = Number(line.studentYear) > 0 ? Number(line.studentYear) : 1;

    const matchingCatalog = catalogRows.find(
      (c) =>
        Number(c.studentYear) === year &&
        ((feeHeadId && String(c.feeHead) === feeHeadId) ||
          (feeHeadCode &&
            String(c.feeHeadCode || '')
              .toUpperCase()
              .trim() === feeHeadCode.toUpperCase()))
    );
    const catalogAmount = matchingCatalog ? Number(matchingCatalog.amount) || 0 : 0;
    const resolved = resolveOverallConcessionLine(line, catalogAmount);
    if (!resolved) continue;

    const amount =
      concessionType === 'CONCESSION' ? resolved.adjustmentAmount : resolved.payableAmount;
    if (!readPositive(amount)) continue;

    const feeHeadMeta =
      feeHeadRows.find(
        (h) =>
          String(h._id || h.id) === feeHeadId ||
          (feeHeadCode && String(h.code || '').toUpperCase() === feeHeadCode.toUpperCase())
      ) || null;

    const structureId = matchingCatalog
      ? String(matchingCatalog._id)
      : `custom-${feeHeadId || feeHeadCode || 'head'}-${year}`;

    result.push({
      structureId,
      amount,
      remarks: concessionType === 'CONCESSION' ? 'Concession' : 'Revised',
      concessionType,
      feeHeadId: feeHeadId || (matchingCatalog?.feeHead ? String(matchingCatalog.feeHead) : undefined),
      feeHeadCode: feeHeadCode || matchingCatalog?.feeHeadCode || feeHeadMeta?.code || '',
      feeHeadName:
        matchingCatalog?.feeHeadName || feeHeadMeta?.name || feeHeadCode || feeHeadId || 'Fee head',
      studentYear: year,
    } as T);
  }

  return result;
}
