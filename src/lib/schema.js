// Column list + type of every business table. Used by CSV export/import and
// the full backup, so an import never sends a column the database doesn't
// have, and text like cheque numbers "000123" keeps its leading zeros.
export const TABLES = {
  products: {
    label: 'Products (maal)', module: 'products', dateField: null,
    cols: { name: 'text', category: 'text', has_variety: 'bool', sale_unit: 'text', active: 'bool', sort_order: 'int', notes: 'text' },
  },
  varieties: {
    label: 'Varieties', module: 'products', dateField: null,
    cols: { name: 'text', active: 'bool', sort_order: 'int', notes: 'text' },
  },
  contracts: {
    label: 'Sauda / Contracts', module: 'sales', dateField: 'date',
    cols: {
      contract_no: 'text', date: 'date', kind: 'text', party_type: 'text', party_name: 'text', item: 'text', variety: 'text',
      qty_kg: 'number', rate: 'number', rate_unit: 'text', currency: 'text', fx_rate: 'number', delivery_from: 'date',
      delivery_to: 'date', payment_terms: 'text', status: 'text', notes: 'text',
    },
  },
  weighments: {
    label: 'Kanta (Weighbridge)', module: 'weighbridge', dateField: 'date',
    cols: {
      slip_no: 'text', date: 'date', kind: 'text', vehicle_no: 'text', party_name: 'text', item: 'text', first_wt: 'number',
      second_wt: 'number', net_wt: 'number', fee: 'number', status: 'text', notes: 'text',
    },
  },
  drying_batches: {
    label: 'Sukhai (Drying)', module: 'production', dateField: 'date',
    cols: { date: 'date', variety: 'text', lot_ref: 'text', method: 'text', weight_before_kg: 'number', weight_after_kg: 'number', loss_kg: 'number', moisture_before: 'number', moisture_after: 'number', notes: 'text' },
  },
  bag_movements: {
    label: 'Bardana (Bags)', module: 'stock', dateField: 'date',
    cols: { date: 'date', movement: 'text', party_type: 'text', party_name: 'text', bag_type: 'text', qty: 'int', rate: 'number', charge_to_party: 'bool', notes: 'text' },
  },
  parties: {
    label: 'Parties', module: 'parties', dateField: null,
    cols: { party_type: 'text', name: 'text', phone: 'text', address: 'text', cnic: 'text', opening_balance: 'number', opening_date: 'date', notes: 'text', active: 'bool' },
  },
  purchases: {
    label: 'Paddy Purchase', module: 'purchase', dateField: 'date',
    cols: {
      date: 'date', slip_no: 'text', mode: 'text', khata_of: 'text', farmer_name: 'text', arhti_name: 'text', variety: 'text', vehicle_no: 'text',
      bags: 'int', gross_wt: 'number', tare_wt: 'number', bag_wt_kg: 'number', deduction_kg: 'number', net_wt: 'number',
      moisture_pct: 'number', broken_pct: 'number', fm_pct: 'number', rate_per_maund: 'number', amount: 'number',
      commission_pct: 'number', commission_amount: 'number', labor_charges: 'number', total_payable: 'number',
      advance_applied: 'number', net_payable: 'number', notes: 'text',
    },
  },
  sales: {
    label: 'Sales & Billing', module: 'sales', dateField: 'date',
    cols: {
      date: 'date', invoice_no: 'text', customer: 'text', type: 'text', item: 'text', variety: 'text', bags: 'int', qty_kg: 'number',
      rate: 'number', rate_unit: 'text', tax_pct: 'number', amount: 'number', tax_amount: 'number', net_amount: 'number',
      received_now: 'number', vehicle_no: 'text', container_no: 'text', shipment_date: 'date', notes: 'text',
      currency: 'text', fx_rate: 'number', amount_fc: 'number', buyer_ref: 'text', destination: 'text', port_loading: 'text',
      port_discharge: 'text', vessel: 'text', bl_no: 'text', lc_no: 'text', payment_terms: 'text', packing: 'text', gross_weight_kg: 'number',
    },
  },
  payments: {
    label: 'Payments & Cheques', module: 'payments', dateField: 'date',
    cols: {
      date: 'date', party_type: 'text', party_name: 'text', direction: 'text', method: 'text', amount: 'number',
      cheque_no: 'text', bank_name: 'text', due_date: 'date', status: 'text', notes: 'text',
    },
  },
  ledger_entries: {
    label: 'Khata (manual entries)', module: 'ledger', dateField: 'date',
    cols: { date: 'date', party_type: 'text', party_name: 'text', description: 'text', debit: 'number', credit: 'number', source: 'text' },
  },
  production_batches: {
    label: 'Production', module: 'production', dateField: 'date',
    cols: {
      date: 'date', lot_no: 'text', process: 'text', variety: 'text', paddy_input_kg: 'number', rice_output_kg: 'number',
      kanki25: 'number', kanki50: 'number', kanki100: 'number', bran_kg: 'number', husk_kg: 'number', wastage_kg: 'number',
      recovery_pct: 'number', notes: 'text', outputs: 'json',
    },
  },
  stock_lots: {
    label: 'Godown Lots', module: 'stock', dateField: 'date_in',
    cols: {
      godown: 'text', lot_no: 'text', item: 'text', variety: 'text', bags: 'int', weight_per_bag_kg: 'number', total_weight_kg: 'number',
      date_in: 'date', last_fumigation: 'date', status: 'text', notes: 'text',
    },
  },
  stock_adjustments: {
    label: 'Stock Adjustments', module: 'stock', dateField: 'date',
    cols: { date: 'date', item: 'text', variety: 'text', direction: 'text', qty_kg: 'number', reason: 'text', notes: 'text' },
  },
  labor_entries: {
    label: 'Labor & Wages', module: 'labor', dateField: 'date',
    cols: {
      name: 'text', date: 'date', pay_type: 'text', rate_or_wage: 'number', units_or_days: 'number', advance_deducted: 'number',
      gross: 'number', net_pay: 'number', paid: 'bool', paid_date: 'date', paid_via: 'text', notes: 'text',
    },
  },
  transport_entries: {
    label: 'Transport', module: 'transport', dateField: 'date',
    cols: {
      date: 'date', entry_type: 'text', vehicle_no: 'text', driver_name: 'text', party_name: 'text', from_location: 'text', to_location: 'text',
      item: 'text', qty_kg: 'number', freight_rate_per_kg: 'number', freight_amount: 'number', commission_base_amount: 'number',
      commission_pct: 'number', commission_amount: 'number', total_amount: 'number', paid_via: 'text', notes: 'text',
    },
  },
  machinery_log: {
    label: 'Machinery Log', module: 'machinery', dateField: 'date',
    cols: {
      date: 'date', machine: 'text', issue_description: 'text', action_taken: 'text', cost: 'number', paid_via: 'text',
      party_name: 'text', next_service_due: 'date', status: 'text',
    },
  },
  expenses: {
    label: 'Daily Expenses', module: 'expenses', dateField: 'date',
    cols: { date: 'date', category: 'text', description: 'text', amount: 'number', paid_via: 'text', party_name: 'text' },
  },
  cash_entries: {
    label: 'Cash Book entries', module: 'cashbook', dateField: 'date',
    cols: { date: 'date', account: 'text', direction: 'text', category: 'text', amount: 'number', description: 'text' },
  },
  tax_records: {
    label: 'Tax Records', module: 'tax', dateField: 'date',
    cols: {
      date: 'date', tax_type: 'text', reference: 'text', taxable_amount: 'number', tax_pct: 'number', tax_amount: 'number',
      status: 'text', notes: 'text',
    },
  },
  zakat_assessments: {
    label: 'Zakat', module: 'zakat', dateField: 'assessment_date',
    cols: {
      assessment_date: 'date', cash_in_hand: 'number', bank_balance: 'number', stock_value: 'number', receivables: 'number',
      payables: 'number', nisab_threshold: 'number', zakatable_amount: 'number', zakat_due: 'number', paid_amount: 'number',
      paid_date: 'date', notes: 'text',
    },
  },
};

// Everything that goes into a Full Backup (settings first)
export const BACKUP_TABLES = ['settings', ...Object.keys(TABLES)];
