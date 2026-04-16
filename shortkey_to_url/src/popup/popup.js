import { getAll, addEntry, updateEntry, updateShortcut } from '../storage.js';

const shortcutsContainer = document.getElementById('shortcuts-container');
const allEmptyMsg = document.getElementById('all-empty-msg');
const btnOptions = document.getElementById('btn-options');

const editModalOverlay = document.getElementById('edit-modal-overlay');
const editModalForm = document.getElementById('edit-modal-form');
const editModalCommandId = document.getElementById('edit-modal-command-id');
const editModalEntryId = document.getElementById('edit-modal-entry-id');
const editModalLabelInput = document.getElementById('edit-modal-label-input');
const editModalUrlInput = document.getElementById('edit-modal-url-input');
const editModalError = document.getElementById('edit-modal-error');
const editModalCancel = document.getElementById('edit-modal-cancel');

let currentState = { entries: [], shortcuts: [] };

const isMac = navigator.platform.toUpperCase().includes('MAC');

function getKeyHint(index) {
  const num = index + 1;
  return isMac ? `⌘+Shift+${num}` : `Ctrl+Shift+${num}`;
}

async function init() {
  currentState = await getAll();
  renderShortcuts(currentState);
}

function renderShortcuts({ shortcuts, entries }) {
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
        class="btn-edit"
        data-command-id="${escHtml(sc.commandId)}"
        aria-label="${escHtml(sc.name)} のURLを編集"
        title="URLを変更"
      >✏️</button>
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

// 遷移ボタン・編集ボタン
shortcutsContainer.addEventListener('click', async (e) => {
  const goBtn = e.target.closest('.btn-go');
  if (goBtn && !goBtn.disabled) {
    const url = goBtn.dataset.entryUrl;
    if (!url) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.update(tab.id, { url });
    window.close();
    return;
  }

  const editBtn = e.target.closest('.btn-edit');
  if (editBtn) {
    const commandId = editBtn.dataset.commandId;
    const sc = currentState.shortcuts.find((s) => s.commandId === commandId);
    if (!sc) return;
    const entry = sc.entryId ? currentState.entries.find((en) => en.id === sc.entryId) ?? null : null;
    openEditModal(sc, entry);
  }
});

// オプションページを開く
btnOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// ---- 編集モーダル ----
function openEditModal(sc, entry) {
  editModalCommandId.value = sc.commandId;
  editModalEntryId.value = entry?.id ?? '';
  editModalLabelInput.value = entry?.label ?? '';
  editModalUrlInput.value = entry?.url ?? '';
  editModalError.textContent = '';
  editModalLabelInput.classList.remove('is-error');
  editModalUrlInput.classList.remove('is-error');
  editModalOverlay.hidden = false;
  editModalUrlInput.focus();
}

function closeEditModal() {
  editModalOverlay.hidden = true;
}

editModalCancel.addEventListener('click', closeEditModal);
editModalOverlay.addEventListener('click', (e) => {
  if (e.target === editModalOverlay) closeEditModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !editModalOverlay.hidden) closeEditModal();
});

editModalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  editModalError.textContent = '';
  editModalLabelInput.classList.remove('is-error');
  editModalUrlInput.classList.remove('is-error');

  const commandId = editModalCommandId.value;
  const existingEntryId = editModalEntryId.value;
  const label = editModalLabelInput.value.trim();
  const url = editModalUrlInput.value.trim();

  if (!label) {
    editModalError.textContent = '表示名を入力してください';
    editModalLabelInput.classList.add('is-error');
    return;
  }

  // 既存エントリを他のショートカットが使用しているか確認
  const usedByOthers = existingEntryId
    ? currentState.shortcuts.filter((s) => s.entryId === existingEntryId && s.commandId !== commandId).length > 0
    : false;

  let targetEntryId;

  if (existingEntryId && !usedByOthers) {
    // 他で使われていないので上書き更新
    const result = await updateEntry(existingEntryId, label, url);
    if (!result.success) {
      editModalError.textContent = result.error;
      editModalUrlInput.classList.add('is-error');
      return;
    }
    targetEntryId = existingEntryId;
  } else {
    // 新規エントリを作成して割り当て
    const result = await addEntry(label, url);
    if (!result.success) {
      editModalError.textContent = result.error;
      editModalUrlInput.classList.add('is-error');
      return;
    }
    targetEntryId = result.entry.id;
  }

  // ショートカットにエントリを紐づけ
  const sc = currentState.shortcuts.find((s) => s.commandId === commandId);
  await updateShortcut(commandId, sc?.name ?? '', targetEntryId);

  closeEditModal();
  currentState = await getAll();
  renderShortcuts(currentState);
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
