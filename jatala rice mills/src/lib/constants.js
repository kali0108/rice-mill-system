export const PARTY_TYPES = ['Kisan', 'Arhti', 'Customer', 'Supplier', 'Transporter', 'Broker', 'Labor', 'Bank', 'Other'];

export const PARTY_TYPE_LABELS = {
  Kisan: 'Kisan (Farmer)',
  Arhti: 'Arhti / Beopari',
  Customer: 'Customer (Khareedar)',
  Supplier: 'Supplier / Dukandar / Pump',
  Transporter: 'Transporter',
  Broker: 'Broker / Dalal',
  Labor: 'Mazdoor / Labor',
  Bank: 'Bank / Loan',
  Other: 'Other',
};

// Products & varieties are managed by the Owner/Munshi in "Products & Varieties"
// (database tables). These defaults are only a fallback before the lists load.
export const DEFAULT_VARIETIES = [
  'Super Basmati', 'Basmati 1121', 'Basmati 1509', 'Basmati 515', 'Basmati 386 (PK-386)', 'Kainat',
  'Super Kernel', 'Irri-6', 'Irri-9', 'KS-282', 'Other',
];

export const PRODUCT_CATEGORIES = [
  { value: 'paddy', label: 'Paddy (Dhaan)' },
  { value: 'rice', label: 'Chawal — full grain' },
  { value: 'broken', label: 'Toota / Kanki (broken)' },
  { value: 'byproduct', label: 'By-product (phak, toori…)' },
  { value: 'other', label: 'Other' },
];
export const CATEGORY_LABELS = Object.fromEntries(PRODUCT_CATEGORIES.map((c) => [c.value, c.label]));

export const DEFAULT_PRODUCTS = [
  { name: 'Paddy', category: 'paddy', has_variety: true, sale_unit: 'maund', sort_order: 1, active: true },
  { name: 'Rice - Full Grain', category: 'rice', has_variety: true, sale_unit: 'maund', sort_order: 10, active: true },
  { name: 'Sella Rice', category: 'rice', has_variety: true, sale_unit: 'maund', sort_order: 11, active: true },
  { name: 'Steam Rice', category: 'rice', has_variety: true, sale_unit: 'maund', sort_order: 12, active: true },
  { name: 'Kanki 25%', category: 'broken', has_variety: true, sale_unit: 'maund', sort_order: 20, active: true },
  { name: 'Kanki 50%', category: 'broken', has_variety: true, sale_unit: 'maund', sort_order: 21, active: true },
  { name: 'Kanki 100%', category: 'broken', has_variety: true, sale_unit: 'maund', sort_order: 22, active: true },
  { name: 'Bran/Chokar', category: 'byproduct', has_variety: false, sale_unit: 'kg', sort_order: 30, active: true },
  { name: 'Husk/Tuti', category: 'byproduct', has_variety: false, sale_unit: 'kg', sort_order: 31, active: true },
  { name: 'Other', category: 'other', has_variety: true, sale_unit: 'kg', sort_order: 99, active: true },
];

export const PROCESSES = [
  { value: 'Raw', label: 'Raw / White Milling' },
  { value: 'Sella', label: 'Parboiled / Sella' },
  { value: 'Steam', label: 'Steam' },
];

export const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Bank', label: 'Bank Transfer' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'Online', label: 'Online (JazzCash / Easypaisa / Raast)' },
];

export const PAID_VIA = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Bank', label: 'Bank' },
  { value: 'Udhaar', label: 'Udhaar (party ke khata mein)' },
];

export const EXPENSE_CATEGORIES = [
  'Diesel', 'Bijli (Electricity)', 'Gas', 'Spare Parts', 'Bardana / Packing', 'Mazdoori (misc)', 'Salary', 'Rent',
  'Repair & Maintenance', 'Transport (misc)', 'Chai-Pani / Mehman', 'Office / Stationery', 'Mobile / Internet',
  'Fumigation / Dawai', 'Sukhai / Drying', 'Other',
];

export const MACHINES = [
  'Huller', 'Sheller / Husker', 'Paddy Separator', 'Whitener', 'Polisher', 'Silky Polisher', 'Color Sorter',
  'Grader / Sieve', 'Paddy Cleaner', 'Destoner', 'Boiler', 'Dryer', 'Parboiling Tank', 'Elevator / Conveyor',
  'Generator', 'Weighbridge (Kanta)', 'Other',
];

