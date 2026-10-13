// Language: Roman Urdu (the app's own text) or English. T('Kharid Save Karein')
// returns the English line when English is chosen. Switching language saves
// the choice and reloads, so every label (also module-level lists) updates.
import EN from './i18n-en.js';

const KEY = 'kk:lang';
export const LANGS = [
  { value: 'ur', label: 'Roman Urdu' },
  { value: 'en', label: 'English' },
];

function readLang() {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return v === 'en' ? 'en' : 'ur';
  } catch {
    return 'ur';
  }
}

let lang = readLang();

export function getLang() {
  return lang;
}

export function setLang(next) {
  try { localStorage.setItem(KEY, next === 'en' ? 'en' : 'ur'); } catch { /* private mode */ }
  window.location.reload();
}

// Exact match first, then the trimmed text (keeps the surrounding spaces)
export function T(s) {
  if (lang !== 'en' || s == null) return s;
  const str = String(s);
  if (Object.prototype.hasOwnProperty.call(EN, str)) return EN[str];
  const trimmed = str.trim();
  if (trimmed !== str && Object.prototype.hasOwnProperty.call(EN, trimmed)) {
    const lead = str.slice(0, str.indexOf(trimmed));
    const tail = str.slice(str.indexOf(trimmed) + trimmed.length);
    return lead + EN[trimmed] + tail;
  }
  return str;
}

// for tests
export function _setLangForTests(l) {
  lang = l;
}
