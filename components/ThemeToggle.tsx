'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/app/providers';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Render a placeholder during SSR to prevent hydration mismatch
  if (!mounted) {
    return (
      <label className="relative inline-flex items-center cursor-pointer group">
        <input
          type="checkbox"
          checked={false}
          onChange={() => {}}
          className="sr-only"
          aria-label="Toggle theme"
          disabled
        />
        <div className="relative w-14 h-7 rounded-full transition-colors duration-300 bg-gray-200">
          <div className="absolute top-[2px] left-[2px] h-6 w-6 bg-white rounded-full shadow-md transition-transform duration-300 ease-in-out translate-x-0" />
          <svg
            className="absolute top-1/2 left-1 w-4 h-4 -translate-y-1/2 transition-opacity duration-300 text-yellow-500 opacity-100"
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
              clipRule="evenodd"
            />
          </svg>
          <svg
            className="absolute top-1/2 right-1 w-4 h-4 -translate-y-1/2 transition-opacity duration-300 text-orange-200 opacity-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        </div>
        <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
          Light
        </span>
      </label>
    );
  }

  const isDark = theme === 'dark';

  return (
    <label className="relative inline-flex items-center cursor-pointer group">
      <input
        type="checkbox"
        checked={isDark}
        onChange={toggleTheme}
        className="sr-only"
        aria-label="Toggle theme"
      />
      <div
        className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
          isDark ? 'bg-orange-600' : 'bg-gray-200'
        }`}
      >
        {/* Toggle Button */}
        <div
          className={`absolute top-[2px] left-[2px] h-6 w-6 bg-white rounded-full shadow-md transition-transform duration-300 ease-in-out ${
            isDark ? 'translate-x-7' : 'translate-x-0'
          }`}
        />
        {/* Sun Icon */}
        <svg
          className={`absolute top-1/2 left-1 w-4 h-4 -translate-y-1/2 transition-opacity duration-300 text-yellow-500 ${
            isDark ? 'opacity-0' : 'opacity-100'
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            clipRule="evenodd"
          />
        </svg>
        {/* Moon Icon */}
        <svg
          className={`absolute top-1/2 right-1 w-4 h-4 -translate-y-1/2 transition-opacity duration-300 text-orange-200 ${
            isDark ? 'opacity-100' : 'opacity-0'
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      </div>
      <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
        {isDark ? 'Dark' : 'Light'}
      </span>
    </label>
  );
};
