const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'assets', 'raw-drill-index.js');

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
      } else if (ch === '"') quoted = false;
      else cell += ch;
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
    } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  const n = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function studioKey(value) {
  const s = clean(value).toLowerCase();
  if (s.includes('kwality') || s.includes('kemps')) return 'kwality';
  if (s.includes('supreme') || s.includes('bandra')) return 'supreme';
  if (s.includes('kenkere')) return 'kenkere';
  if (s.includes('pop')) return 'popup';
  return '';
}

function rowStudio(record, preferred = []) {
  for (const value of preferred) {
    const key = studioKey(value);
    if (key) return key;
  }
  for (const value of record) {
    const key = studioKey(value);
    if (key) return key;
  }
  return '';
}

function parseDate(value) {
  const s = clean(value);
  if (!s || s === '-') return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return { year: Number(dmy[3]), month: Number(dmy[2]), day: Number(dmy[1]) };
  return null;
}

function periodFromDate(value) {
  const d = parseDate(value);
  if (!d || d.year < 2020 || d.year > 2030) return '';
  return `${d.year}-${String(d.month).padStart(2, '0')}`;
}

function bestPeriod(record, preferred = []) {
  for (const value of preferred) {
    const p = periodFromDate(value);
    if (p) return p;
  }
  for (const value of record) {
    const p = periodFromDate(value);
    if (p) return p;
  }
  return '';
}

function daypart(time) {
  const hour = Number(clean(time).slice(0, 2));
  if (!Number.isFinite(hour)) return '';
  if (hour < 11) return 'Morning';
  if (hour < 16) return 'Midday';
  return 'Evening';
}

function pushIndex(index, key, rowIndex) {
  if (!key.endsWith(':')) (index[key] ||= []).push(rowIndex);
}

function readCsv(file) {
  const [headers, ...records] = parseCsv(fs.readFileSync(path.join(root, file), 'utf8'));
  const col = Object.fromEntries(headers.map((h, i) => [h, i]));
  return { records, col };
}

function addSessions(rows, index) {
  const { records, col } = readCsv('Day End Report - Part 3 - Sessions (11).csv');
  records.forEach(record => {
    const date = clean(record[col.Date]);
    const period = periodFromDate(date);
    const studio = rowStudio(record, [record[col.Location]]);
    if (!period || !studio) return;
    const time = clean(record[col.Time]);
    const sessionDaypart = daypart(time);
    const row = [
      date,
      time,
      clean(record[col.Class]),
      clean(record[col.SessionName]),
      clean(record[col.Trainer]),
      clean(record[col.Location]),
      toNumber(record[col.Capacity]),
      toNumber(record[col.CheckedIn]),
      toNumber(record[col.Booked]),
      toNumber(record[col.LateCancelled]),
      toNumber(record[col.Revenue]),
      clean(record[col.Type]),
      clean(record[col.Day]),
      clean(record[col.SessionID])
    ];
    const rowIndex = rows.push(row) - 1;
    const prefix = `${period}|${studio}|`;
    pushIndex(index, `${prefix}sessionAll:all`, rowIndex);
    pushIndex(index, `${prefix}sessionClass:${row[2]}`, rowIndex);
    pushIndex(index, `${prefix}sessionFormat:${row[11]}`, rowIndex);
    pushIndex(index, `${prefix}sessionTrainer:${row[4]}`, rowIndex);
    pushIndex(index, `${prefix}sessionDaypart:${sessionDaypart}`, rowIndex);
    pushIndex(index, `${prefix}sessionWeekday:${row[12]}`, rowIndex);
  });
}

function addNewMembers(rows, index) {
  const { records, col } = readCsv('Day End Report - Part 1 - New (5).csv');
  records.forEach(record => {
    const period = bestPeriod(record, [record[col['First Visit Date']]]);
    const studio = rowStudio(record, [record[col['First Visit Location']], record[col['Home Location']]]);
    if (!period || !studio) return;
    const first = `${clean(record[col['First Name']])} ${clean(record[col['Last Name']])}`.trim();
    const row = [
      first || clean(record[col.Email]),
      clean(record[col.Email]),
      clean(record[col['Phone Number']]),
      clean(record[col['First Visit Date']]),
      clean(record[col['First Visit Entity Name']]),
      clean(record[col['First Visit Location']] || record[col['Home Location']]),
      clean(record[col['Trainer Name']]),
      clean(record[col['Is New']]),
      clean(record[col.Source] || 'Unattributed') || 'Unattributed',
      toNumber(record[col['Visits Post Trial']]),
      toNumber(record[col['Purchase Count Post Trial']]),
      clean(record[col['First Purchase Post Trial']]),
      toNumber(record[col.Ltv]),
      clean(record[col['Conversion Status']]),
      clean(record[col['Retention Status']])
    ];
    const rowIndex = rows.push(row) - 1;
    const prefix = `${period}|${studio}|`;
    pushIndex(index, `${prefix}newAll:all`, rowIndex);
    if (/^new/i.test(row[7])) {
      pushIndex(index, `${prefix}newSource:${row[8]}`, rowIndex);
      pushIndex(index, `${prefix}newType:${row[7]}`, rowIndex);
      pushIndex(index, `${prefix}newClass:${row[4]}`, rowIndex);
      pushIndex(index, `${prefix}newTrainer:${row[6]}`, rowIndex);
    }
  });
}

