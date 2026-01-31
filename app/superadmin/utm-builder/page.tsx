'use client';

import { useState, useMemo, useEffect } from 'react';
import { utmAPI, formBuilderAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

// Copy Icon
const CopyIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

// Link Icon
const LinkIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
    />
  </svg>
);

// Click Timeline Chart Component
const UrlClickTimelineChart = ({ clicks }: { clicks: Array<{ clickedAt: string }> }) => {
  // Group clicks by date
  const chartData = useMemo(() => {
    const clicksByDate = new Map<string, number>();
    
    clicks.forEach((click) => {
      const date = new Date(click.clickedAt);
      const dateKey = date.toISOString().split('T')[0]; // Use YYYY-MM-DD format for proper sorting
      clicksByDate.set(dateKey, (clicksByDate.get(dateKey) || 0) + 1);
    });

    // Convert to array and sort by date
    return Array.from(clicksByDate.entries())
      .map(([dateKey, count]) => {
        const date = new Date(dateKey);
        return {
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          dateKey,
          clicks: count,
        };
      })
      .sort((a, b) => new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime());
  }, [clicks]);

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            tick={{ fill: '#64748b', fontSize: 12 }}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fill: '#64748b', fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          />
          <Line
            type="monotone"
            dataKey="clicks"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default function UtmBuilderPage() {
  const [formData, setFormData] = useState({
    baseUrl: typeof window !== 'undefined' ? `${window.location.origin}/lead-form` : '',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    utmTerm: '',
    utmContent: '',
    useMeaningfulCode: true,
    expiresAt: '',
    influencerName: '',
  });

  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [shortUrl, setShortUrl] = useState('');
  const [currentUrlId, setCurrentUrlId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isShortening, setIsShortening] = useState(false);
  
  // Analytics modal state
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [selectedUrlId, setSelectedUrlId] = useState<string | null>(null);

  // Fetch forms for selection
  const { data: formsData } = useQuery({
    queryKey: ['form-builder', 'forms'],
    queryFn: async () => {
      const response = await formBuilderAPI.listForms({ showInactive: false });
      return response;
    },
  });

  const forms = useMemo(() => {
    const payload = formsData?.data;
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && Array.isArray((payload as any).data)) {
      return (payload as any).data;
    }
    return [];
  }, [formsData]);

  // Fetch selected form details with fields for validation
  const { data: selectedFormData } = useQuery({
    queryKey: ['form-builder', 'form', selectedFormId],
    queryFn: async () => {
      if (!selectedFormId) return null;
      const response = await formBuilderAPI.getForm(selectedFormId, { includeFields: true, showInactive: false });
      return response;
    },
    enabled: !!selectedFormId,
  });

  const selectedForm = useMemo(() => {
    if (!selectedFormData?.data) return null;
    return selectedFormData.data;
  }, [selectedFormData]);

  // Set default form as selected by default
  useEffect(() => {
    if (forms.length > 0 && !selectedFormId) {
      const defaultForm = forms.find((form: any) => form.isDefault);
      if (defaultForm) {
        setSelectedFormId(defaultForm._id);
      }
    }
  }, [forms, selectedFormId]);

  // Validation function to check if form has required fields
  const validateFormFields = (): { isValid: boolean; error?: string } => {
    if (!selectedFormId) {
      return { isValid: false, error: 'Please select a form' };
    }

    if (!selectedForm?.fields || selectedForm.fields.length === 0) {
      return { isValid: false, error: 'Selected form has no fields. Please add fields to the form first.' };
    }

    const fields = selectedForm.fields;
    const fieldNames = fields.map((f: any) => f.fieldName?.toLowerCase() || '');

    // Check for student name field (case-insensitive)
    const nameFieldVariations = ['name', 'fullname', 'full_name', 'studentname', 'student_name', 'full name', 'student name'];
    const hasNameField = fieldNames.some((name: string) => 
      nameFieldVariations.some(variation => name.includes(variation))
    );

    // Check for primary phone number field (case-insensitive)
    const phoneFieldVariations = ['phone', 'phonenumber', 'phone_number', 'mobile', 'mobilenumber', 'mobile_number', 'contactnumber', 'contact_number', 'primaryphone', 'primary_phone', 'phone number', 'mobile number', 'contact number', 'primary phone'];
    const hasPhoneField = fieldNames.some((name: string) => 
      phoneFieldVariations.some(variation => name.includes(variation))
    );

    if (!hasNameField) {
      return { 
        isValid: false, 
        error: 'Selected form must have a student name field. Please add a field with name containing "name" (e.g., "Name", "Full Name", "Student Name").' 
      };
    }

    if (!hasPhoneField) {
      return { 
        isValid: false, 
        error: 'Selected form must have a primary phone number field. Please add a field with name containing "phone" or "mobile" (e.g., "Phone", "Phone Number", "Mobile", "Contact Number").' 
      };
    }

    return { isValid: true };
  };
  
  // Fetch analytics data when modal is open
  const { data: analyticsData, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ['urlAnalytics', selectedUrlId],
    queryFn: () => utmAPI.getUrlAnalytics(selectedUrlId!),
    enabled: showAnalyticsModal && !!selectedUrlId,
  });

  // Get all URLs (including long URLs without short codes)
  const { data: shortUrlsData, refetch: refetchShortUrls } = useQuery({
    queryKey: ['shortUrls'],
    queryFn: () => utmAPI.getAllShortUrls(1, 50),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleBuildUrl = async () => {
    if (!formData.baseUrl) {
      showToast.error('Base URL is required');
      return;
    }

    if (isInfluencerSelected && !formData.influencerName.trim()) {
      showToast.error('Please enter influencer name');
      return;
    }

    // Validate form has required fields
    const validation = validateFormFields();
    if (!validation.isValid) {
      showToast.error(validation.error || 'Form validation failed');
      return;
    }

    setIsGenerating(true);
    try {
      // Format influencer source with name
      let finalSource = formData.utmSource;
      if (isInfluencerSelected && formData.influencerName.trim()) {
        const nameSlug = formData.influencerName.trim().toLowerCase().replace(/\s+/g, '-');
        finalSource = `${nameSlug}-influencer`;
      }

      const response = await utmAPI.buildUrl({
        baseUrl: formData.baseUrl,
        utmSource: finalSource || undefined,
        utmMedium: formData.utmMedium || undefined,
        utmCampaign: formData.utmCampaign || undefined,
        utmTerm: formData.utmTerm || undefined,
        utmContent: formData.utmContent || undefined,
        formId: selectedFormId || undefined,
      });

      const url = response.data?.url || response.url;
      const urlId = response.data?.urlId || response.urlId;
      setGeneratedUrl(url);
      setCurrentUrlId(urlId);
      refetchShortUrls(); // Refresh the list
      showToast.success('UTM URL generated and saved successfully!');
    } catch (error: any) {
      showToast.error(error.response?.data?.message || 'Failed to generate UTM URL');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShortenUrl = async () => {
    if (!formData.baseUrl) {
      showToast.error('Base URL is required');
      return;
    }

    if (isInfluencerSelected && !formData.influencerName.trim()) {
      showToast.error('Please enter influencer name');
      return;
    }

    // Validate form has required fields
    const validation = validateFormFields();
    if (!validation.isValid) {
      showToast.error(validation.error || 'Form validation failed');
      return;
    }

    setIsShortening(true);
    try {
      // Format influencer source with name
      let finalSource = formData.utmSource;
      if (isInfluencerSelected && formData.influencerName.trim()) {
        const nameSlug = formData.influencerName.trim().toLowerCase().replace(/\s+/g, '-');
        finalSource = `${nameSlug}-influencer`;
      }

      const response = await utmAPI.shortenUrl({
        baseUrl: formData.baseUrl,
        utmSource: finalSource || undefined,
        utmMedium: formData.utmMedium || undefined,
        utmCampaign: formData.utmCampaign || undefined,
        utmTerm: formData.utmTerm || undefined,
        utmContent: formData.utmContent || undefined,
        formId: selectedFormId || undefined,
        useMeaningfulCode: formData.useMeaningfulCode,
        expiresAt: formData.expiresAt || undefined,
      });

      const short = response.data?.shortUrl || response.shortUrl;
      const original = response.data?.originalUrl || response.originalUrl;
      setShortUrl(short);
      setGeneratedUrl(original);
      refetchShortUrls(); // Refresh the list
      showToast.success('Short URL created successfully!');
    } catch (error: any) {
      showToast.error(error.response?.data?.message || 'Failed to create short URL');
    } finally {
      setIsShortening(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    showToast.success(`${type} copied to clipboard!`);
  };

  // Comprehensive UTM Mediums
  const utmMediums = [
    'cpc',
    'paid_search',
    'shopping',
    'display',
    'paid_social',
    'paid_video',
    'paid_audio',
    'programmatic',
    'remarketing',
    'social',
    'email',
    'sms',
    'push',
    'in_app',
    'notification',
    'community',
    'blog',
    'affiliate',
    'influencer',
    'partner',
    'referral',
    'print',
    'qr',
    'tv',
    'radio',
    'out_of_home',
    'direct_mail',
    'event',
    'conference',
    'internal',
    'api',
    'widget',
    'linkinbio',
    'landing_page',
  ];

  // Comprehensive UTM Sources
  const utmSources = [
    'google',
    'meta',
    'facebook',
    'instagram',
    'tiktok',
    'linkedin',
    'youtube',
    'twitter',
    'reddit',
    'pinterest',
    'bing',
    'newsletter',
    'crm',
    'klaviyo',
    'mailchimp',
    'partner_name',
    'influencer_name',
  ];

  const isInfluencerSelected = formData.utmSource === 'influencer_name' || formData.utmSource === 'influencer';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">UTM URL Builder</h1>
        <p className="mt-2 text-gray-600 dark:text-slate-400">
          Generate UTM-tracked URLs for your marketing campaigns. Track leads from different platforms like Facebook, Instagram, Twitter, Google, and more.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* UTM Builder Form */}
        <Card>
          <h2 className="text-xl font-semibold mb-4">Build UTM URL</h2>
          <div className="space-y-4">
            <div>
              <Input
                label="Base URL *"
                name="baseUrl"
                value={formData.baseUrl}
                onChange={handleChange}
                placeholder="https://yoursite.com/lead-form"
                required
              />
              <p className="text-xs text-gray-500 mt-1">The base URL where your lead form is located</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Select Form (Required)
              </label>
              <select
                value={selectedFormId}
                onChange={(e) => setSelectedFormId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Select a form</option>
                {forms.map((form: any) => (
                  <option key={form._id} value={form._id}>
                    {form.name} {form.isDefault && '(Default)'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                The selected form will be used when this UTM URL is accessed. Form must include a student name field and a primary phone number field.
              </p>
              {selectedFormId && selectedForm && (
                <div className="mt-2 text-xs">
                  {(() => {
                    const validation = validateFormFields();
                    if (validation.isValid) {
                      return (
                        <div className="text-green-600 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Form validation passed: Contains student name and phone number fields
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-red-600 flex items-start gap-1">
                          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{validation.error}</span>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                UTM Source *
              </label>
              <select
                name="utmSource"
                value={formData.utmSource}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Select source...</option>
                {utmSources.map((source) => (
                  <option key={source} value={source}>
                    {source.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </option>
                ))}
              </select>
              {isInfluencerSelected && (
                <div className="mt-2">
                  <Input
                    label="Influencer Name *"
                    name="influencerName"
                    value={formData.influencerName}
                    onChange={handleChange}
                    placeholder="e.g., Ravi"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Will be formatted as: ravi-influencer</p>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">The referrer (e.g., facebook, google, newsletter)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                UTM Medium *
              </label>
              <select
                name="utmMedium"
                value={formData.utmMedium}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Select medium...</option>
                {utmMediums.map((medium) => (
                  <option key={medium} value={medium}>
                    {medium.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Marketing medium (e.g., cpc, social, email)</p>
            </div>

            <div>
              <Input
                label="UTM Campaign *"
                name="utmCampaign"
                value={formData.utmCampaign}
                onChange={handleChange}
                placeholder="e.g., summer-2024, admission-drive"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Campaign name (e.g., summer-2024, admission-drive)</p>
            </div>

            <div>
              <Input
                label="UTM Term (Optional)"
                name="utmTerm"
                value={formData.utmTerm}
                onChange={handleChange}
                placeholder="e.g., engineering, medical"
              />
              <p className="text-xs text-gray-500 mt-1">Keywords for paid search</p>
            </div>

            <div>
              <Input
                label="UTM Content (Optional)"
                name="utmContent"
                value={formData.utmContent}
                onChange={handleChange}
                placeholder="e.g., banner-ad, text-link"
              />
              <p className="text-xs text-gray-500 mt-1">Differentiate similar content/links</p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleBuildUrl}
                disabled={isGenerating || !formData.baseUrl || !formData.utmSource || !formData.utmMedium || !formData.utmCampaign}
                variant="primary"
                className="flex-1"
              >
                {isGenerating ? 'Generating...' : 'Generate URL'}
              </Button>
              <Button
                onClick={handleShortenUrl}
                disabled={isShortening || !formData.baseUrl || !formData.utmSource || !formData.utmMedium || !formData.utmCampaign}
                variant="primary"
                className="flex-1"
              >
                {isShortening ? 'Shortening...' : 'Shorten URL'}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="useMeaningfulCode"
                checked={formData.useMeaningfulCode}
                onChange={handleChange}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label className="text-sm text-gray-700 dark:text-slate-300">
                Use meaningful short code (e.g., campaign-medium-abc123)
              </label>
            </div>
          </div>
        </Card>

        {/* Generated URLs */}
        <Card>
          <h2 className="text-xl font-semibold mb-4">Generated URLs</h2>
          <div className="space-y-4">
            {/* Current Generated URLs */}
            {generatedUrl && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Full UTM URL
                </label>
                <div className="flex gap-2">
                  <Input
                    value={generatedUrl}
                    readOnly
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    onClick={() => copyToClipboard(generatedUrl, 'URL')}
                    variant="outline"
                    className="whitespace-nowrap flex items-center gap-1"
                  >
                    <CopyIcon className="w-4 h-4" />
                    Copy
                  </Button>
                </div>
              </div>
            )}

            {shortUrl && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Short URL
                </label>
                <div className="flex gap-2">
                  <Input
                    value={shortUrl}
                    readOnly
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    onClick={() => copyToClipboard(shortUrl, 'Short URL')}
                    variant="outline"
                    className="whitespace-nowrap flex items-center gap-1"
                  >
                    <CopyIcon className="w-4 h-4" />
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This short URL redirects to the full UTM URL with all parameters preserved.
                </p>
              </div>
            )}

            {!generatedUrl && !shortUrl && (
              <div className="text-center py-4 text-gray-500">
                <p>Generate or shorten a URL to see it here</p>
              </div>
            )}

            {/* Previous URLs Section - Inside Generated URLs Card */}
            {shortUrlsData?.data?.shortUrls && shortUrlsData.data.shortUrls.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" />
                  Previous URLs
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700">
                        <th className="text-left py-2 px-3">Campaign</th>
                        <th className="text-left py-2 px-3">Source</th>
                        <th className="text-left py-2 px-3">Medium</th>
                        <th className="text-left py-2 px-3">Clicks</th>
                        <th className="text-left py-2 px-3">Created</th>
                        <th className="text-left py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shortUrlsData.data.shortUrls.map((url: any) => (
                        <tr
                          key={url._id}
                          className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedUrlId(url._id);
                            setShowAnalyticsModal(true);
                          }}
                        >
                          <td className="py-2 px-3 font-medium">{url.utmCampaign || '-'}</td>
                          <td className="py-2 px-3">{url.utmSource || '-'}</td>
                          <td className="py-2 px-3">{url.utmMedium || '-'}</td>
                          <td className="py-2 px-3">
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              {url.clickCount || 0}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            {new Date(url.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                onClick={() => copyToClipboard(url.originalUrl, 'Full URL')}
                                variant="outline"
                                className="p-1.5 text-xs"
                                title="Copy Full URL"
                              >
                                <CopyIcon className="w-3.5 h-3.5" />
                              </Button>
                              {url.shortUrl && (
                                <Button
                                  onClick={() => copyToClipboard(url.shortUrl, 'Short URL')}
                                  variant="outline"
                                  className="p-1.5 text-xs"
                                  title="Copy Short URL"
                                >
                                  <LinkIcon className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Short URLs List - Only URLs with short codes */}
      {shortUrlsData?.data?.shortUrls && shortUrlsData.data.shortUrls.filter((url: any) => url.shortCode).length > 0 && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">Recent Short URLs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="text-left py-2 px-4">Short URL</th>
                  <th className="text-left py-2 px-4">Campaign</th>
                  <th className="text-left py-2 px-4">Source</th>
                  <th className="text-left py-2 px-4">Medium</th>
                  <th className="text-left py-2 px-4">Clicks</th>
                  <th className="text-left py-2 px-4">Created</th>
                  <th className="text-left py-2 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shortUrlsData.data.shortUrls
                  .filter((url: any) => url.shortCode)
                  .map((url: any) => (
                    <tr key={url._id} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-4 font-mono text-xs">{url.shortUrl}</td>
                      <td className="py-2 px-4">{url.utmCampaign || '-'}</td>
                      <td className="py-2 px-4">{url.utmSource || '-'}</td>
                      <td className="py-2 px-4">{url.utmMedium || '-'}</td>
                      <td className="py-2 px-4">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {url.clickCount || 0}
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        {new Date(url.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-4">
                        <Button
                          onClick={() => copyToClipboard(url.shortUrl, 'URL')}
                          variant="outline"
                          className="text-xs flex items-center gap-1"
                        >
                          <CopyIcon className="w-3 h-3" />
                          Copy
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Analytics Modal */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">URL Analytics</h2>
                <button
                  onClick={() => {
                    setShowAnalyticsModal(false);
                    setSelectedUrlId(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {isLoadingAnalytics ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="mt-4 text-gray-600 dark:text-slate-400">Loading analytics...</p>
                </div>
              ) : analyticsData?.data ? (
                <div className="space-y-6">
                  {/* URL Details */}
                  <Card>
                    <h3 className="text-lg font-semibold mb-4">URL Details</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-600 dark:text-slate-400">Full URL</label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={analyticsData.data.url.originalUrl}
                            readOnly
                            className="flex-1 font-mono text-sm"
                          />
                          <Button
                            onClick={() => copyToClipboard(analyticsData.data.url.originalUrl, 'URL')}
                            variant="outline"
                            className="flex items-center gap-1"
                          >
                            <CopyIcon className="w-4 h-4" />
                            Copy
                          </Button>
                        </div>
                      </div>
                      {analyticsData.data.url.shortUrl && (
                        <div>
                          <label className="text-sm font-medium text-gray-600 dark:text-slate-400">Short URL</label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              value={analyticsData.data.url.shortUrl}
                              readOnly
                              className="flex-1 font-mono text-sm"
                            />
                            <Button
                              onClick={() => copyToClipboard(analyticsData.data.url.shortUrl, 'Short URL')}
                              variant="outline"
                              className="flex items-center gap-1"
                            >
                              <CopyIcon className="w-4 h-4" />
                              Copy
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-slate-400">Campaign</label>
                          <p className="text-sm font-medium">{analyticsData.data.url.utmCampaign || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-slate-400">Source</label>
                          <p className="text-sm font-medium">{analyticsData.data.url.utmSource || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-slate-400">Medium</label>
                          <p className="text-sm font-medium">{analyticsData.data.url.utmMedium || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-slate-400">Created</label>
                          <p className="text-sm font-medium">
                            {new Date(analyticsData.data.url.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">Total Clicks</p>
                        <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                          {analyticsData.data.analytics.totalClicks}
                        </p>
                      </div>
                    </Card>
                    <Card>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">Average Clicks Per Day</p>
                        <p className="text-4xl font-bold text-green-600 dark:text-green-400">
                          {analyticsData.data.analytics.totalClicks > 0
                            ? (
                                analyticsData.data.analytics.totalClicks /
                                Math.max(
                                  1,
                                  Math.ceil(
                                    (new Date().getTime() - new Date(analyticsData.data.url.createdAt).getTime()) /
                                      (1000 * 60 * 60 * 24)
                                  )
                                )
                              ).toFixed(2)
                            : '0.00'}
                        </p>
                      </div>
                    </Card>
                    <Card>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">Clicks Today</p>
                        <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">
                          {analyticsData.data.analytics.clicksToday}
                        </p>
                      </div>
                    </Card>
                    <Card>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">Clicks This Week</p>
                        <p className="text-4xl font-bold text-orange-600 dark:text-orange-400">
                          {analyticsData.data.analytics.clicksThisWeek}
                        </p>
                      </div>
                    </Card>
                  </div>

                  {/* Timeline Chart */}
                  {analyticsData.data.clicks && analyticsData.data.clicks.length > 0 && (
                    <Card>
                      <h3 className="text-lg font-semibold mb-4">Click Timeline</h3>
                      <UrlClickTimelineChart clicks={analyticsData.data.clicks} />
                    </Card>
                  )}

                  {(!analyticsData.data.clicks || analyticsData.data.clicks.length === 0) && (
                    <Card>
                      <div className="text-center py-8 text-gray-500">
                        <p>No clicks recorded yet</p>
                      </div>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>Failed to load analytics data</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

