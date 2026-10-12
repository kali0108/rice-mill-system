// Amount in words, Pakistani style (Lakh / Crore / Arab) — for invoices.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function upTo99(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}

function upTo999(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? ONES[h] + ' Hundred' : '', r ? upTo99(r) : ''].filter(Boolean).join(' ');
}

export function numberToWords(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'Zero';
  const parts = [];
  const arab = Math.floor(n / 1e9); n %= 1e9;
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (arab) parts.push(numberToWords(arab) + ' Arab');
  if (crore) parts.push(upTo99(crore) + ' Crore');
  if (lakh) parts.push(upTo99(lakh) + ' Lakh');
  if (thousand) parts.push(upTo99(thousand) + ' Thousand');
  if (n) parts.push(upTo999(n));
  return parts.join(' ');
}

export function rupeesInWords(amount) {
  const v = Math.round((Number(amount) || 0) * 100) / 100;
  const abs = Math.abs(v);
  const rupees = Math.floor(abs);
  const paisa = Math.round((abs - rupees) * 100);
  let s = 'Rupees ' + numberToWords(rupees);
  if (paisa) s += ' and ' + numberToWords(paisa) + ' Paisa';
  return (v < 0 ? 'Minus ' : '') + s + ' Only';
}
