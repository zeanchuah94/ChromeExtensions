/**
 * Service Worker — ショートカット処理
 * navigate-preset-1 〜 navigate-preset-4 を受信し
 * 各ショートカットに紐づいたURLへアクティブタブを遷移させる
 *
 * NOTE: import は使わず chrome.storage を直接参照する（Service Worker の互換性のため）
 */

const COMMAND_IDS = [
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

chrome.commands.onCommand.addListener(async (command) => {
  if (!COMMAND_IDS.includes(command)) return;

  let entries, shortcuts;
  try {
    const result = await chrome.storage.local.get(['entries', 'shortcuts']);
    entries = result.entries ?? [];
    shortcuts = result.shortcuts ?? [];
  } catch (err) {
    console.error('[ショートカットナビ] ストレージ読み取りエラー:', err);
    return;
  }

  const shortcut = shortcuts.find((s) => s.commandId === command);
  if (!shortcut || !shortcut.entryId) {
    console.warn(`[ショートカットナビ] 「${command}」にURLが設定されていません。`);
    return;
  }

  const entry = entries.find((e) => e.id === shortcut.entryId);
  if (!entry) {
    console.warn(`[ショートカットナビ] エントリが見つかりません。ID: ${shortcut.entryId}`);
    return;
  }

  let tabs;
  try {
    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  } catch (err) {
    console.error('[ショートカットナビ] タブ取得エラー:', err);
    return;
  }

  const tab = tabs[0];
  if (!tab?.id) {
    console.warn('[ショートカットナビ] アクティブタブが見つかりません。');
    return;
  }

  try {
    await chrome.tabs.update(tab.id, { url: entry.url });
  } catch (err) {
    console.error('[ショートカットナビ] タブ遷移エラー:', err);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get(['entries', 'shortcuts']);

  const updates = {};
  if (!result.entries) {
    updates.entries = [];
  }
  if (!result.shortcuts) {
    updates.shortcuts = COMMAND_IDS.map((commandId, i) => ({
      commandId,
      name: DEFAULT_SHORTCUT_NAMES[i],
      entryId: null,
    }));
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
});
