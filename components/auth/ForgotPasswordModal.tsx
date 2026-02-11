import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';

// Mobile Number Schema
const mobileSchema = z.object({
    mobileNumber: z
        .string()
        .length(10, 'Mobile number must be exactly 10 digits')
        .regex(/^\d+$/, 'Mobile number must contain only digits'),
});

type MobileForm = z.infer<typeof mobileSchema>;

interface ForgotPasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
    const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [userName, setUserName] = useState('');
    const [mobile, setMobile] = useState('');

    // Form
    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<MobileForm>({ resolver: zodResolver(mobileSchema) });

    const handleClose = () => {
        reset();
        setStep('input');
        onClose();
    };

    // Step 1: Check User
    const onSubmitInput = async (data: MobileForm) => {
        setIsLoading(true);
        try {
            const response = await authAPI.checkUser(data.mobileNumber);
            const { name } = response.data || response; // Handle Axios structure
            setUserName(name || 'User');
            setMobile(data.mobileNumber);
            setStep('confirm');
        } catch (error: any) {
            const msg = error.response?.data?.message || 'User not found';
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2: Confirm & Reset
    const onConfirmReset = async () => {
        setIsLoading(true);
        try {
            await authAPI.resetPasswordDirectly(mobile);
            toast.success('Password reset! Check your SMS.');
            setStep('success');
        } catch (error: any) {
            const msg = error.response?.data?.message || 'Failed to reset password';
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

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

                {/* Step 1: Input Mobile */}
                {step === 'input' && (
                    <form onSubmit={handleSubmit(onSubmitInput)} className="space-y-4">
                        <div className="text-sm text-gray-500">
                            Enter your registered mobile number to find your account.
                        </div>
                        <Input
                            label="Mobile Number"
                            placeholder="e.g. 9876543210"
                            {...register('mobileNumber')}
                            error={errors.mobileNumber?.message}
                        />
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                            <Button type="submit" isLoading={isLoading}>Find Account</Button>
                        </div>
                    </form>
                )}

                {/* Step 2: Confirm User */}
                {step === 'confirm' && (
                    <div className="space-y-4">
                        <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-700">
                            Hello, <strong>{userName}</strong>.
                            <br /><br />
                            We found your account linked to <strong>{mobile}</strong>.
                            <br />
                            Do you want to reset your password and receive a new one via SMS?
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setStep('input')}>Back</Button>
                            <Button onClick={onConfirmReset} isLoading={isLoading}>Yes, Send New Password</Button>
                        </div>
                    </div>
                )}

                {/* Step 3: Success */}
                {step === 'success' && (
                    <div className="space-y-4">
                        <div className="rounded-md bg-green-50 p-4 text-green-700">
                            <p className="font-semibold">Success!</p>
                            <p className="text-sm mt-1">
                                A new password has been sent to <strong>{mobile}</strong> via SMS.
                            </p>
                            <p className="text-sm mt-2">
                                Please check your messages and use the new password to login.
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
