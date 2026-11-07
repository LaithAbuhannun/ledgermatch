import { parsePayments, reportCsv } from './csv.mjs';

const el = id => document.getElementById(id);
const files = { ledger: null, bank: null };
let report = null, sample = false, showAll = false, previousBody = null, requestKey = null, busy = false;
const labels = { MATCHED:'Matched', MISSING_IN_BANK:'Not in bank file', MISSING_IN_LEDGER:'Not in your records', AMOUNT_MISMATCH:'Different amounts', CURRENCY_MISMATCH:'Different currencies', DUPLICATE_REFERENCE:'Duplicate reference' };
const descriptions = {
  MATCHED:['The reference, amount and currency match in both files.', 'No discrepancy was found for this reference.'],
  MISSING_IN_BANK:['This payment appears in your records but not in the bank file.', 'Check settlement timing and whether the bank file includes this payment.'],
  MISSING_IN_LEDGER:['The bank file includes this payment, but it is missing from your records.', 'Check whether the payment was recorded under a different reference or has not yet been entered.'],
  AMOUNT_MISMATCH:['Both files contain this reference in the same currency, but the amounts differ.', 'Check for fees, partial settlements or an incorrect amount before making any adjustment.'],
  CURRENCY_MISMATCH:['Both files contain this reference, but they use different currencies.', 'Check the currency in each source. No currency conversion has been applied.'],
  DUPLICATE_REFERENCE:['This reference occurs more than once in at least one file. Every source row is shown below.', 'Check whether the repeated rows are duplicates or separate payments sharing a reference. No rows have been merged.']
};
const money = entry => `${entry.currency} ${Number(entry.amount).toLocaleString('en-AU', {minimumFractionDigits:2,maximumFractionDigits:2})}`;
function message(text, error = false) { el('message').textContent = text; el('message').classList.toggle('error', error); }
function hideStaleReport() { report = null; el('results').hidden = true; el('empty').hidden = false; }
function updateButton() {
  el('submit').disabled = busy || !files.ledger || !files.bank;
  for (const id of ['account','date','ledger-file','bank-file','connect','key']) el(id).disabled = busy;
}
function tableFor(entries) {
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const text of ['Reference','Amount','Currency']) { const th = document.createElement('th'); th.textContent = text; head.append(th); }
  const body = table.createTBody();
  for (const entry of entries) { const row = body.insertRow(); for (const value of [entry.reference,Number(entry.amount).toFixed(2),entry.currency]) { const td = row.insertCell(); td.textContent = value; } }
  if (!entries.length) { const td = body.insertRow().insertCell(); td.colSpan = 3; td.textContent = 'No payment in this file.'; }
  return table;
}
function preview() {
  const target = el('preview-tables'); target.replaceChildren();
  el('preview').hidden = !files.ledger && !files.bank;
  for (const source of ['ledger','bank']) {
    if (!files[source]) continue;
    const container = document.createElement('div'), title = document.createElement('h4');
    title.textContent = source === 'ledger' ? 'Your payment records' : 'Bank settlement';
    const wrap = document.createElement('div'); wrap.className = 'table-wrap'; wrap.append(tableFor(files[source].slice(0,3)));
    const hint = document.createElement('p'); hint.textContent = `Showing ${Math.min(files[source].length,3)} of ${files[source].length} payments`;
    container.append(title,wrap,hint); target.append(container);
  }
}
for (const source of ['ledger','bank']) {
  el(`${source}-file`).addEventListener('change', async event => {
    const input = event.target, file = input.files[0], status = el(`${source}-status`);
    files[source] = null; hideStaleReport(); updateButton(); status.classList.remove('error');
    if (!file) { status.textContent = 'No file selected'; preview(); return; }
    status.textContent = 'Reading file…';
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Choose a CSV file smaller than 2 MB.');
      const text = await file.text();
      if (input.files[0] !== file) return;
      files[source] = parsePayments(text);
      status.textContent = `${files[source].length.toLocaleString()} payments ready`;
      message(files.ledger && files.bank ? 'Both files are ready. Compare payments when you’re ready.' : 'File added. Choose the other file to continue.');
    } catch (error) { status.textContent = error.message; status.classList.add('error'); message('Check the highlighted file before continuing.', true); }
    preview(); updateButton();
  });
}
for (const name of ['account','date']) el(name).addEventListener('input', hideStaleReport);
el('connect').addEventListener('click', async () => {
  const key = el('key').value;
  if (!key) { message('Enter your workspace access key.', true); el('key').focus(); return; }
  el('connect').disabled = true;
  try {
    const response = await fetch('/api/batches?size=1', {headers:{'X-API-Key':key}});
    if (!response.ok) throw Error(response.status === 401 ? 'That access key was not recognised. Try again.' : 'The workspace could not be reached. Try again.');
    el('connected').textContent = 'Connected'; el('connection').open = false; message('Workspace connected. You can now compare your files.');
  } catch (error) { el('connected').textContent = 'Not connected'; message(error.message,true); }
  finally { el('connect').disabled = false; }
});
el('key').addEventListener('input', () => { el('connected').textContent = 'Not connected'; });
el('demo').addEventListener('click', async () => {
  if (busy) return;
  el('demo').disabled = true;
  try {
    const response = await fetch('/demo/report');
    if (!response.ok) throw Error('The example could not be loaded. Please try again.');
    report = await response.json(); sample = true; resetFilters(); render();
    message('Example loaded. Open any row to see why it needs review.');
  } catch (error) { message(error.message,true); }
  finally { el('demo').disabled = false; }
});
el('submit').addEventListener('click', async () => {
  if (busy || !files.ledger || !files.bank) return;
  const accountLabel = el('account').value.trim(), settlementDate = el('date').value, key = el('key').value;
  if (!accountLabel) { message('Add an account name so you can identify this comparison.',true); el('account').focus(); return; }
  if (!settlementDate) { message('Choose the settlement date.',true); el('date').focus(); return; }
  if (!key) { el('connection').open = true; message('Connect to your workspace to compare your own files.',true); el('key').focus(); return; }
  busy = true; updateButton(); el('demo').disabled = true; hideStaleReport(); message('Comparing your payments…');
  const body = JSON.stringify({accountLabel,settlementDate,ledger:files.ledger,bank:files.bank});
  if (body !== previousBody) { requestKey = crypto.randomUUID(); previousBody = body; }
  try {
    const response = await fetch('/api/batches', {method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key,'Idempotency-Key':requestKey},body});
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) { el('connection').open = true; throw Error('The workspace access key was not recognised. Check it and try again.'); }
      if (response.status === 409) throw Error('This comparison conflicts with an earlier submission. Refresh the page and try again.');
      throw Error(data.errors?.length ? 'Some payment details were not accepted. Check currency codes and the file format, then try again.' : 'The comparison could not be completed. Please try again.');
    }
    report = data; sample = false; resetFilters(); render();
    message(response.status === 201 ? 'Comparison saved. Your results are ready below.' : 'This comparison was already saved. Showing the existing result.');
  } catch (error) { message(error.message === 'Failed to fetch' ? 'Connection lost. Your files are still here; you can safely retry.' : error.message,true); }
  finally { busy = false; updateButton(); el('demo').disabled = false; }
});
function resetFilters() { showAll = false; el('filter').value = 'all'; el('search').value = ''; }
function render() {
  if (!report) return;
  el('empty').hidden = true; el('results').hidden = false; el('sample-notice').hidden = !sample;
  el('total').textContent = report.references; el('matched').textContent = report.counts.MATCHED; el('exceptions').textContent = report.exceptions;
  el('batch').textContent = `${report.accountLabel} · ${report.settlementDate}`;
  el('exceptions-tab').setAttribute('aria-pressed',String(!showAll)); el('all-tab').setAttribute('aria-pressed',String(showAll));
  const query = el('search').value.trim().toLowerCase(), filter = el('filter').value;
  const findings = report.findings.filter(f => (showAll || f.status !== 'MATCHED') && (filter === 'all' || f.status === filter) && f.reference.toLowerCase().includes(query));
  const rows = el('rows'); rows.replaceChildren();
  el('result-count').textContent = `${findings.length} ${findings.length === 1 ? 'reference' : 'references'} shown`;
  for (const finding of findings) {
    const row = rows.insertRow(); row.insertCell().textContent = finding.reference;
    const badge = document.createElement('span'); badge.className = 'badge' + (finding.status === 'MATCHED' ? ' matched' : ''); badge.textContent = labels[finding.status]; row.insertCell().append(badge);
    for (const source of ['ledger','bank']) {
      const cell = row.insertCell(); cell.className = 'money'; const entries = finding[source];
      if (entries.length > 1) { cell.textContent = `${entries.length} payments`; const note = document.createElement('span'); note.className = 'duplicate-count'; note.textContent = 'View each payment'; cell.append(note); }
      else cell.textContent = entries.length ? money(entries[0]) : '—';
    }
    const button = document.createElement('button'); button.className = 'row-detail'; button.textContent = 'View details'; button.setAttribute('aria-label',`View details for ${finding.reference}`); button.addEventListener('click',() => openDetails(finding)); row.insertCell().append(button);
  }
  if (!findings.length) { const cell = rows.insertRow().insertCell(); cell.colSpan = 5; cell.textContent = query || filter !== 'all' ? 'No payments match these filters. Clear the search or choose another issue type.' : showAll ? 'No payment references in this report.' : 'All payments match. There are no exceptions to review.'; }
}
function openDetails(finding) {
  el('detail-title').textContent = finding.reference;
  el('detail-explanation').textContent = descriptions[finding.status][0];
  el('detail-next').textContent = descriptions[finding.status][1];
  const target = el('detail-entries'); target.replaceChildren();
  for (const source of ['ledger','bank']) { const title = document.createElement('h3'); title.textContent = source === 'ledger' ? 'Your payment records' : 'Bank settlement'; const wrap = document.createElement('div'); wrap.className = 'table-wrap'; wrap.append(tableFor(finding[source])); target.append(title,wrap); }
  el('detail').showModal();
}
el('close-detail').addEventListener('click',() => el('detail').close());
el('exceptions-tab').addEventListener('click',() => { showAll = false; render(); });
el('all-tab').addEventListener('click',() => { showAll = true; render(); });
el('filter').addEventListener('change',render); el('search').addEventListener('input',render);
el('download').addEventListener('click',() => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + reportCsv(report)],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = `reconciliation-${report.settlementDate}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
});
