import { rs } from './calc.js';
import { fmtDate, todayStr } from './dates.js';

// 0300-1234567 / +92 300 1234567 / 923001234567 -> 923001234567
export function normalizePkPhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0092')) d = d.slice(2);
  if (d.startsWith('92') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 11) return '92' + d.slice(1);
  if (d.startsWith('3') && d.length === 10) return '92' + d;
  return d.length >= 10 ? d : '';
}

export function whatsappLink(phone, text) {
  const p = normalizePkPhone(phone);
  const q = 'text=' + encodeURIComponent(text || '');
  return p ? `https://wa.me/${p}?${q}` : `https://wa.me/?${q}`;
}

// Balance reminder message (Roman Urdu) for a party
export function reminderText(settings, name, balance) {
  const b = Number(balance) || 0;
  const side = b < 0 ? `aap ki taraf ${rs(Math.abs(b))} baqaya hai` : b > 0 ? `mill ki taraf aap ke ${rs(b)} hain` : 'hisaab barabar hai';
  return `Assalam o Alaikum ${name},\n${(settings && settings.mill_name) || 'Rice Mill'} ke khata ke mutabiq aaj (${fmtDate(todayStr())}) tak ${side}.\nShukriya.`;
}
