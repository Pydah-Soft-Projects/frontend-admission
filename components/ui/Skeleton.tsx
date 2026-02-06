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

// Lead card skeleton (for My Leads card grid) — compact on mobile
export const LeadCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-2 sm:space-y-3", className)}>
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1 sm:space-y-1.5 flex-1 min-w-0">
          <Skeleton variant="rectangular" height="8px" className="w-14 sm:w-16 rounded" />
          <Skeleton variant="rectangular" height="12px" className="w-20 sm:w-24 rounded" />
        </div>
        <Skeleton variant="rectangular" height="16px" className="w-12 sm:w-16 rounded-full shrink-0" />
      </div>
      <div className="space-y-1.5 sm:space-y-2 pt-1.5 sm:pt-2">
        <div className="flex justify-between gap-2">
          <Skeleton variant="text" className="w-10 sm:w-12 h-2.5 sm:h-3 rounded" />
          <Skeleton variant="text" className="w-20 sm:w-24 h-2.5 sm:h-3 rounded flex-1 max-w-[60%]" />
        </div>
        <div className="flex justify-between gap-2">
          <Skeleton variant="text" className="w-12 sm:w-14 h-2.5 sm:h-3 rounded" />
          <Skeleton variant="text" className="w-16 sm:w-20 h-2.5 sm:h-3 rounded flex-1 max-w-[50%]" />
        </div>
        <div className="flex justify-between gap-2">
          <Skeleton variant="text" className="w-10 sm:w-12 h-2.5 sm:h-3 rounded" />
          <Skeleton variant="text" className="w-14 sm:w-16 h-2.5 sm:h-3 rounded flex-1 max-w-[40%]" />
        </div>
      </div>
      <div className="flex gap-1.5 sm:gap-2 pt-1.5 sm:pt-2">
        <Skeleton variant="rectangular" height="28px" className="w-14 sm:w-20 rounded-lg" />
        <Skeleton variant="rectangular" height="28px" className="w-16 sm:w-24 rounded-lg" />
      </div>
    </div>
  );
};

