const HOST_ID = 'webwarden-toast-host';
/** @type {number|null} */
let hideTimer = null;
/** @type {ShadowRoot|null} */
let toastShadow = null;

function injectStyles(shadow) {
  if (shadow.querySelector('link[data-webwarden-toast-styles]')) return;

  for (const file of ['shared/tokens.css', 'shared/fonts.css', 'shared/time-toast.css']) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(file);
    link.setAttribute('data-webwarden-toast-styles', 'true');
    shadow.appendChild(link);
  }
}

function ensureToastUi() {
  if (toastShadow) {
    return toastShadow;
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  toastShadow = shadow;
  injectStyles(shadow);

  const inner = document.createElement('div');
  inner.className = 'page-toast-host-inner';
  inner.innerHTML = `
    <div id="webwarden-page-toast" class="page-toast page-toast-warning" role="status" aria-live="polite" hidden>
      <div class="page-toast-body">
        <p class="page-toast-title">WebWarden</p>
        <p id="webwarden-page-toast-message" class="page-toast-message"></p>
      </div>
      <button id="webwarden-page-toast-dismiss" class="page-toast-dismiss" type="button">OK</button>
    </div>
  `;
  shadow.appendChild(inner);
  document.documentElement.appendChild(host);

  shadow.getElementById('webwarden-page-toast-dismiss')?.addEventListener('click', hideToast);
  return shadow;
}

function hideToast() {
  const toast = toastShadow?.getElementById('webwarden-page-toast');
  if (!toast) return;

  toast.classList.remove('is-visible');
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  window.setTimeout(() => {
    if (!toast.classList.contains('is-visible')) {
      toast.hidden = true;
    }
  }, 280);
}

/**
 * @param {string} message
 * @param {'warning'|'success'|'error'} [variant]
 */
function showToast(message, variant = 'warning') {
  const shadow = ensureToastUi();
  const toast = shadow.getElementById('webwarden-page-toast');
  const messageEl = shadow.getElementById('webwarden-page-toast-message');
  if (!toast || !messageEl) return;

  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }

  messageEl.textContent = message;
  toast.classList.remove('page-toast-success', 'page-toast-error', 'page-toast-warning');
  toast.classList.add(`page-toast-${variant}`);
  toast.hidden = false;
  toast.classList.add('is-visible');

  hideTimer = window.setTimeout(hideToast, variant === 'error' ? 6000 : 5000);
}

globalThis.__webwardenShowToast = showToast;

if (!globalThis.__webwardenTimeToastListener) {
  globalThis.__webwardenTimeToastListener = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SHOW_TIME_TOAST') return;
    showToast(message.message, message.variant || 'warning');
    sendResponse({ ok: true });
    return true;
  });
}
