/** @type {number|null} */
let pageToastTimer = null;

function hidePageToast() {
  const toast = document.getElementById('page-toast');
  if (!toast) return;

  toast.classList.remove('is-visible');
  if (pageToastTimer) {
    window.clearTimeout(pageToastTimer);
    pageToastTimer = null;
  }
  window.setTimeout(() => {
    if (!toast.classList.contains('is-visible')) {
      toast.hidden = true;
    }
  }, 280);
}

/**
 * @param {string} message
 * @param {'success'|'error'|'warning'} [type]
 */
export function showExtensionPageToast(message, type = 'success') {
  const toast = document.getElementById('page-toast');
  const messageEl = document.getElementById('page-toast-message');
  const titleEl = document.getElementById('page-toast-title');
  if (!toast || !messageEl) return;

  if (pageToastTimer) {
    window.clearTimeout(pageToastTimer);
    pageToastTimer = null;
  }

  messageEl.textContent = message;
  toast.classList.remove('page-toast-success', 'page-toast-error', 'page-toast-warning');
  if (type === 'error') {
    toast.classList.add('page-toast-error');
  } else if (type === 'warning') {
    toast.classList.add('page-toast-warning');
  } else {
    toast.classList.add('page-toast-success');
  }
  if (titleEl) {
    titleEl.hidden = type !== 'warning';
  }
  toast.hidden = false;
  toast.classList.add('is-visible');

  const duration = type === 'error' ? 6000 : (type === 'warning' ? 5000 : 3500);
  pageToastTimer = window.setTimeout(hidePageToast, duration);
}

/**
 * Listen for toasts from the service worker on extension pages (options, blocked, etc.).
 */
export function bindExtensionPageToast() {
  document.getElementById('page-toast-dismiss')?.addEventListener('click', hidePageToast);

  window.addEventListener('webwarden-show-toast', (event) => {
    const detail = /** @type {CustomEvent<{ message: string, variant?: string }> } */ (event).detail;
    showExtensionPageToast(detail.message, detail.variant || 'warning');
  });

  if (globalThis.__webwardenExtensionPageToastListener) return;
  globalThis.__webwardenExtensionPageToastListener = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SHOW_TIME_TOAST') return false;
    showExtensionPageToast(message.message, message.variant || 'warning');
    sendResponse({ ok: true });
    return true;
  });
}
