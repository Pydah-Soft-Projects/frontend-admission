'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { joiningAPI } from '@/lib/api';
import { parseJoiningPublicLinkFromApiResponse } from '@/lib/joiningInviteLink';
import { Button } from '@/components/ui/Button';
import { escapePrintHtml, printHtmlDocument } from '@/lib/printHtml';
import { showToast } from '@/lib/toast';

export const SELF_REG_LINK_QUERY_KEY = ['self-registration', 'public-link'] as const;

type Props = {
  showRegenerate?: boolean;
  showPrint?: boolean;
};

function buildSelfRegistrationPrintHtml(url: string, qrSrc: string) {
  const safeQrSrc = qrSrc.replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Self Registration QR</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 210mm;
      min-height: 297mm;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #0f172a;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .a4-page {
      width: 210mm;
      min-height: 297mm;
      padding: 16mm 14mm 18mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 7mm;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
    .title {
      margin: 0;
      font-size: 28pt;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: #1e3a8a;
      line-height: 1.2;
    }
    .subtitle {
      margin: 0;
      font-size: 14pt;
      font-weight: 500;
      color: #475569;
      max-width: 170mm;
      line-height: 1.45;
    }
    .qr-frame {
      margin: 4mm 0;
      padding: 6mm;
      border: 2px solid #1e3a8a;
      border-radius: 4mm;
      background: #fff;
    }
    .qr-frame img {
      display: block;
      width: 130mm;
      height: 130mm;
      max-width: 100%;
      object-fit: contain;
    }
    .scan-hint {
      margin: 0;
      font-size: 12pt;
      font-weight: 600;
      color: #334155;
    }
    .url-label {
      margin: 0;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .url {
      margin: 0;
      font-size: 10pt;
      line-height: 1.5;
      word-break: break-all;
      color: #1e293b;
      max-width: 175mm;
    }
    @media print {
      html, body {
        width: 210mm;
        height: 297mm;
      }
      .a4-page {
        height: 297mm;
        min-height: 297mm;
      }
    }
  </style>
</head>
<body>
  <div class="a4-page">
    <h1 class="title">Self Registration</h1>
    <p class="subtitle">Scan the QR code below to open the online application (Step 1)</p>
    <div class="qr-frame">
      <img src="${safeQrSrc}" alt="Self registration QR code" />
    </div>
    <p class="scan-hint">Scan with your phone camera to apply online</p>
    <p class="url-label">Or open this link</p>
    <p class="url">${escapePrintHtml(url)}</p>
  </div>
</body>
</html>`;
}

/** Print via hidden iframe (no pop-up) after the QR image is cached. */
function printSelfRegistrationQr(url: string) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(url)}`;
  const html = buildSelfRegistrationPrintHtml(url, qrSrc);

  let printed = false;
  const runPrint = () => {
    if (printed) return;
    printed = true;
    printHtmlDocument(html, 'Self Registration QR', undefined, { deferPrintMs: 900 });
  };

  const img = new Image();
  img.onload = runPrint;
  img.onerror = () => {
    showToast.error('Could not load the QR image. Check your network and try again.');
  };
  img.src = qrSrc;

  if (img.complete) {
    runPrint();
    return;
  }

  window.setTimeout(() => {
    if (!printed) runPrint();
  }, 2000);
}

export function SelfRegistrationQrPanel({ showRegenerate = false, showPrint = true }: Props) {
  const queryClient = useQueryClient();

  const linkQuery = useQuery({
    queryKey: SELF_REG_LINK_QUERY_KEY,
    queryFn: () => joiningAPI.getSelfRegistrationLink(),
    staleTime: 5 * 60_000,
  });

  const regenerateMutation = useMutation({
    mutationFn: () => joiningAPI.regenerateSelfRegistrationLink(),
    onSuccess: (res) => {
      queryClient.setQueryData(SELF_REG_LINK_QUERY_KEY, res);
      showToast.success('New QR generated. Print or share the updated link.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) => {
      showToast.error(
        error?.response?.data?.message || error?.message || 'Could not regenerate link'
      );
    },
  });

  const parsed = linkQuery.data ? parseJoiningPublicLinkFromApiResponse(linkQuery.data) : null;
  const url = parsed?.url ?? '';
  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`
    : '';

  if (linkQuery.isLoading) {
    return (
      <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        Loading campus link…
      </div>
    );
  }

  if (linkQuery.isError || !url) {
    return (
      <div className="py-8 text-center text-sm text-red-600 dark:text-red-400">
        Could not load the self-registration link. Close and try again.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-6 dark:border-slate-700 dark:bg-slate-800/50">
        <img
          src={qrSrc}
          alt="Self registration QR code"
          width={280}
          height={280}
          className="rounded-xl border border-white bg-white p-2 shadow-sm"
        />
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Permanent campus QR — stays the same unless you regenerate
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Public link</p>
        <p className="mt-1 break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
          {url}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {showPrint ? (
          <Button variant="primary" size="sm" onClick={() => printSelfRegistrationQr(url)} disabled={!qrSrc}>
            Print QR
          </Button>
        ) : null}
        <Button
          variant={showPrint ? 'outline' : 'primary'}
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => showToast.success('Link copied'));
          }}
        >
          Copy link
        </Button>
        {showRegenerate ? (
          <Button
            variant="light"
            size="sm"
            disabled={regenerateMutation.isPending}
            onClick={() => {
              if (
                window.confirm('Regenerate the campus QR? The old printed QR will stop working.')
              ) {
                regenerateMutation.mutate();
              }
            }}
          >
            {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate QR'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
