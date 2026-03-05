'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { visitorAPI } from '@/lib/api';
import { showToast } from '@/lib/toast';
import {
    User, Phone, RefreshCw, Loader2,
    History, Clock, CheckCircle2, AlertCircle, MapPin,
    Users, Search, ChevronRight, Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function VisitorsPage() {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [visitorData, setVisitorData] = useState<any>(null);
    const [consuming, setConsuming] = useState(false);
    const [recentVisits, setRecentVisits] = useState<any[]>([]);
    const [loadingRecent, setLoadingRecent] = useState(true);

    const [statusFilter, setStatusFilter] = useState('all');

    const fetchRecentVisits = async () => {
        try {
            const response = await visitorAPI.getRecent();
            if (response.success) {
                setRecentVisits(response.data);
            }
        } catch (error) {
            console.error('Error fetching recent visits:', error);
        } finally {
            setLoadingRecent(false);
        }
    };

    useEffect(() => {
        fetchRecentVisits();
    }, []);

    const filteredVisits = recentVisits.filter(visit => {
        if (statusFilter === 'all') return true;
        return visit.status === statusFilter;
    });

    const handleVerify = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!code || code.length !== 6) {
            showToast.error('Please enter a valid 6-digit code');
            return;
        }

        setLoading(true);
        setVisitorData(null);
        try {
            const response = await visitorAPI.verifyCode(code);
            if (response.success) {
                setVisitorData(response.data);
                showToast.success('Code verified successfully');
            } else {
                showToast.error(response.message || 'Invalid or expired code');
            }
        } catch (error: any) {
            showToast.error(error.response?.data?.message || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const handleConsume = async () => {
        if (!visitorData) return;

        setConsuming(true);
        try {
            const response = await visitorAPI.consumeCode(code, visitorData.lead_id);
            if (response.success) {
                showToast.success('Visitor check-in successful! Campus attendance recorded.');
                setVisitorData(null);
                setCode('');
                fetchRecentVisits();
            } else {
                showToast.error(response.message || 'Failed to confirm attendance');
            }
        } catch (error: any) {
            showToast.error(error.response?.data?.message || 'Action failed');
        } finally {
            setConsuming(false);
        }
    };

    return (
        <div className="space-y-10 pb-12">
            {/* Page Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
                        Visitor Verification
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Process on-campus attendance by validating counselor-generated access codes.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        System Live
                    </span>
                </div>
            </div>

            {/* Main Section: Full Width */}
            <div className="space-y-6 w-full">
                {/* Verification Input Card */}
                <Card className="overflow-hidden border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-sm">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="space-y-1">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
                                        <Search className="w-5 h-5" />
                                    </div>
                                    Validate Access Code
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Enter the 6-digit code provided by the student.</p>
                            </div>
                            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded-full border border-slate-100 dark:border-slate-800">
                                <Clock className="w-3 h-3" />
                                24h Windows
                            </div>
                        </div>

                        <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1 relative">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                                    <Hash className="w-5 h-5" />
                                </div>
                                <input
                                    type="text"
                                    maxLength={6}
                                    placeholder="000000"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-full pl-11 pr-4 py-3 text-xl tracking-[0.2em] font-bold rounded-xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 focus:border-orange-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-orange-500/5 outline-none transition-all placeholder:text-slate-200 dark:placeholder:text-slate-800"
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={loading || code.length !== 6}
                                className="h-[52px] sm:w-40 text-base font-bold bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 rounded-xl"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Code'}
                            </Button>
                        </form>

                        <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                            <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
                            <span>Verification codes are single-use only. Expire after 24 hours.</span>
                        </div>
                    </div>
                </Card>

                {/* Visitor Result Card (Conditional) */}
                {visitorData && (
                    <div className="animate-in fade-in slide-in-from-bottom-6 duration-500">
                        <Card className="overflow-hidden border border-emerald-500/20 dark:border-emerald-500/10 bg-white dark:bg-slate-900 shadow-xl">
                            {/* Result Header */}
                            <div className="bg-emerald-50/30 dark:bg-emerald-950/20 p-6 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-emerald-500/20 ring-4 ring-emerald-500/5">
                                            {visitorData.lead_name?.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-widest">
                                                <span className="px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
                                                    {visitorData.current_lead_status}
                                                </span>
                                                <span className="text-slate-400">ID: {visitorData.lead_enquiry_number}</span>
                                            </div>
                                            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{visitorData.lead_name}</h2>
                                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                                                <User className="w-3.5 h-3.5 text-emerald-500" />
                                                Verified Student Profile
                                            </p>
                                        </div>
                                    </div>
                                    <div className="md:text-right bg-white/50 dark:bg-slate-800/50 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Assigned Counselor</p>
                                        <p className="text-xs font-bold text-slate-900 dark:text-slate-300">{visitorData.sender_name}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Result Details */}
                            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Primary Contact</p>
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600">
                                            <Phone className="w-4 h-4" />
                                        </div>
                                        <span className="text-base font-bold text-slate-800 dark:text-slate-200">{visitorData.lead_phone}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Parent Name</p>
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600">
                                            <Users className="w-4 h-4" />
                                        </div>
                                        <span className="text-base font-bold text-slate-800 dark:text-slate-200">{visitorData.lead_father_name || '—'}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Region / City</p>
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-600">
                                            <MapPin className="w-4 h-4" />
                                        </div>
                                        <span className="text-base font-bold text-slate-800 dark:text-slate-200">{visitorData.lead_district || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Action */}
                            <div className="p-6 bg-slate-50/50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Expires: {format(new Date(visitorData.expires_at), 'MMM d, h:mm a')}</span>
                                </div>
                                <Button
                                    onClick={handleConsume}
                                    disabled={consuming}
                                    className="w-full sm:w-auto px-8 h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
                                >
                                    {consuming ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-5 h-5" />
                                            Approve Visit
                                            <ChevronRight className="w-4 h-4 opacity-50" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}
            </div>

            {/* Recent Activity Section - Now Below */}
            <div className="space-y-6">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between px-1">
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold font-display text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600">
                                <History className="w-5 h-5" />
                            </div>
                            Recent Verifications
                        </h2>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-widest pl-1">Historical verification journal</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Status Filters */}
                        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl">
                            {['all', 'used', 'expired', 'active'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={cn(
                                        "px-4 py-1.5 text-xs font-bold rounded-lg transition-all capitalize",
                                        statusFilter === status
                                            ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-600"
                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    )}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={fetchRecentVisits}
                            disabled={loadingRecent}
                            className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-orange-500 hover:border-orange-200 transition-all shadow-sm"
                            title="Refresh database"
                        >
                            <RefreshCw className={cn("w-4 h-4", loadingRecent && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {loadingRecent ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <div key={i} className="h-40 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
                        ))}
                    </div>
                ) : filteredVisits.length === 0 ? (
                    <div className="text-center py-24 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                        <History className="w-16 h-16 mx-auto text-slate-200 dark:text-slate-800 mb-4" />
                        <h3 className="text-lg font-bold text-slate-500">No records match your filter</h3>
                        <p className="text-sm text-slate-400 mt-1">Try switching to a different status or refresh the list.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                        {filteredVisits.map((visit) => (
                            <Card
                                key={visit.id}
                                className="group relative overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800 bg-white dark:bg-slate-900 p-5 transition-all hover:shadow-2xl hover:shadow-indigo-500/5 hover:-translate-y-1"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className={cn(
                                        "w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-inner",
                                        visit.status === 'used'
                                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                                            : visit.status === 'expired'
                                                ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                                                : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400'
                                    )}>
                                        {visit.status === 'used' ? <CheckCircle2 className="w-6 h-6" /> : visit.code}
                                    </div>
                                    <div className={cn(
                                        "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                                        visit.status === 'used'
                                            ? "bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900"
                                            : visit.status === 'expired'
                                                ? "bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900"
                                                : "bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-950/40 dark:border-amber-900"
                                    )}>
                                        {visit.status}
                                    </div>
                                </div>

                                <div className="space-y-1 mb-4">
                                    <h4 className="font-bold text-slate-900 dark:text-slate-100 truncate text-base leading-tight">
                                        {visit.lead_name}
                                    </h4>
                                    <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                                        <User className="w-3 h-3" />
                                        Agent: {visit.sender_name}
                                    </p>
                                </div>

                                <div className="pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-slate-400">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold">{format(new Date(visit.created_at), 'MMM d, h:mm a')}</span>
                                    </div>
                                    <button className="text-slate-300 dark:text-slate-700 hover:text-indigo-500 transition-colors">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
