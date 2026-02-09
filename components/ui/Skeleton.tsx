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

