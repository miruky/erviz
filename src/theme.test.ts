import { describe, expect, it } from 'vitest';
import {
  isThemePref,
  nextPref,
  readStoredPref,
  resolveTheme,
  storePref,
  themeLabel,
} from './theme';

describe('resolveTheme', () => {
  it('明示指定はOSの好みより優先する', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('自動はOSの好みに従う', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('nextPref', () => {
  it('明 → 暗 → 自動 → 明 と巡回する', () => {
    expect(nextPref('light')).toBe('dark');
    expect(nextPref('dark')).toBe('system');
    expect(nextPref('system')).toBe('light');
  });
});

describe('isThemePref', () => {
  it('既知の値だけを受け付ける', () => {
    expect(isThemePref('light')).toBe(true);
    expect(isThemePref('auto')).toBe(false);
    expect(isThemePref(null)).toBe(false);
  });
});

describe('ストレージ入出力', () => {
  function fakeStorage(initial: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      get length() {
        return map.size;
      },
    } as Storage;
  }

  it('保存した設定を読み戻す', () => {
    const s = fakeStorage();
    storePref(s, 'dark');
    expect(readStoredPref(s)).toBe('dark');
  });

  it('未保存・不正値は自動にフォールバックする', () => {
    expect(readStoredPref(fakeStorage())).toBe('system');
    expect(readStoredPref(fakeStorage({ 'erviz:theme': 'x' }))).toBe('system');
  });

  it('例外を投げるストレージでも落ちない', () => {
    const broken = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(readStoredPref(broken)).toBe('system');
    expect(() => storePref(broken, 'light')).not.toThrow();
  });
});

describe('themeLabel', () => {
  it('日本語ラベルを返す', () => {
    expect(themeLabel('light')).toBe('ライト');
    expect(themeLabel('dark')).toBe('ダーク');
    expect(themeLabel('system')).toBe('自動');
  });
});
