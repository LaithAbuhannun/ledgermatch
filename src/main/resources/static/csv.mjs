/** Parse quoted CSV without splitting quoted commas or embedded newlines. */
export function readCsv(text) {
  const input = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"') {
      if (cell || closed) throw Error('Unexpected quotation mark. Check the CSV format.');
      quoted = true;
    } else {
      if (closed && !/\s/.test(char)) throw Error('Unexpected text after a quoted value.');
      if (!closed) cell += char;
    }
  }
  if (quoted) throw Error('A quoted value is missing its closing quotation mark.');
  finishRow();
  if (!rows.length) throw Error('This file is empty.');
  return rows;
}
export function parsePayments(text) {
  const rows = readCsv(text);
  const header = rows.shift().map(value => value.trim().toLowerCase());
  if (header.length !== 3 || new Set(header).size !== 3 || !['reference','amount','currency'].every(key => header.includes(key))) {
    throw Error('Use the column headings reference, amount and currency. Download a sample file below.');
  }
  if (!rows.length) throw Error('This file has headings but no payments.');
  if (rows.length > 5000) throw Error('This file has more than 5,000 payments. Split it into smaller files.');
  return rows.map((values, index) => {
    const line = index + 2;
    if (values.length !== 3) throw Error(`Payment row ${line} must have three columns.`);
    const entry = Object.fromEntries(header.map((name, column) => [name, values[column].trim()]));
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(entry.reference)) throw Error(`Payment row ${line}: use a reference with letters, numbers, dots, hyphens or underscores.`);
    if (!/^-?\d{1,13}(\.\d{1,2})?$/.test(entry.amount) || Number(entry.amount) === 0) throw Error(`Payment row ${line}: enter a non-zero amount with up to two decimal places, without currency signs or commas.`);
    entry.currency = entry.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(entry.currency)) throw Error(`Payment row ${line}: use a three-letter currency code, such as AUD.`);
    // Keep amounts as strings so parsing does not round monetary values.
    return entry;
  });
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function reportCsv(report, reviews = []) {
  const reviewMap = new Map(reviews.map(r => [r.reference,r]));
  const rows = [['reference','status','source','amount','currency','review_status','owner','latest_note']];
  for (const finding of report.findings) {
    for (const source of ['ledger','bank']) {
      const entries = finding[source].length ? finding[source] : [{amount:'',currency:''}];
      for (const entry of entries) { const review=reviewMap.get(finding.reference); rows.push([finding.reference,finding.status,source,entry.amount,entry.currency,review?.status || (finding.status==='MATCHED'?'':'OPEN'),review?.owner || '',review?.history.at(-1)?.note || '']); }
    }
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function parseMappedPayments(text, mapping) {
  const rows=readCsv(text),header=rows.shift();
  if(!header || !rows.length)throw Error('This file has no payments.');
  const ref=Number(mapping.reference),amount=Number(mapping.amount),fixed=String(mapping.currency).startsWith('fixed:');
  const currency=fixed ? mapping.currency.slice(6) : Number(mapping.currency);
  const indexes=fixed ? [ref,amount] : [ref,amount,currency];
  if(new Set(indexes).size!==indexes.length || indexes.some(i=>!Number.isInteger(i)||i<0||i>=header.length))throw Error('Choose a different column for each field.');
  const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const canonical=['reference,amount,currency'];
  for(const values of rows){
    if(values.length!==header.length)throw Error('One row has a different number of columns. Check the source file.');
    canonical.push([values[ref],values[amount],fixed?currency:values[currency]].map(quote).join(','));
  }
  return parsePayments(canonical.join('\n'));
}
