/**
 * Start a browser download without revoking the object URL before the browser
 * has had time to consume it. This is still a portable client-side file, not
 * provider-managed storage.
 */
export function downloadJsonFile(json: string, filename: string): void {
  if (!json.trim()) throw new Error('The backup is empty and cannot be downloaded.');

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  document.body.appendChild(link);
  link.click();

  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}
