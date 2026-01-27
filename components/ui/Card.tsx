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
        'group relative bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 ring-1 ring-black/5',
        'dark:bg-slate-900/60 dark:border-slate-800/60 dark:shadow-none dark:ring-white/10',
        'hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-white/90 dark:hover:bg-slate-900/80',
        noPadding ? 'p-0' : 'p-6 sm:p-8',
        onClick ? 'cursor-pointer hover:scale-[1.01]' : '',
        className
      )}
      onClick={onClick}
    >
      {(title || description) && (
        <div className={cn("mb-6 space-y-1.5", noPadding && "px-6 pt-6 sm:px-8 sm:pt-8")}>
          {title && (
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-200 dark:to-slate-300">
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
