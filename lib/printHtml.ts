/** Escape text for safe inclusion in print HTML documents. */
export function escapePrintHtml(text: string): string {
  if (typeof document !== 'undefined') {
    const span = document.createElement('span');
    span.textContent = text;
    return span.innerHTML;
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Open a hidden iframe, write HTML, and trigger the browser print dialog. */
export function printHtmlDocument(
  html: string,
  title: string,
  onClose?: () => void,
  options?: { deferPrintMs?: number }
): void {
  const deferPrintMs = options?.deferPrintMs ?? 300;
  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('style', 'position:absolute;width:0;height:0;border:0;overflow:hidden;');
  iframe.setAttribute('title', title);
  document.body.appendChild(iframe);
  let done = false;
  let printTriggered = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    if (iframe.parentNode) iframe.remove();
    onClose?.();
  };
  const triggerPrint = () => {
    if (printTriggered) return;
    printTriggered = true;
    const win = iframe.contentWindow;
    if (!win || !iframe.parentNode) {
      cleanup();
      return;
    }
    win.focus();
    win.print();
    win.onafterprint = cleanup;
  };
  iframe.onload = triggerPrint;
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    cleanup();
    return;
  }
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();
  setTimeout(() => {
    if (!printTriggered) triggerPrint();
  }, deferPrintMs);
}

/** Fetch external print document from API proxy and trigger rendering/print. */
export async function handleExternalPrint(
  service: string,
  params?: Record<string, unknown>,
  body?: unknown,
  title = 'Print document'
): Promise<void> {
  const { printAPI } = await import('@/lib/api');
  const { showToast } = await import('@/lib/toast');

  try {
    showToast.info('Preparing print document...');
    const blob = await printAPI.print(service, params, body);
    
    if (!blob || blob.size === 0) {
      showToast.error('No content returned from print service');
      return;
    }

    if (blob.type === 'application/pdf') {
      const blobUrl = URL.createObjectURL(blob);
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.src = blobUrl;
        document.body.appendChild(iframe);
        
        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              iframe.remove();
              URL.revokeObjectURL(blobUrl);
            }, 60000);
          } catch (e) {
            console.error('Failed to trigger print on PDF iframe, opening in new tab:', e);
            window.open(blobUrl, '_blank');
          }
        };
      } catch (err) {
        console.error('Iframe creation failed for PDF, opening in new tab:', err);
        window.open(blobUrl, '_blank');
      }
    } else {
      // Treat as HTML
      const text = await blob.text();
      if (text.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.message) {
            showToast.error(parsed.message);
            return;
          }
        } catch {
          // ignore
        }
      }
      printHtmlDocument(text, title);
    }
  } catch (error: any) {
    console.error('Print request failed:', error);
    let message = 'Print service is currently unavailable. Please try again later.';
    try {
      if (error.response?.data) {
        const text = typeof error.response.data.text === 'function' 
          ? await error.response.data.text()
          : String(error.response.data);
        const parsed = JSON.parse(text);
        if (parsed.message) message = parsed.message;
      }
    } catch {
      // ignore
    }
    showToast.error(message);
  }
}
