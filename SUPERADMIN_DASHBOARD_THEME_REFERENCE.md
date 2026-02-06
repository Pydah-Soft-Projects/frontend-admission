# Super Admin Dashboard – Theme reference (re-apply after merge)

**Note:** We did **not** modify `app/superadmin/dashboard/page.tsx` during the orange-theme implementation. If you discard this file due to merge conflicts, the version you keep may still use **blue** accents. When you want the dashboard to match the new **orange** theme, apply the updates below.

---

## Changes to apply to `app/superadmin/dashboard/page.tsx`

### 1. `summaryCardStyles` (lines ~71–78)

**Current (blue first):**
```ts
const summaryCardStyles = [
  'from-blue-500/10 via-blue-500/15 to-transparent text-blue-700 dark:text-blue-200',
  'from-emerald-500/10 via-emerald-500/15 to-transparent text-emerald-700 dark:text-emerald-200',
  ...
];
```

**Update to (orange first, keep rest):**
```ts
const summaryCardStyles = [
  'from-orange-500/10 via-orange-500/15 to-transparent text-orange-700 dark:text-orange-200',
  'from-emerald-500/10 via-emerald-500/15 to-transparent text-emerald-700 dark:text-emerald-200',
  'from-rose-500/10 via-rose-500/15 to-transparent text-rose-700 dark:text-rose-200',
  'from-violet-500/10 via-violet-500/15 to-transparent text-violet-700 dark:text-violet-200',
  'from-amber-500/10 via-amber-500/15 to-transparent text-amber-700 dark:text-amber-200',
  'from-indigo-500/10 via-indigo-500/15 to-transparent text-indigo-700 dark:text-indigo-200',
];
```

### 2. Select inputs – focus ring (lines ~356 and ~369)

**Find:** `focus:ring-blue-500`  
**Replace with:** `focus:ring-orange-500`

(Two occurrences on the Academic Year and Student Group select elements.)

### 3. Card shadows – blue tint to orange

**Find:** `shadow-blue-100/40` and `shadow-blue-100/30`  
**Replace with:** `shadow-orange-100/40` and `shadow-orange-100/30`

Occurrences:
- Summary cards: `shadow-blue-100/40` → `shadow-orange-100/40`
- All Cards using `shadow-lg shadow-blue-100/30` → `shadow-lg shadow-orange-100/30`
- Small card: `shadow-sm shadow-blue-100/30` → `shadow-sm shadow-orange-100/30`

---

## Quick checklist

- [ ] `summaryCardStyles`: first item blue → orange
- [ ] Select focus: `focus:ring-blue-500` → `focus:ring-orange-500` (2 places)
- [ ] All `shadow-blue-100/*` → `shadow-orange-100/*` on Cards

After you’ve resolved merge conflicts and want the dashboard updated, say **“update the superadmin dashboard again”** and these changes will be applied.
