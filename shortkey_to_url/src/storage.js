/**
 * chrome.storage.local のデータモデル
 *
 * {
 *   entries: Array<{ id: string, label: string, url: string, createdAt: number }>,
 *   shortcuts: Array<{
 *     commandId: string,   // "navigate-preset-1" 〜 "navigate-preset-5"
 *     name: string,        // ユーザーが設定する名称
 *     entryId: string|null // 紐づけたエントリのID
 *   }>
 * }
 */

export const COMMAND_IDS = [
  'navigate-preset-1',
  'navigate-preset-2',
  'navigate-preset-3',
  'navigate-preset-4',
];

const DEFAULT_SHORTCUT_NAMES = [
  'ショートカット 1',
  'ショートカット 2',
  'ショートカット 3',
  'ショートカット 4',
];

const ALLOWED_SCHEMES = ['https:', 'http:'];
const DISALLOWED_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:'];

// ---- バリデーション ----

/**
 * URLの安全性バリデーション
 * @param {string} urlStr
 * @returns {{ valid: boolean, url?: string, error?: string }}
 */
export function validateUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'URLを入力してください' };
  }

  const trimmed = urlStr.trim();
  if (!trimmed) {
    return { valid: false, error: 'URLを入力してください' };
  }

  const lower = trimmed.toLowerCase();
  for (const scheme of DISALLOWED_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return { valid: false, error: `「${scheme}」は使用できません` };
    }
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL('https://' + trimmed);
    } catch {
      return { valid: false, error: '無効なURLです。例: https://example.com' };
    }
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return { valid: false, error: 'https:// または http:// から始まるURLのみ使用できます' };
  }

  if (!parsed.hostname) {
    return { valid: false, error: 'ホスト名が不正です' };
  }

  return { valid: true, url: parsed.href };
}

// ---- 初期化 ----

/**
 * ストレージの初期化（インストール時に呼び出す）
 */
export async function initStorage() {
  const result = await chrome.storage.local.get(['entries', 'shortcuts']);

  const updates = {};
  if (!result.entries) {
    updates.entries = [];
  }
  if (!result.shortcuts) {
    updates.shortcuts = buildDefaultShortcuts();
  } else {
    // 新しいコマンドIDが増えた場合に補完
    const existing = result.shortcuts;
    const merged = COMMAND_IDS.map((commandId, i) => {
      const found = existing.find((s) => s.commandId === commandId);
      return found ?? { commandId, name: DEFAULT_SHORTCUT_NAMES[i], entryId: null };
    });
    if (merged.length !== existing.length || merged.some((m, i) => m.commandId !== existing[i]?.commandId)) {
      updates.shortcuts = merged;
    }
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

function buildDefaultShortcuts() {
  return COMMAND_IDS.map((commandId, i) => ({
    commandId,
    name: DEFAULT_SHORTCUT_NAMES[i],
    entryId: null,
  }));
}

// ---- エントリ（URL プリセット）CRUD ----

/**
 * 全データを取得
 * @returns {Promise<{ entries: Array, shortcuts: Array }>}
 */
export async function getAll() {
  const result = await chrome.storage.local.get(['entries', 'shortcuts']);
  return {
    entries: result.entries ?? [],
    shortcuts: result.shortcuts ?? buildDefaultShortcuts(),
  };
}

/**
 * エントリを追加
 * @param {string} label
 * @param {string} url
 * @returns {Promise<{ success: boolean, entry?: object, error?: string }>}
 */
export async function addEntry(label, url) {
  const validation = validateUrl(url);
  if (!validation.valid) return { success: false, error: validation.error };
  if (!label?.trim()) return { success: false, error: '表示名を入力してください' };

  const { entries } = await getAll();
  const entry = {
    id: crypto.randomUUID(),
    label: label.trim(),
    url: validation.url,
    createdAt: Date.now(),
  };

  await chrome.storage.local.set({ entries: [...entries, entry] });
  return { success: true, entry };
}

/**
 * エントリを更新
 * @param {string} id
 * @param {string} label
 * @param {string} url
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateEntry(id, label, url) {
  const validation = validateUrl(url);
  if (!validation.valid) return { success: false, error: validation.error };
  if (!label?.trim()) return { success: false, error: '表示名を入力してください' };

  const { entries } = await getAll();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return { success: false, error: 'エントリが見つかりません' };

  entries[index] = { ...entries[index], label: label.trim(), url: validation.url };
  await chrome.storage.local.set({ entries });
  return { success: true };
}

/**
 * エントリを削除（紐づくショートカットの entryId も null にリセット）
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteEntry(id) {
  const { entries, shortcuts } = await getAll();
  const newEntries = entries.filter((e) => e.id !== id);
  const newShortcuts = shortcuts.map((s) =>
    s.entryId === id ? { ...s, entryId: null } : s
  );
  await chrome.storage.local.set({ entries: newEntries, shortcuts: newShortcuts });
}

// ---- ショートカット設定 ----

/**
 * ショートカットの名称と紐づけURLを更新
 * @param {string} commandId
 * @param {string} name
 * @param {string|null} entryId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateShortcut(commandId, name, entryId) {
  if (!COMMAND_IDS.includes(commandId)) {
    return { success: false, error: '不正なコマンドIDです' };
  }
  if (!name?.trim()) {
    return { success: false, error: 'ショートカット名を入力してください' };
  }

  const { shortcuts } = await getAll();
  const index = shortcuts.findIndex((s) => s.commandId === commandId);
  if (index === -1) return { success: false, error: 'ショートカットが見つかりません' };

  shortcuts[index] = { ...shortcuts[index], name: name.trim(), entryId: entryId ?? null };
  await chrome.storage.local.set({ shortcuts });
  return { success: true };
}

/**
 * コマンドIDからショートカット設定とエントリを取得
 * @param {string} commandId
 * @returns {Promise<{ shortcut: object|null, entry: object|null }>}
 */
export async function getShortcutWithEntry(commandId) {
  const { entries, shortcuts } = await getAll();
  const shortcut = shortcuts.find((s) => s.commandId === commandId) ?? null;
  if (!shortcut) return { shortcut: null, entry: null };

  const entry = shortcut.entryId
    ? (entries.find((e) => e.id === shortcut.entryId) ?? null)
    : null;

  return { shortcut, entry };
}
