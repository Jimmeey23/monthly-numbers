const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'Sales - Raw - Sales (10).csv');
const target = path.join(root, 'assets', 'sales-drill-index.js');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toNumber(value) {
  const n = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function studioKey(location) {
  const s = clean(location).toLowerCase();
  if (s.includes('kwality')) return 'kwality';
  if (s.includes('supreme') || s.includes('bandra')) return 'supreme';
  if (s.includes('kenkere') || s.includes('bengaluru')) return 'kenkere';
  if (s.includes('pop')) return 'popup';
  return '';
}

function pushIndex(index, key, rowIndex) {
  if (!key.endsWith(':')) (index[key] ||= []).push(rowIndex);
}

function main() {
  const text = fs.readFileSync(source, 'utf8');
  const [headers, ...records] = parseCsv(text);
  const col = Object.fromEntries(headers.map((h, i) => [h, i]));
  const rows = [];
  const index = {};

  records.forEach(record => {
    const paymentDate = clean(record[col['Payment Date']]);
    const month = paymentDate.slice(0, 7);
    const studio = studioKey(record[col['Calculated Location']] || record[col['Home Location']]);
    const value = toNumber(record[col['Payment Value']]);
    const status = clean(record[col['Payment Status']]);
    if (!month || !studio || !value || /failed|void|cancel|refund/i.test(status)) return;

    const row = [
      clean(record[col['Customer Name']]),
      paymentDate.slice(0, 10),
      clean(record[col['Payment Item']] || record[col['Sale Item Name']]),
      clean(record[col['Membership Name']] || record[col['Membership Type']] || record[col['Sale Item Name']]),
      value,
      clean(record[col['Calculated Location']] || record[col['Home Location']]),
      toNumber(record[col['Discount Amount -Mrp- Payment Value']] || record[col['Discount Value In Currency']]),
      toNumber(record[col['Discount Percentage - discount amount/mrp*100']]),
      clean(record[col['Cleaned Product']]),
      clean(record[col['Cleaned Category']]),
      clean(record[col['Payment Transaction ID']] || record[col['Transaction ID']]),
      clean(record[col['Sold By']]),
      clean(record[col['Payment Method']] || record[col['Payment Source']]),
      status,
      clean(record[col['Purchase Tag']])
    ];
    const rowIndex = rows.push(row) - 1;
    const prefix = `${month}|${studio}|`;
    pushIndex(index, `${prefix}all:sales`, rowIndex);
    pushIndex(index, `${prefix}category:${row[9]}`, rowIndex);
    pushIndex(index, `${prefix}product:${row[8]}`, rowIndex);
    pushIndex(index, `${prefix}member:${row[0]}`, rowIndex);
    pushIndex(index, `${prefix}seller:${row[11]}`, rowIndex);
    pushIndex(index, `${prefix}purchaseTag:${row[14]}`, rowIndex);
  });

  const payload = {
    schema: ['Member Name', 'Date', 'Payment Item', 'Membership Name', 'Payment Value', 'Location', 'Discount Amount', 'Discount %', 'Product', 'Category', 'Transaction ID', 'Sold By', 'Payment Method', 'Payment Status', 'Purchase Tag'],
    rows,
    index
  };
  fs.writeFileSync(target, `window.SALES_DRILL_INDEX=${JSON.stringify(payload)};\n`);
  console.log(`Wrote ${path.relative(root, target)} with ${rows.length} rows and ${Object.keys(index).length} drill paths`);
}

main();
