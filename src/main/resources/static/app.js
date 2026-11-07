import { parsePayments, parseMappedPayments, readCsv, reportCsv } from './csv.mjs';

const el = id => document.getElementById(id);
const files = { ledger: null, bank: null };
let report = null, sample = false, showAll = false, previousBody = null, requestKey = null, busy = false;
let reviews = new Map(), activeFinding = null, historyPage = 0, reviewerName = "", savingReview = false;
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
    title.textContent = source === 'ledger' ? 'Internal records' : 'Bank settlement';
    const wrap = document.createElement('div'); wrap.className = 'table-wrap'; wrap.append(tableFor(files[source].slice(0,3)));
    const hint = document.createElement('p'); hint.textContent = `Showing ${Math.min(files[source].length,3)} of ${files[source].length} payments`;
    container.append(title,wrap,hint); target.append(container);
  }
}
for (const source of ['ledger','bank']) {
  el(`${source}-file`).addEventListener('change', async event => {
    const input = event.target, file = input.files[0], status = el(`${source}-status`);
    input.parentElement.querySelector('.column-mapping')?.remove();
    files[source] = null; hideStaleReport(); updateButton(); status.classList.remove('error');
    if (!file) { status.textContent = 'No file selected'; preview(); return; }
    status.textContent = 'Reading file…';
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Choose a CSV file smaller than 2 MB.');
      const text = await file.text();
      if (input.files[0] !== file) return;
      showColumnMapping(source,text);
      try { files[source] = parsePayments(text); }
      catch(error) {
        if(error.message.includes('headings')) {
          status.textContent='Choose the columns below to read this file.';message('Map the source columns to continue.');preview();updateButton();return;
        }
        throw error;
      }
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
    report = await response.json(); sample = true; reviews = new Map(); resetFilters(); render();
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
    report = data; sample = false; reviews = new Map(); resetFilters(); render(); await loadReviews(); render();
    message(response.status === 201 ? 'Comparison saved. Your results are ready below.' : 'This comparison was already saved. Showing the existing result.');
  } catch (error) { message(error.message === 'Failed to fetch' ? 'Connection lost. Your files are still here; you can safely retry.' : error.message,true); }
  finally { busy = false; updateButton(); el('demo').disabled = false; }
});
function resetFilters() { showAll = false; el('filter').value = 'all'; el('search').value = ''; }
function render() {
  if (!report) return;
  el('empty').hidden = true; el('results').hidden = false; el('import-panel').hidden = true; el('sample-notice').hidden = !sample;
  el('total').textContent = report.references; el('matched').textContent = report.counts.MATCHED; el('exceptions').textContent = report.exceptions - [...reviews.values()].filter(r => r.status === 'RESOLVED').length;
  el('resolved').textContent = [...reviews.values()].filter(r => r.status === 'RESOLVED').length;
  el('batch').textContent = `${report.accountLabel} · ${report.settlementDate}`;
  el('exceptions-tab').setAttribute('aria-pressed',String(!showAll)); el('all-tab').setAttribute('aria-pressed',String(showAll));
  const query = el('search').value.trim().toLowerCase(), filter = el('filter').value;
  const findings = report.findings.filter(f => (showAll || (f.status !== 'MATCHED' && reviews.get(f.reference)?.status !== 'RESOLVED')) && (filter === 'all' || f.status === filter) && f.reference.toLowerCase().includes(query));
  const rows = el('rows'); rows.replaceChildren();
  el('result-count').textContent = `${findings.length} ${findings.length === 1 ? 'reference' : 'references'} shown`;
  for (const finding of findings) {
    const row = rows.insertRow(); row.insertCell().textContent = finding.reference;
    const badge = document.createElement('span'); badge.className = 'badge' + (finding.status === 'MATCHED' ? ' matched' : ''); badge.textContent = labels[finding.status]; row.insertCell().append(badge);
    const review = reviews.get(finding.reference);
    const reviewBadge = document.createElement('span'); reviewBadge.className = 'review-badge ' + (review?.status || 'OPEN').toLowerCase(); reviewBadge.textContent = finding.status === 'MATCHED' ? '—' : ({OPEN:'Open',IN_PROGRESS:'In progress',RESOLVED:'Resolved'}[review?.status || 'OPEN']); row.insertCell().append(reviewBadge); row.insertCell().textContent = review?.owner || '—';
    for (const source of ['ledger','bank']) {
      const cell = row.insertCell(); cell.className = 'money'; const entries = finding[source];
      if (entries.length > 1) { cell.textContent = `${entries.length} payments`; const note = document.createElement('span'); note.className = 'duplicate-count'; note.textContent = 'View each payment'; cell.append(note); }
      else cell.textContent = entries.length ? money(entries[0]) : '—';
    }
    const button = document.createElement('button'); button.className = 'row-detail'; button.textContent = 'View details'; button.setAttribute('aria-label',`View details for ${finding.reference}`); button.addEventListener('click',() => openDetails(finding)); row.insertCell().append(button);
  }
  if (!findings.length) { const cell = rows.insertRow().insertCell(); cell.colSpan = 7; cell.textContent = query || filter !== 'all' ? 'No payments match these filters. Clear the search or choose another issue type.' : showAll ? 'No payment references in this report.' : 'No open exceptions. Resolved discrepancies remain available under All payments.'; }
}
function openDetails(finding) {
  activeFinding = finding;
  el('detail-title').textContent = finding.reference;
  el('detail-explanation').textContent = descriptions[finding.status][0];
  el('detail-next').textContent = descriptions[finding.status][1];
  const target = el('detail-entries'); target.replaceChildren();
  for (const source of ['ledger','bank']) { const title = document.createElement('h3'); title.textContent = source === 'ledger' ? 'Internal records' : 'Bank settlement'; const wrap = document.createElement('div'); wrap.className = 'table-wrap'; wrap.append(tableFor(finding[source])); target.append(title,wrap); }
  fillReviewForm();
  el('detail').showModal();
}
el('close-detail').addEventListener('click',() => el('detail').close());
el('exceptions-tab').addEventListener('click',() => { showAll = false; render(); });
el('all-tab').addEventListener('click',() => { showAll = true; render(); });
el('filter').addEventListener('change',render); el('search').addEventListener('input',render);
el('download').addEventListener('click',() => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + reportCsv(report,[...reviews.values()])],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = `reconciliation-${report.settlementDate}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
});

async function workspaceRequest(path, options = {}) {
  const key = el('key').value;
  if (!key) throw Error('Connect to your workspace first.');
  const response = await fetch(path,{...options,headers:{'Content-Type':'application/json','X-API-Key':key,...options.headers}});
  const data = await response.json();
  if (!response.ok) throw Error(response.status === 401 ? 'Your workspace key was not recognised.' : response.status === 409 ? 'Someone saved a newer update. Close and reopen this payment to reload it.' : data.detail || 'The request could not be completed.');
  return data;
}
async function loadReviews() {
  if (!report || sample) return;
  const data = await workspaceRequest(`/api/batches/${report.batchId}/reviews`);
  reviews = new Map(data.map(r => [r.reference,r]));
}
function fillReviewForm() {
  const editable = !sample && activeFinding.status !== 'MATCHED';
  el('review-workflow').hidden = !editable;
  el('example-review-note').hidden = !sample;
  if (!editable) return;
  const review = reviews.get(activeFinding.reference);
  el('review-status').value = review?.status || 'OPEN';
  el('review-owner').value = review?.owner || '';
  el('review-actor').value = reviewerName;
  el('review-reason').value = review?.history.at(-1)?.reason || 'INVESTIGATING';
  el('review-note').value = '';
  el('review-message').textContent = '';
  const history = el('review-history'); history.replaceChildren();
  for (const event of (review?.history || []).slice().reverse()) {
    const item=document.createElement('li'),title=document.createElement('strong'),time=document.createElement('time'),note=document.createElement('p'),meta=document.createElement('span');
    title.textContent=`${event.actor} · ${{OPEN:'Open',IN_PROGRESS:'In progress',RESOLVED:'Resolved'}[event.status]}`;
    time.dateTime=event.createdAt;time.textContent=new Date(event.createdAt).toLocaleString('en-AU');
    meta.className='event-meta';meta.textContent=`${event.owner ? 'Assigned to '+event.owner+' · ' : ''}${event.reason.toLowerCase().replaceAll('_',' ')}`;
    note.textContent=event.note;item.append(title,time,document.createElement('br'),meta,note);history.append(item);
  }
  if (!review?.history.length) { const item=document.createElement('li');item.textContent='No review updates yet.';history.append(item); }
}
el('save-review').addEventListener('click',async()=>{
  if (savingReview || !activeFinding || sample) return;
  const actor=el('review-actor').value.trim(),note=el('review-note').value.trim(),status=el('review-status').value,reason=el('review-reason').value;
  if(!actor || !note){el('review-message').textContent='Add your name and an investigation note before saving.';return;}
  if(status==='RESOLVED' && reason==='INVESTIGATING'){el('review-message').textContent='Choose a resolution reason before marking this resolved.';return;}
  savingReview=true;el('save-review').disabled=true;el('close-detail').disabled=true;
  const reference=activeFinding.reference;
  try {
    const result=await workspaceRequest(`/api/batches/${report.batchId}/reviews/${encodeURIComponent(reference)}`,{method:'PUT',body:JSON.stringify({version:reviews.get(reference)?.version || 0,status,actor,owner:el('review-owner').value.trim(),reason,note})});
    reviewerName=actor;reviews.set(reference,result);fillReviewForm();render();el('review-message').textContent='Update saved. Source payment records have not changed.';
  }catch(error){
    el('review-message').textContent=error.message;
    if(error.message.includes('newer')){try{await loadReviews();fillReviewForm();el('review-message').textContent='A newer update was saved. Latest details loaded; review them before adding a new note.';}catch{}}
  }finally{savingReview=false;el('save-review').disabled=false;el('close-detail').disabled=false;}
});
el('detail').addEventListener('cancel',event=>{if(savingReview)event.preventDefault();});
function workingView() {
  el('working-view').hidden=false;el('history-view').hidden=true;
  el('new-run').classList.add('active');el('saved-runs').classList.remove('active');
}
el('new-run').addEventListener('click',workingView);
el('workspace-settings').addEventListener('click',()=>{workingView();el('import-panel').hidden=false;el('connection').open=true;el('connection').scrollIntoView({block:'center',behavior:'smooth'});el('key').focus();});
async function showHistory() {
  el('working-view').hidden=true;el('history-view').hidden=false;
  el('saved-runs').classList.add('active');el('new-run').classList.remove('active');
  el('history-message').textContent='Loading saved reconciliations…';
  el('previous-page').disabled=true;el('next-page').disabled=true;
  const body=el('history-rows');body.replaceChildren();
  try {
    const page=await workspaceRequest(`/api/batches?page=${historyPage}&size=10`);
    el('history-message').textContent=page.totalElements ? `${page.totalElements} saved ${page.totalElements===1?'reconciliation':'reconciliations'}` : 'No saved reconciliations yet. Import your first pair of files to get started.';
    for (const item of page.items) {
      const row=body.insertRow();row.insertCell().textContent=item.accountLabel;row.insertCell().textContent=item.settlementDate;row.insertCell().textContent=new Date(item.createdAt).toLocaleString('en-AU');
      const button=document.createElement('button');button.className='row-detail';button.textContent='Open reconciliation';button.addEventListener('click',async()=>{
        button.disabled=true;
        try{const loaded=await workspaceRequest(`/api/batches/${item.id}`);report=loaded;sample=false;reviews=new Map();await loadReviews();resetFilters();workingView();render();el('results').scrollIntoView({block:'start',behavior:'smooth'});message('Saved reconciliation opened. Review notes and source records are preserved.');}
        catch(error){el('history-message').textContent=error.message;button.disabled=false;}
      });row.insertCell().append(button);
    }
    el('history-page').textContent=`Page ${page.page+1} of ${Math.max(1,page.totalPages)}`;
    el('previous-page').disabled=page.page===0;el('next-page').disabled=page.page+1>=page.totalPages;
  }catch(error){el('history-message').textContent=error.message;el('history-page').textContent='';}
}
el('saved-runs').addEventListener('click',()=>{historyPage=0;showHistory();});
el('refresh-history').addEventListener('click',showHistory);
el('previous-page').addEventListener('click',()=>{historyPage--;showHistory();});
el('next-page').addEventListener('click',()=>{historyPage++;showHistory();});

function showColumnMapping(source,text) {
  const input=el(`${source}-file`),container=input.parentElement;
  container.querySelector('.column-mapping')?.remove();
  const rows=readCsv(text),headers=rows[0];
  const details=document.createElement('details');details.className='column-mapping';
  const summary=document.createElement('summary');summary.textContent='Choose source columns';details.append(summary);
  const selections={};
  for(const field of ['reference','amount','currency']) {
    const label=document.createElement('label'),select=document.createElement('select');label.textContent=field==='currency'?'Currency column or fixed currency':field==='amount'?'Amount column':'Payment reference column';
    select.id=`${source}-mapping-${field}`;label.htmlFor=select.id;
    headers.forEach((header,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=header.trim()||`Column ${index+1}`;select.append(option);});
    if(field==='currency')for(const code of ['AUD','USD','GBP','EUR']){const option=document.createElement('option');option.value='fixed:'+code;option.textContent='Use '+code+' for every row';select.append(option);}
    const aliases={reference:['reference','payment reference','payment_reference','transaction reference','transaction_id','reference number'],amount:['amount','net amount','net_amount','settlement amount'],currency:['currency','ccy','currency code']};
    const detected=headers.findIndex(h=>aliases[field].includes(h.trim().toLowerCase()));
    select.value=detected>=0?String(detected):field==='currency'?'fixed:AUD':String(field==='amount'?Math.min(1,headers.length-1):0);
    selections[field]=select;details.append(label,select);
  }
  const button=document.createElement('button');button.className='secondary';button.textContent='Use these columns';button.type='button';details.append(button);container.append(details);
  button.addEventListener('click',()=>{
    try {
      const mapping=Object.fromEntries(Object.entries(selections).map(([k,select])=>[k,select.value]));
      files[source]=parseMappedPayments(text,mapping);hideStaleReport();el(`${source}-status`).classList.remove('error');el(`${source}-status`).textContent=`${files[source].length} payments ready`;details.open=false;preview();updateButton();message('Column mapping applied. Original source values are preserved.');
    }catch(error){files[source]=null;el(`${source}-status`).classList.add('error');el(`${source}-status`).textContent=error.message;preview();updateButton();}
  });
  const normal=headers.map(h=>h.trim().toLowerCase());details.open=normal.length!==3||!['reference','amount','currency'].every(h=>normal.includes(h));
}

el('new-import').addEventListener('click',()=>{
  hideStaleReport();el('import-panel').hidden=false;
  for(const source of ['ledger','bank']){files[source]=null;el(`${source}-file`).value='';el(`${source}-status`).textContent='No file selected';el(`${source}-status`).classList.remove('error');el(`${source}-file`).parentElement.querySelector('.column-mapping')?.remove();}
  preview();updateButton();message('Choose the files for your next reconciliation.');el('account').focus();
});
