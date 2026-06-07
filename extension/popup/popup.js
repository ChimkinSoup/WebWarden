/** @type {number|null} */
let tickTimer = null;

function formatMs(ms) {
  if (ms <= 0) return '0m';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * @param {object} state
 */
function render(state) {
  const list = document.getElementById('category-list');
  const indicator = document.getElementById('tracking-indicator');
  const guard = document.getElementById('guard-notice');

  if (state.tracking) {
    indicator.classList.remove('idle');
    indicator.classList.add('recording');
    indicator.setAttribute('aria-label', 'Time is being tracked');
    indicator.title = 'Time is being tracked';
  } else {
    indicator.classList.remove('recording');
    indicator.classList.add('idle');
    indicator.setAttribute('aria-label', 'Time not being tracked');
    indicator.title = 'Time not being tracked';
  }

  if (state.guardActive && state.guardReason) {
    guard.hidden = false;
    guard.textContent = state.guardReason;
  } else if (state.guardActive) {
    guard.hidden = false;
    guard.textContent = 'Guard mode is active.';
  } else {
    guard.hidden = true;
  }

  list.innerHTML = '';
  for (const cat of state.categories) {
    const li = document.createElement('li');
    li.className = 'category-item';

    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = cat.name;
    name.title = cat.name;

    const time = document.createElement('span');
    time.className = 'category-time';
    time.textContent = formatMs(cat.displayRemainingMs);
    if (cat.displayRemainingMs <= 0) {
      time.classList.add('empty');
    } else if (cat.displayRemainingMs <= cat.dailyLimitMs * 0.1) {
      time.classList.add('low');
    }

    li.append(name, time);
    list.appendChild(li);
  }
}

async function refresh() {
  const list = document.getElementById('category-list');
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_POPUP_STATE' });
    if (!state?.ok) {
      list.innerHTML = `<li class="error">${state?.error || 'Failed to load state'}</li>`;
      return;
    }
    render(state);
  } catch (e) {
    list.innerHTML = `<li class="error">${e.message || 'Extension unavailable'}</li>`;
  }
}

function startLiveRefresh() {
  refresh();
  tickTimer = window.setInterval(refresh, 1000);
}

function stopLiveRefresh() {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

document.getElementById('btn-open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLiveRefresh();
  } else {
    startLiveRefresh();
  }
});

startLiveRefresh();
