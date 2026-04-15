import {
  COMMAND_IDS,
  getAll,
  addEntry,
  updateEntry,
  deleteEntry,
  updateShortcut,
} from '../storage.js';

// ---- DOM参照 ----
const shortcutsList = document.getElementById('shortcuts-list');

const addForm = document.getElementById('add-form');
const inputLabel = document.getElementById('input-label');
const inputUrl = document.getElementById('input-url');
const addError = document.getElementById('add-error');

const emptyMsg = document.getElementById('empty-msg');
const entryList = document.getElementById('entry-list');

const modalOverlay = document.getElementById('modal-overlay');
const editForm = document.getElementById('edit-form');
const editId = document.getElementById('edit-id');
const editLabel = document.getElementById('edit-label');
const editUrl = document.getElementById('edit-url');
const editError = document.getElementById('edit-error');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnOpenShortcuts = document.getElementById('btn-open-shortcuts');

// ---- 状態 ----
let state = { entries: [], shortcuts: [] };

// ---- 初期化 ----
async function init() {
  await render();
}

// ---- 描画 ----
async function render() {
  state = await getAll();
  renderShortcuts();
  renderEntryList();
}

function renderShortcuts() {
  const { shortcuts, entries } = state;
  shortcutsList.innerHTML = '';

  shortcuts.forEach((sc, index) => {
    const number = index + 1;
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    row.dataset.commandId = sc.commandId;

    const hasEntry = !!sc.entryId;
    const optionsHtml = buildSelectOptions(entries, sc.entryId);
    const defaultKey = getDefaultKey(number);

    row.innerHTML = `
      <div class="shortcut-badge" title="${escHtml(defaultKey)}">${number}</div>

      <input
        class="shortcut-name-input"
        type="text"
        value="${escHtml(sc.name)}"
        placeholder="ショートカット名"
        maxlength="40"
        aria-label="ショートカット ${number} の名称"
      />

      <select
        class="shortcut-url-select ${hasEntry ? '' : 'is-unset'}"
        aria-label="ショートカット ${number} の遷移先URL"
      >
        <option value="">— URLを選択 —</option>
        ${optionsHtml}
      </select>

      <button
        class="btn-shortcut-save"
        type="button"
        aria-label="ショートカット ${number} を保存"
      >保存</button>
    `;

    shortcutsList.appendChild(row);
  });
}

function buildSelectOptions(entries, selectedEntryId) {
  return entries
    .map((e) => {
      const selected = e.id === selectedEntryId ? 'selected' : '';
      return `<option value="${escHtml(e.id)}" ${selected}>${escHtml(e.label)} — ${escHtml(truncate(e.url, 40))}</option>`;
    })
    .join('');
}

function getDefaultKey(number) {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  return isMac ? `⌘+Shift+${number}` : `Ctrl+Shift+${number}`;
}

function renderEntryList() {
  const { entries, shortcuts } = state;

  if (!entries.length) {
    emptyMsg.hidden = false;
    entryList.innerHTML = '';
    return;
  }

  emptyMsg.hidden = true;
  entryList.innerHTML = '';

  for (const entry of entries) {
    // このエントリを使っているショートカットを探す
    const usedBy = shortcuts.filter((s) => s.entryId === entry.id);

    const li = document.createElement('li');
    li.className = 'entry-item';
    li.dataset.id = entry.id;

    const tagsHtml = usedBy.length
      ? `<div class="entry-tags">${usedBy.map((s) => `<span class="entry-tag">${escHtml(s.name)}</span>`).join('')}</div>`
      : '';

    li.innerHTML = `
      <div class="entry-info">
        <div class="entry-label" title="${escHtml(entry.label)}">${escHtml(entry.label)}</div>
        <div class="entry-url" title="${escHtml(entry.url)}">${escHtml(entry.url)}</div>
        ${tagsHtml}
      </div>
      <div class="entry-actions">
        <button class="btn btn--edit" data-action="edit" data-id="${escHtml(entry.id)}" aria-label="編集">✏️ 編集</button>
        <button class="btn btn--danger" data-action="delete" data-id="${escHtml(entry.id)}" aria-label="削除">🗑 削除</button>
      </div>
    `;

    entryList.appendChild(li);
  }
}

// ---- ショートカット保存 ----
shortcutsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-shortcut-save');
  if (!btn) return;

  const row = btn.closest('.shortcut-row');
  const commandId = row.dataset.commandId;
  const nameInput = row.querySelector('.shortcut-name-input');
  const urlSelect = row.querySelector('.shortcut-url-select');

  const name = nameInput.value;
  const entryId = urlSelect.value || null;

  const result = await updateShortcut(commandId, name, entryId);
  if (!result.success) {
    nameInput.classList.add('is-error');
    nameInput.title = result.error;
    return;
  }

  nameInput.classList.remove('is-error');
  btn.textContent = '✓ 保存済';
  btn.classList.add('is-saved');

  setTimeout(() => {
    btn.textContent = '保存';
    btn.classList.remove('is-saved');
  }, 1500);

  await render();
});

// セレクトの見た目更新
shortcutsList.addEventListener('change', (e) => {
  if (e.target.classList.contains('shortcut-url-select')) {
    e.target.classList.toggle('is-unset', !e.target.value);
  }
});

// ---- URL追加フォーム ----
addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(addError, inputLabel, inputUrl);

  const result = await addEntry(inputLabel.value, inputUrl.value);

  if (!result.success) {
    showError(addError, result.error);
    if (result.error.includes('URL') || result.error.includes('http') || result.error.includes('スキーム')) {
      inputUrl.classList.add('is-error');
    } else {
      inputLabel.classList.add('is-error');
    }
    return;
  }

  inputLabel.value = '';
  inputUrl.value = '';
  await render();
});

// ---- URL一覧の操作 ----
entryList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const { action, id } = btn.dataset;

  if (action === 'delete') {
    const entry = state.entries.find((en) => en.id === id);
    if (!entry) return;
    if (!confirm(`「${entry.label}」を削除しますか？\n割り当て済みのショートカットは未設定になります。`)) return;
    await deleteEntry(id);
    await render();
  }

  if (action === 'edit') {
    const entry = state.entries.find((en) => en.id === id);
    if (!entry) return;
    openEditModal(entry);
  }
});

// ---- 編集モーダル ----
function openEditModal(entry) {
  editId.value = entry.id;
  editLabel.value = entry.label;
  editUrl.value = entry.url;
  clearError(editError, editLabel, editUrl);
  modalOverlay.hidden = false;
  editLabel.focus();
}

function closeEditModal() {
  modalOverlay.hidden = true;
}

btnCancelEdit.addEventListener('click', closeEditModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeEditModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalOverlay.hidden) closeEditModal(); });

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(editError, editLabel, editUrl);

  const result = await updateEntry(editId.value, editLabel.value, editUrl.value);
  if (!result.success) {
    showError(editError, result.error);
    return;
  }

  closeEditModal();
  await render();
});

// ---- ショートカット設定ページを開く ----
btnOpenShortcuts.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// ---- ストレージ変更のリアルタイム反映 ----
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.entries || changes.shortcuts)) {
    render();
  }
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

function showError(el, message) {
  el.textContent = message;
}

function clearError(errorEl, ...inputs) {
  errorEl.textContent = '';
  for (const input of inputs) input?.classList.remove('is-error');
}

init();
