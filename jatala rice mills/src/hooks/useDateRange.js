import { useMemo, useState, useEffect } from 'react';
import { todayStr, startOfMonth, endOfMonth, startOfWeek, addDays, prevMonthRange } from '../lib/dates';
import { useSettings } from '../context/DataContext';

export const PRESETS = [
  { value: 'today', label: 'Aaj' },
  { value: 'week', label: 'Is hafta' },
  { value: 'month', label: 'Is mahina' },
  { value: 'prev_month', label: 'Pichla mahina' },
  { value: 'season', label: 'Season' },
  { value: 'all', label: 'Sab' },
  { value: 'custom', label: 'Custom' },
];

export function computeRange(state, today, seasonStart) {
  switch (state.preset) {
    case 'today': return { from: today, to: today };
    case 'week': { const s = startOfWeek(today); return { from: s, to: addDays(s, 6) }; }
    case 'month': return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'prev_month': { const [f, t] = prevMonthRange(today); return { from: f, to: t }; }
    case 'season': return seasonStart ? { from: seasonStart, to: null } : { from: null, to: null };
    case 'custom': return { from: state.from || null, to: state.to || null };
    default: return { from: null, to: null };
  }
}

// Remembers the chosen period per screen for this browser tab
export function useDateRange(key, defaultPreset = 'month') {
  const { settings } = useSettings();
  const storageKey = 'kk:range:' + key;
  const [state, setState] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved && saved.preset) return saved;
    } catch { /* ignore */ }
    return { preset: defaultPreset };
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore */ }
  }, [storageKey, state]);
  const today = todayStr();
  const range = useMemo(() => computeRange(state, today, settings.season_start), [state, today, settings.season_start]);
  return {
    ...range,
    preset: state.preset,
    customFrom: state.from || '',
    customTo: state.to || '',
    setPreset: (preset) => setState((s) => ({ ...s, preset })),
    setCustom: (from, to) => setState({ preset: 'custom', from, to }),
  };
}
