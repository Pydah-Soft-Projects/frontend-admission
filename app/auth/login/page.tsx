'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Home } from 'lucide-react';
import { authAPI, CRM_FRONTEND_URL } from '@/lib/api';
import { auth } from '@/lib/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoginLottie } from '@/components/LoginLottie';
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal';

const loginSchema = z.object({
  email: z.string().min(1, 'Email or Mobile Number is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

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
      const status = err.response?.status;
      const serverMessage = err.response?.data?.message;
      let errorMessage: string;
      if (status === 404) {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        errorMessage = `Backend not reachable (404). Ensure the admissions API is running at ${baseUrl}. Start it with: cd backend-admission && npm run dev`;
      } else if (serverMessage) {
        errorMessage = serverMessage;
      } else {
        errorMessage = err.message || 'Login failed. Please check your credentials and try again.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while verifying SSO token
  if (isVerifying) {
    return (
      <div style={{ backgroundColor: '#f9fafb' }} className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ea580c] mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Show error state if SSO verification failed and no login form should be shown
  if (error && !showLoginForm) {
    return (
      <div style={{ backgroundColor: '#f9fafb' }} className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="text-center relative z-10">
          <div className="max-w-md w-full">
            <Card className="bg-white border border-gray-200 shadow-xl">
              <div className="p-6">
                <p className="text-red-600 mb-4 font-medium">{error}</p>
                <a
                  href={CRM_FRONTEND_URL}
                  className="text-[#ea580c] hover:underline"
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



  
  // Show normal login form: Centered card layout with warm palette matching the image
  return (
    <div className="min-h-screen flex items-center justify-center lg:justify-end relative overflow-hidden bg-[#fdfcfb] px-4 sm:px-12 lg:px-24">
      {/* Background Image with Warm Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/Admission-cell-login-background.jpg"
          alt="Background"
          fill
          priority
          className="object-cover"
        />
        {/* Warm Overlay to match wood and cream tones */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-50/10 via-white/10 to-amber-100/10" />
        <div className="absolute inset-0 bg-black/10" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Card className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-2xl p-6 sm:p-8">
          <Link
            href="/"
            className="absolute top-6 left-6 inline-flex p-2 rounded-full hover:bg-black/5 text-slate-400 hover:text-orange-600 transition-all duration-200 ease-in-out group z-10"
            title="Go to Home"
          >
            <Home className="w-5 h-5 transform group-hover:scale-110" />
          </Link>

          <div className="text-center mb-8 pt-4">
            <h2 className="text-3xl font-bold tracking-tight">
              <span className="text-orange-600">Admissions</span> <span className="text-black">Portal</span>
            </h2>
            <p className="mt-2 text-sm text-slate-600 font-medium">Sign in to your account</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-sm text-red-600 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Email or Mobile Number"
              type="text"
              placeholder="Enter email or mobile number"
              error={errors.email?.message}
              {...register('email')}
              className="bg-white/50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-orange-500/50"
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              error={errors.password?.message}
              {...register('password')}
              className="bg-white/50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-orange-500/50"
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm font-semibold text-orange-600 hover:text-orange-700 hover:underline transition-colors"
              >
                Forgot Password?
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all py-4 text-base font-bold text-white border-none"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </Card>
      </div>

      {/* Bottom accent line - Warm Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-400 to-transparent opacity-60" />

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ backgroundColor: '#f9fafb' }} className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ea580c] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}