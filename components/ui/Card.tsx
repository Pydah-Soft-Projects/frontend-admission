import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  title,
  description,
  onClick,
  noPadding = false
}) => {
  return (
    <div
      className={cn(
        'group relative bg-white rounded-2xl border border-slate-200 shadow-sm transition-all duration-300',
        'dark:bg-slate-900 dark:border-slate-700',
        'hover:shadow-md',
        noPadding ? 'p-0' : 'p-6 sm:p-8',
        onClick ? 'cursor-pointer hover:scale-[1.01]' : '',
        className
      )}
      onClick={onClick}
    >
      {(title || description) && (
        <div className={cn("mb-6 space-y-1.5", noPadding && "px-6 pt-6 sm:px-8 sm:pt-8")}>
          {title && (
            <h3 className="text-xl font-bold text-[#0f172a] dark:text-[#f8fafc]">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};
