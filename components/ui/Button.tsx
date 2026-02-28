import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'light';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className,
  disabled,
  ...props
}) => {
  // Flowbite base styles
  const baseStyles = 'font-medium rounded-lg focus:ring-4 focus:outline-none transition-colors duration-200 inline-flex items-center justify-center min-h-[44px] md:min-h-0 cursor-pointer';

  const variants = {
    primary:
      'text-white bg-[#ea580c] hover:bg-[#c2410c] focus:ring-[#fdba74] dark:bg-[#ea580c] dark:hover:bg-[#c2410c] dark:focus:ring-[#9a3412]',
    secondary: // Treated as "Alternative" in Flowbite
      'text-gray-900 bg-white border border-gray-200 hover:bg-gray-100 hover:text-[#ea580c] focus:z-10 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700',
    danger:
      'text-white bg-[#b91c1c] hover:bg-[#991b1b] focus:ring-[#fca5a5] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] dark:focus:ring-[#7f1d1d]',
    outline: // Similar to "Alternative" but often transparent background initially
      'text-[#ea580c] hover:text-white border border-[#ea580c] hover:bg-[#ea580c] focus:ring-[#fdba74] dark:border-[#f97316] dark:text-[#fb923c] dark:hover:text-white dark:hover:bg-[#f97316] dark:focus:ring-[#9a3412]',
    light:
      'text-gray-900 bg-white border border-gray-300 hover:bg-gray-100 focus:ring-gray-100 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:border-gray-600 dark:focus:ring-gray-700',
  } as const;

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
    xl: 'px-6 py-3.5 text-base',
  } as const;

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        (disabled || isLoading) && 'cursor-not-allowed opacity-50',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="w-4 h-4 me-2 animate-spin text-current"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 100 101"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
              fillOpacity="0.2" // Use approximate opacity since inline color
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentColor"
            />
          </svg>
          Loading...
        </>
      ) : (
        children
      )}
    </button>
  );
};