export const TRANSPORT_TYPES = ['Delivery', 'Paddy Freight', 'Loading', 'Unloading', 'Arhti Commission', 'Broker Commission'];

// Which khata an "Udhaar" transport entry goes to
export function transportPartyType(entryType) {
  if (entryType === 'Arhti Commission') return 'Arhti';
  if (entryType === 'Broker Commission') return 'Broker';
  return 'Transporter';
}

export const STOCK_ADJ_REASONS = [
  'Opening Stock', 'Shortage / Kami', 'Gain / Izafa', 'Boiler Fuel (Husk)', 'Own Use', 'Damage / Kharab',
  'Bahar se Khareed (Other Purchase)', 'Other',
];

// direction: fixed In/Out; null = user chooses; transfer = moves between Cash and Bank
export const CASH_CATEGORIES = [
  { value: 'Opening Balance', dir: null },
  { value: 'Owner Capital', dir: 'In' },
  { value: 'Owner Drawings', dir: 'Out' },
  { value: 'Cash to Bank', transfer: true },
  { value: 'Bank to Cash', transfer: true },
  { value: 'Loan Received', dir: 'In' },
  { value: 'Loan Repaid', dir: 'Out' },
  { value: 'Kanta Fee (Weighbridge)', dir: 'In' },
  { value: 'Other Income', dir: 'In' },
  { value: 'Other Expense', dir: 'Out' },
];

export const TAX_TYPES = ['Sales Tax/GST', 'Withholding Tax', 'Income Tax (Advance)', 'Market Fee', 'Other'];

export const PAY_TYPES = [
  { value: 'Daily', label: 'Dihari (Daily wage)', unit: 'Din', rate: 'Dihari (Rs)' },
  { value: 'Piece', label: 'Piece rate (per bag)', unit: 'Bags', rate: 'Rate per bag (Rs)' },
  { value: 'Monthly', label: 'Monthly salary', unit: 'Mahine', rate: 'Tankhwah (Rs)' },
];

export const SOURCE_LABELS = {
  manual: 'Manual',
  purchase: 'Kharid',
  sale: 'Sale',
  payment: 'Payment',
  labor: 'Mazdoori',
  labor_pay: 'Mazdoori adaigi',
  expense: 'Kharcha (udhaar)',
  machinery: 'Machine (udhaar)',
  transport: 'Transport (udhaar)',
  opening: 'Opening',
  bags: 'Bardana',
  brought_forward: 'B/F',
};

export const CASH_SOURCE_LABELS = {
  payment: 'Payment',
  purchase: 'Kharid',
  sale: 'Sale',
  expense: 'Kharcha',
  machinery: 'Machine',
  transport: 'Transport',
  labor: 'Mazdoori',
  zakat: 'Zakat',
  cash: 'Cash Book',
};

export const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'CNY'];

export const RATE_UNITS = [
  { value: 'maund', label: 'Fi maund (40 kg)' },
  { value: 'kg', label: 'Fi kg' },
  { value: 'mt', label: 'Fi metric ton (1000 kg)' },
];
export const RATE_UNIT_SHORT = { maund: 'md', kg: 'kg', mt: 'MT' };

export const PAYMENT_TERMS = ['Advance', 'Cash on delivery', 'Credit 15 din', 'Credit 30 din', 'LC at sight', 'LC 90 days',
  'CAD (cash against documents)', 'TT 30% advance, 70% against BL'];

export const CONTRACT_STATUSES = ['Open', 'Completed', 'Cancelled'];

export const WEIGH_KINDS = [
  { value: 'Purchase', label: 'Kharid (paddy aamad)' },
  { value: 'Sale', label: 'Sale (maal rawana)' },
  { value: 'Public', label: 'Public (bahar ka wazan, fee)' },
];

export const DRYING_METHODS = ['Dhoop (sun)', 'Dryer (machine)', 'Dono'];
export const BAG_TYPES = ['Jute', 'PP (plastic)', 'Other'];
export const BAG_MOVEMENTS = [
  { value: 'Issued', label: 'Party ko di (issued)' },
  { value: 'Returned', label: 'Party se wapas aayi (returned)' },
  { value: 'Purchased', label: 'Mill ne khareedi (stock mein)' },
  { value: 'Used', label: 'Istemal / kharab / bech di' },
];
