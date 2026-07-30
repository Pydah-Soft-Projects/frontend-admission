import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';

const isEmailIdentifier = (value: string) => value.includes('@');

const identifierSchema = z.object({
    identifier: z
        .string()
        .trim()
        .min(1, 'Mobile number or email is required')
        .refine(
            (value) => {
                if (isEmailIdentifier(value)) {
                    return z.string().email().safeParse(value).success;
                }
                return /^\d{10}$/.test(value);
            },
            { message: 'Enter a valid 10-digit mobile number or email address' }
        ),
});

type IdentifierForm = z.infer<typeof identifierSchema>;

interface ForgotPasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
    const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [userName, setUserName] = useState('');
    const [identifier, setIdentifier] = useState('');
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userMobile, setUserMobile] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<IdentifierForm>({ resolver: zodResolver(identifierSchema) });

    const handleClose = () => {
        reset();
        setStep('input');
        setUserName('');
        setIdentifier('');
        setUserEmail(null);
        setUserMobile(null);
        onClose();
    };

    const onSubmitInput = async (data: IdentifierForm) => {
        setIsLoading(true);
        try {
            const response = await authAPI.checkUser(data.identifier);
            const payload = response.data || response;
            setUserName(payload.name || 'User');
            setIdentifier(data.identifier);
            setUserEmail(payload.email || null);
            setUserMobile(payload.mobileNumber || null);
            setStep('confirm');
        } catch (error: any) {
            const msg = error.response?.data?.message || 'User not found';
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const onConfirmReset = async () => {
        setIsLoading(true);
        try {
            await authAPI.resetPasswordDirectly(identifier);
            toast.success('Password reset! Check your SMS and email.');
            setStep('success');
        } catch (error: any) {
            const msg = error.response?.data?.message || 'Failed to reset password';
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const accountLabel = [userMobile, userEmail].filter(Boolean).join(' / ') || identifier;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {step === 'input' && 'Forgot Password'}
                        {step === 'confirm' && 'Confirm Reset'}
                        {step === 'success' && 'Success'}
                    </DialogTitle>
                </DialogHeader>

                {step === 'input' && (
                    <form onSubmit={handleSubmit(onSubmitInput)} className="space-y-4">
                        <div className="text-sm text-gray-500">
                            Enter your registered mobile number or email to find your account.
                        </div>
                        <Input
                            label="Mobile Number or Email"
                            placeholder="e.g. 9876543210 or you@example.com"
                            {...register('identifier')}
                            error={errors.identifier?.message}
                        />
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                            <Button type="submit" isLoading={isLoading}>Find Account</Button>
                        </div>
                    </form>
                )}

                {step === 'confirm' && (
                    <div className="space-y-4">
                        <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-700">
                            Hello, <strong>{userName}</strong>.
                            <br /><br />
                            We found your account linked to <strong>{accountLabel}</strong>.
                            <br />
                            Do you want to reset your password and receive a new one via SMS and email?
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setStep('input')}>Back</Button>
                            <Button onClick={onConfirmReset} isLoading={isLoading}>Yes, Send New Password</Button>
                        </div>
                    </div>
                )}

                {step === 'success' && (
                    <div className="space-y-4">
                        <div className="rounded-md bg-green-50 p-4 text-green-700">
                            <p className="font-semibold">Success!</p>
                            <p className="text-sm mt-1">
                                A new password has been sent
                                {userMobile ? <> to <strong>{userMobile}</strong> via SMS</> : null}
                                {userMobile && userEmail ? ' and' : ''}
                                {userEmail ? <> to <strong>{userEmail}</strong> via email</> : null}
                                {!userMobile && !userEmail ? ' to your registered contact channels' : ''}.
                            </p>
                            <p className="text-sm mt-2">
                                Please check your messages and email, then use the new password to login.
                            </p>
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={handleClose}>Back to Login</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
