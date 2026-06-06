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
