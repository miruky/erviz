// テーマの解決ロジック。DOMに触れる副作用は applyTheme だけに閉じ込め、
// 解決規則そのものは純粋関数にしてテストできるようにする。

export type ThemePref = 'light' | 'dark' | 'system';
export type Resolved = 'light' | 'dark';

const KEY = 'erviz:theme';
const PREFS: readonly ThemePref[] = ['light', 'dark', 'system'];

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === 'string' && (PREFS as readonly string[]).includes(v);
}

/** 設定値とOSの好みから実際に適用する色を決める */
export function resolveTheme(pref: ThemePref, systemDark: boolean): Resolved {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

/** トグルの巡回順。明 → 暗 → 自動 → 明 と回す */
export function nextPref(pref: ThemePref): ThemePref {
  const i = PREFS.indexOf(pref);
  return PREFS[(i + 1) % PREFS.length] ?? 'system';
}

export function readStoredPref(storage: Pick<Storage, 'getItem'>): ThemePref {
  try {
    const v = storage.getItem(KEY);
    return isThemePref(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function storePref(storage: Pick<Storage, 'setItem'>, pref: ThemePref): void {
  try {
    storage.setItem(KEY, pref);
  } catch {
    // ストレージが使えない環境では黙って諦める
  }
}

export const themeLabel = (pref: ThemePref): string =>
  pref === 'light' ? 'ライト' : pref === 'dark' ? 'ダーク' : '自動';

export { KEY as THEME_KEY };
