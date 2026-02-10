import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  width,
  height,
  ...props
}) => {
  const baseStyles = 'animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%] animate-shimmer';

  const variants = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {
    width: width || '100%',
    height: height || '1rem',
  };

  return (
    <div
      className={cn(baseStyles, variants[variant], className)}
      style={style}
      {...props}
    />
  );
};

// Table Skeleton
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 8,
}) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} variant="rectangular" height="40px" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};

// Card Skeleton
export const CardSkeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  return (
    <div className={cn("p-6 space-y-4", className)} {...props}>
      <Skeleton variant="text" width="60%" height="24px" />
      <Skeleton variant="text" width="40%" height="20px" />
      <Skeleton variant="text" width="80%" height="20px" />
    </div>
  );
};

// Lead card skeleton (for My Leads card grid) — matches actual card layout on mobile & desktop
export const LeadCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200/80 bg-white", className)}>
      <div className="h-0.5 w-full bg-slate-100" aria-hidden />
      <div className="relative flex flex-1 flex-col p-3 sm:p-4 space-y-2 sm:space-y-3">
        <div className="flex items-start gap-2 min-w-0">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 sm:h-4 w-20 sm:w-24 rounded" />
            <Skeleton className="h-3 w-16 sm:w-20 rounded" />
          </div>
        </div>
        <div className="space-y-1.5 sm:space-y-2 pt-0.5">
          <div className="flex justify-between gap-2 items-center">
            <Skeleton className="h-2.5 sm:h-3 w-12 sm:w-14 rounded shrink-0" />
            <Skeleton className="h-2.5 sm:h-3 flex-1 max-w-[65%] rounded" />
          </div>
          <div className="flex justify-between gap-2 items-center">
            <Skeleton className="h-2.5 sm:h-3 w-10 sm:w-12 rounded shrink-0" />
            <Skeleton className="h-2.5 sm:h-3 flex-1 max-w-[55%] rounded" />
          </div>
          <div className="flex justify-between gap-2 items-center">
            <Skeleton className="h-2.5 sm:h-3 w-14 sm:w-16 rounded shrink-0" />
            <Skeleton className="h-2.5 sm:h-3 flex-1 max-w-[45%] rounded" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-8 sm:h-9 w-14 sm:w-20 rounded-lg" />
          <Skeleton className="h-8 sm:h-9 w-16 sm:w-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
};

