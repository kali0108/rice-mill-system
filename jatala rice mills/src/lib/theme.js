// Light / dark theme, remembered on this device (default: the phone/PC setting)
const KEY = 'kk:theme';

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch { /* private mode */ }
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#18231A' : '#1F2E1A');
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  applyTheme(theme);
}