function addLeads(rows, index) {
  const { records } = readCsv('❖ PM - Leads ❖ - ◉ Leads (23).csv');
  records.forEach(record => {
    const period = periodFromDate(record[6]);
    const studio = rowStudio(record);
    if (!period || !studio) return;
    const sourceGroup = clean(record[12]) || clean(record[26]) || 'Unattributed';
    const status = clean(record[21] || record[23] || record[4]);
    const trialStatus = clean(record[18] || record[29]);
    const conversionStatus = clean(record[21] === 'Won' ? 'Won' : record[30] || status);
    const retentionStatus = clean(record[22] || record[31]);
    const row = [
      clean(record[1]),
      clean(record[23]),
      clean(record[2]),
      clean(record[6]),
      clean(record[11]),
      sourceGroup,
      status,
      trialStatus,
      conversionStatus,
      retentionStatus,
      toNumber(record[16]),
      toNumber(record[27]),
      toNumber(record[28]),
      clean(record[5]),
      clean(record[8]),
      clean(record[10])
    ];
    const rowIndex = rows.push(row) - 1;
    const prefix = `${period}|${studio}|`;
    pushIndex(index, `${prefix}leadAll:all`, rowIndex);
    pushIndex(index, `${prefix}leadSource:${sourceGroup}`, rowIndex);
    pushIndex(index, `${prefix}leadStage:${status}`, rowIndex);
  });
}

function addLapsed(rows, index) {
  const { records, col } = readCsv('Lapsed New - Lapsed (12).csv');
  records.forEach(record => {
    const period = periodFromDate(record[col['End Date']]);
    const studio = rowStudio(record, [record[col['Primary Location']], record[col['Locations Attended']]]);
    if (!period || !studio) return;
    const row = [
      clean(record[col['Member Name']]),
      clean(record[col['Member Email']]),
      clean(record[col.Status]),
      clean(record[col['Membership Name']]),
      clean(record[col['Purchase Date']]),
      clean(record[col['Start Date']]),
      clean(record[col['End Date']]),
      clean(record[col['Churned Date']]),
      toNumber(record[col['Amount Paid']]),
      toNumber(record[col['Discount Value']]),
      clean(record[col['Sold By']] || record[col['Created By']]),
      toNumber(record[col['Total Sessions Completed']]),
      toNumber(record[col['Sessions Used %']]),
      toNumber(record[col['Late Cancellations']]),
      toNumber(record[col['No Shows']]),
      clean(record[col['Primary Location']])
    ];
    const rowIndex = rows.push(row) - 1;
    const prefix = `${period}|${studio}|`;
    pushIndex(index, `${prefix}lapsedAll:all`, rowIndex);
    pushIndex(index, `${prefix}lapsedMembership:${row[3]}`, rowIndex);
    pushIndex(index, `${prefix}lapsedStatus:${row[2]}`, rowIndex);
  });
}

function main() {
  const payload = {
    schemas: {
      sessions: ['Date', 'Time', 'Class', 'Session', 'Instructor', 'Location', 'Capacity', 'Checked In', 'Booked', 'Late Cancelled', 'Revenue', 'Format', 'Day', 'Session ID'],
      newMembers: ['Member', 'Email', 'Phone', 'First Visit Date', 'First Visit Class', 'Location', 'Instructor', 'New Type', 'Source', 'Visits Post Trial', 'Purchases Post Trial', 'First Purchase', 'LTV', 'Conversion Status', 'Retention Status'],
      leads: ['Lead / Contact', 'Name / Segment', 'Associate', 'Lead Date', 'Center', 'Source Group', 'Stage', 'Trial Status', 'Conversion Status', 'Retention Status', 'LTV', 'Purchases', 'Visits', 'Remarks', 'Follow-up 1', 'Follow-up 2'],
      lapsed: ['Member', 'Email', 'Status', 'Membership', 'Purchase Date', 'Start Date', 'End Date', 'Churned Date', 'Amount Paid', 'Discount', 'Sold By', 'Sessions Completed', 'Sessions Used %', 'Late Cancellations', 'No Shows', 'Primary Location']
    },
    rows: { sessions: [], newMembers: [], leads: [], lapsed: [] },
    index: {}
  };
  addSessions(payload.rows.sessions, payload.index);
  addNewMembers(payload.rows.newMembers, payload.index);
  addLeads(payload.rows.leads, payload.index);
  addLapsed(payload.rows.lapsed, payload.index);
  fs.writeFileSync(target, `window.RAW_DRILL_INDEX=${JSON.stringify(payload)};\n`);
  const count = Object.values(payload.rows).reduce((a, rows) => a + rows.length, 0);
  console.log(`Wrote ${path.relative(root, target)} with ${count} rows and ${Object.keys(payload.index).length} drill paths`);
}

main();