// Super Admin Dashboard skeleton — matches dashboard layout (header, 6 cards, scheduled, charts, user perf)
export const SuperAdminDashboardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Page header */}
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {/* Title and subtitle skeletons */}
          <Skeleton className="h-8 sm:h-9 rounded" width="18rem" />
          <Skeleton className="h-4 w-full max-w-md rounded" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Academic Year */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 rounded" width="5rem" />
            <Skeleton className="h-9 rounded-lg" width="5rem" />
          </div>
          {/* Student Group */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 rounded" width="6rem" />
            <Skeleton className="h-9 rounded-lg" width="7rem" />
          </div>
          {/* Actions */}
          <Skeleton className="h-9 rounded-lg" width="7rem" />
          <Skeleton className="h-9 rounded-lg" width="8rem" />
        </div>
      </div>

      {/* 6 summary cards - Matches new centered layout */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-900"
          >
            <div className="h-1 w-full bg-slate-200 dark:bg-slate-700" aria-hidden />
            <div className="p-3 flex flex-col items-center justify-center gap-1">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-7 sm:h-8 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Today's scheduled calls - Matches minimal list layout */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-32 rounded" />
                    <Skeleton className="h-3 w-12 rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-2.5 w-20 rounded" />
                    <Skeleton className="h-2.5 w-24 rounded" />
                  </div>
                </div>
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row 1: Leads vs Admissions (2 cols) + Joining Funnel (1 col) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 space-y-1">
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-3 w-52 rounded" />
          </div>
          <div className="h-96 px-4 pb-4 flex items-center justify-center">
            <Skeleton className="h-80 w-full rounded-lg" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 space-y-1">
            <Skeleton className="h-4 w-44 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
          <div className="h-96 px-4 py-4 flex items-center justify-center">
            <Skeleton className="h-64 w-64 rounded-full mx-auto" />
          </div>
          <div className="mx-4 mb-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <Skeleton className="h-3 w-full rounded" />
          </div>
        </div>
      </div>

      {/* Charts row 2: Status Change + Lead Pool */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 space-y-1">
            <Skeleton className="h-4 w-44 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
          <div className="h-80 px-4 py-4">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="space-y-1">
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-3 w-36 rounded" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full shrink-0" />
          </div>
          <div className="h-80 px-4 py-4 flex items-center justify-center">
            <Skeleton className="h-64 w-64 rounded-full" />
          </div>
        </div>
      </div>

      {/* User Performance card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Skeleton className="h-4 w-52 rounded" />
            <Skeleton className="h-3 w-64 rounded" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg shrink-0" />
        </div>
        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-28 rounded" />
                    <Skeleton className="h-3 w-40 rounded" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-24 rounded" />
                    <Skeleton className="h-5 w-12 rounded" />
                  </div>
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-4/5 rounded" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Lead detail page skeleton — matches profile card + content layout
export const LeadDetailSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("mx-auto w-full max-w-7xl space-y-3 sm:space-y-6 px-0 sm:px-4 pb-36 sm:pb-6", className)}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="lg:col-span-2 space-y-3 sm:space-y-6">
          {/* Profile card skeleton */}
          <div className="rounded-xl sm:rounded-2xl border-2 border-slate-200 overflow-hidden">
            <Skeleton className="h-24 sm:h-28 w-full rounded-none" />
            <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <Skeleton className="h-10 w-10 sm:h-14 sm:w-14 rounded-full shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-4 sm:h-5 w-32 sm:w-40 rounded" />
                  <Skeleton className="h-3 sm:h-4 w-24 sm:w-28 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-2.5 sm:h-3 w-16 rounded" />
                    <Skeleton className="h-3 sm:h-4 w-full rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Timeline skeleton */}
          <div className="rounded-xl border border-slate-200 p-3 sm:p-4">
            <Skeleton className="h-4 w-32 mb-3 sm:mb-4 rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-3 w-3 rounded-full shrink-0 mt-1" />
                  <div className="flex-1 space-y-1 min-w-0">
                    <Skeleton className="h-3 w-full rounded" />
                    <Skeleton className="h-2.5 w-3/4 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3 sm:space-y-6">
          {/* Right column card */}
          <div className="rounded-xl border border-slate-200 p-3 sm:p-4">
            <Skeleton className="h-4 w-24 mb-3 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-4/5 rounded" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Lead Table Skeleton — matches exact columns of the leads table
export const LeadTableSkeleton: React.FC<{ rows?: number }> = ({ rows = 10 }) => {
  return (
    <div className="w-full bg-white dark:bg-slate-900 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      {/* Table Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-4 py-3">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-4 rounded" /> {/* Checkbox */}
          <Skeleton className="h-4 w-24 rounded" /> {/* Date */}
          <Skeleton className="h-4 w-32 rounded" /> {/* Name */}
          <Skeleton className="h-4 w-24 rounded" /> {/* Course */}
          <Skeleton className="h-4 w-20 rounded" /> {/* Source */}
          <Skeleton className="h-4 w-24 rounded" /> {/* Status */}
          <Skeleton className="h-4 w-32 rounded" /> {/* Counsellor */}
          <Skeleton className="h-4 w-28 rounded" /> {/* Mobile */}
          <Skeleton className="h-4 w-24 rounded" /> {/* Lead Status */}
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-4 rounded shrink-0" /> {/* Checkbox */}
            <Skeleton className="h-4 w-24 rounded shrink-0" /> {/* Date */}
            <div className="w-32 shrink-0">
              <Skeleton className="h-4 w-24 rounded mb-1" />
              <Skeleton className="h-3 w-16 rounded" />
            </div> {/* Name + Tag */}
            <Skeleton className="h-4 w-24 rounded shrink-0" /> {/* Course */}
            <Skeleton className="h-4 w-20 rounded shrink-0" /> {/* Source */}
            <Skeleton className="h-4 w-24 rounded shrink-0" /> {/* Status */}
            <Skeleton className="h-4 w-32 rounded shrink-0" /> {/* Counsellor */}
            <Skeleton className="h-4 w-28 rounded shrink-0" /> {/* Mobile */}
            <Skeleton className="h-6 w-24 rounded-full shrink-0" /> {/* Lead Status pill */}
          </div>
        ))}
      </div>
    </div>
  );
};

// Reports Page Skeleton — matches Call Reports tab layout
export const ReportDashboardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('space-y-6', className)}>
      {/* 4 Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <Skeleton className="h-3 w-24 mb-3 rounded" />
            <Skeleton className="h-8 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* User Performance Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-8 w-32 rounded" />
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600">
          <div className="bg-slate-100 dark:bg-slate-800 p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="p-4 flex gap-4">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
// Leads Abstract Skeleton — 2-column grid for Districts and Mandals
export const LeadsAbstractSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-16rem)]", className)}>
      {/* Districts Column */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 h-full">
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 space-y-1">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-3 w-48 rounded" />
        </div>
        <div className="flex-1 p-4 space-y-4 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="flex items-center">
              <Skeleton className="h-8 w-full rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Mandals Column */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 h-full">
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 space-y-1">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-3 w-48 rounded" />
        </div>
        <div className="flex-1 p-4 space-y-4 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="flex items-center">
              <Skeleton className="h-8 w-full rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
