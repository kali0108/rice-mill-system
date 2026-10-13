import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberToWords, rupeesInWords } from '../../src/lib/numToWords.js';
import { normalizePkPhone, whatsappLink } from '../../src/lib/whatsapp.js';
import { esc } from '../../src/lib/print.js';

test('amount in words, Pakistani lakh/crore', () => {
  assert.equal(numberToWords(0), 'Zero');
  assert.equal(numberToWords(15), 'Fifteen');
  assert.equal(numberToWords(105), 'One Hundred Five');
  assert.equal(numberToWords(1234567), 'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven');
  assert.equal(numberToWords(10000000), 'One Crore');
  assert.equal(numberToWords(2500000000), 'Two Arab Fifty Crore');
  assert.equal(rupeesInWords(1250.5), 'Rupees One Thousand Two Hundred Fifty and Fifty Paisa Only');
  assert.equal(rupeesInWords(-100), 'Minus Rupees One Hundred Only');
});

test('Pakistani phone numbers for WhatsApp', () => {
  assert.equal(normalizePkPhone('0300-1234567'), '923001234567');
  assert.equal(normalizePkPhone('+92 300 1234567'), '923001234567');
  assert.equal(normalizePkPhone('00923001234567'), '923001234567');
  assert.equal(normalizePkPhone('3001234567'), '923001234567');
  assert.equal(normalizePkPhone('12'), '');
  assert.match(whatsappLink('03001234567', 'Rs 5,000 baqi'), /^https:\/\/wa\.me\/923001234567\?text=Rs%205%2C000%20baqi$/);
  assert.match(whatsappLink('', 'x'), /^https:\/\/wa\.me\/\?text=x$/);
});

test('print escaping blocks HTML injection from names', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc(`"Ali" & 'Sons'`), '&quot;Ali&quot; &amp; &#39;Sons&#39;');
  assert.equal(esc(null), '');
});

