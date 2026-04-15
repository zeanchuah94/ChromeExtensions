import { COMMAND_IDS, getAll } from '../storage.js';

const shortcutsContainer = document.getElementById('shortcuts-container');
const allEmptyMsg = document.getElementById('all-empty-msg');
const btnOptions = document.getElementById('btn-options');

const isMac = navigator.platform.toUpperCase().includes('MAC');

function getKeyHint(index) {
  const num = index + 1;
  return isMac ? `⌘+Shift+${num}` : `Ctrl+Shift+${num}`;
}

async function init() {
  const { shortcuts, entries } = await getAll();

  shortcutsContainer.innerHTML = '';
  let anySet = false;

  shortcuts.forEach((sc, index) => {
    const entry = sc.entryId ? entries.find((e) => e.id === sc.entryId) ?? null : null;
    const isSet = !!entry;
    if (isSet) anySet = true;

    const item = document.createElement('div');
    item.className = `shortcut-item${isSet ? '' : ' is-unset'}`;
    item.dataset.commandId = sc.commandId;

    const urlText = entry
      ? `<div class="shortcut-url-text" title="${escHtml(entry.url)}">${escHtml(truncate(entry.url, 35))}</div>`
      : `<div class="shortcut-unset-label">未設定</div>`;

    item.innerHTML = `
      <div class="shortcut-num">${index + 1}</div>
      <div class="shortcut-info">
        <div class="shortcut-name">${escHtml(sc.name)}</div>
        <div class="shortcut-key-hint">${escHtml(getKeyHint(index))}</div>
        ${urlText}
      </div>
      <button
        class="btn-go"
        data-entry-id="${escHtml(sc.entryId ?? '')}"
        data-entry-url="${escHtml(entry?.url ?? '')}"
        ${isSet ? '' : 'disabled'}
        aria-label="${escHtml(sc.name)} へ遷移"
        title="${isSet ? escHtml(entry.url) : 'URLが設定されていません'}"
      >→</button>
    `;

    shortcutsContainer.appendChild(item);
  });

  allEmptyMsg.hidden = anySet;
}

// 遷移ボタン
shortcutsContainer.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-go');
  if (!btn || btn.disabled) return;

  const url = btn.dataset.entryUrl;
  if (!url) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  await chrome.tabs.update(tab.id, { url });
  window.close();
});

// オプションページを開く
btnOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// ---- ユーティリティ ----
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

init();
