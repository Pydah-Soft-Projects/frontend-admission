'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { authAPI, CRM_FRONTEND_URL } from '@/lib/api';
import { auth } from '@/lib/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemeToggle } from '@/components/ThemeToggle';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Check for SSO token in URL on mount
  useEffect(() => {
    const token = searchParams.get('token');
    
    if (token) {
      // SSO token found - handle SSO login
      handleSSOLogin(token);
    } else {
      // No token - show normal login form
      setShowLoginForm(true);
    }
  }, [searchParams]);

  // Handle SSO login flow
  async function handleSSOLogin(encryptedToken: string) {
    setIsVerifying(true);
    setError(null);

    try {
      // Step 1: Verify token with CRM backend
      const verifyResult = await authAPI.verifySSOToken(encryptedToken);

      if (!verifyResult.success || !verifyResult.valid) {
        throw new Error(verifyResult.message || 'Token validation failed');
      }

      const { userId, role, portalId, expiresAt } = verifyResult.data;

      // Step 2: Check token expiry
      const expiryTime = new Date(expiresAt).getTime();
      if (Date.now() >= expiryTime) {
        throw new Error('Token has expired');
      }

      // Step 3: Create local session via admissions backend
      const sessionData = await authAPI.createSSOSession({
        userId,
        role,
        portalId,
        ssoToken: encryptedToken,
      });

      if (!sessionData.success) {
        throw new Error(sessionData.message || 'Failed to create session');
      }

      const { token, user } = sessionData.data || sessionData;

      if (!token || !user) {
        throw new Error('Invalid session data received');
      }

      // Step 4: Store session
      auth.setAuth(token, user);

      // Step 5: Redirect based on role
      if (user.roleName === 'Super Admin' || user.roleName === 'Sub Super Admin') {
        router.push('/superadmin/dashboard');
      } else if (user.roleName === 'Data Entry User') {
        router.push('/superadmin/leads/individual');
      } else if (user.isManager) {
        router.push('/manager/dashboard');
      } else {
        router.push('/user/dashboard');
      }

    } catch (err: any) {
      console.error('SSO login error:', err);
      setError(err.message || 'SSO authentication failed. Please try logging in manually.');
      setShowLoginForm(true);
      // Remove token from URL
      router.replace('/auth/login');
    } finally {
      setIsVerifying(false);
    }
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authAPI.login(data);

      // Backend returns: { success: true, message: '...', data: { token, user } }
      // Axios extracts response.data, so we get: { success: true, message: '...', data: { token, user } }
      const responseData = response.data || response;
      const token = responseData.token || responseData.data?.token;
      const user = responseData.user || responseData.data?.user;

      if (!token || !user) {
        console.error('Invalid response structure:', response);
        setError('Invalid response from server. Please try again.');
        return;
      }

      // Set auth data
      auth.setAuth(token, user);

      // Redirect based on role
      if (user.roleName === 'Super Admin' || user.roleName === 'Sub Super Admin') {
        router.push('/superadmin/dashboard');
      } else if (user.roleName === 'Data Entry User') {
        router.push('/superadmin/leads/individual');
      } else if (user.isManager) {
        router.push('/manager/dashboard');
      } else {
        router.push('/user/dashboard');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      console.error('Error response:', err.response);
      const errorMessage = err.response?.data?.message ||
        err.message ||
        'Login failed. Please check your credentials and try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while verifying SSO token
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:bg-gradient-to-br dark:from-slate-950/80 dark:via-slate-900/70 dark:to-slate-900/80"></div>
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-300">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Show error state if SSO verification failed and no login form should be shown
  if (error && !showLoginForm) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:bg-gradient-to-br dark:from-slate-950/80 dark:via-slate-900/70 dark:to-slate-900/80"></div>
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>
        <div className="text-center relative z-10">
          <div className="max-w-md w-full">
            <Card className="backdrop-blur-xl bg-white/90 dark:bg-slate-900/70 border-gray-300/50 dark:border-slate-700/70 shadow-2xl">
              <div className="p-6">
                <p className="text-red-600 dark:text-red-400 mb-4 font-medium">{error}</p>
                <a 
                  href={CRM_FRONTEND_URL}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Return to CRM Portal
                </a>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Show normal login form
  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 bg-linear-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:bg-linear-to-br dark:from-slate-950/80 dark:via-slate-900/70 dark:to-slate-900/80"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200/20 dark:bg-blue-900/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-200/20 dark:bg-purple-900/20 rounded-full blur-3xl"></div>

      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="max-w-md w-full relative z-10">
        <Card className="backdrop-blur-xl bg-white/90 dark:bg-slate-900/70 border-gray-300/50 dark:border-slate-700/70 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-slate-100">Lead Tracker</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">Sign in to your account</p>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-linear-to-r from-red-50 to-red-100/50 dark:from-rose-900/30 dark:to-rose-900/20 border-2 border-red-200 dark:border-rose-700/50 rounded-xl shadow-sm animate-pulse">
              <p className="text-sm text-red-700 dark:text-rose-200 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="Enter your email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full group"
            >
              <span className="group-hover:scale-105 transition-transform inline-block">
                {isLoading ? 'Signing In...' : 'Sign In'}
              </span>
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:bg-gradient-to-br dark:from-slate-950/80 dark:via-slate-900/70 dark:to-slate-900/80"></div>
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-300">Loading...</p>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}