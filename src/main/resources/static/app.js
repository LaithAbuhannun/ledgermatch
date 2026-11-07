'use strict';
const byId=id=>document.getElementById(id);
let currentReport=null;
let previousBody=null;
let requestKey=null;
const labels={MATCHED:'Matched',MISSING_IN_BANK:'Missing in bank',MISSING_IN_LEDGER:'Missing in ledger',AMOUNT_MISMATCH:'Amount mismatch',CURRENCY_MISMATCH:'Currency mismatch',DUPLICATE_REFERENCE:'Duplicate reference'};
function render(){
 if(!currentReport)return;
 byId('total').textContent=currentReport.references;
 byId('matched').textContent=currentReport.counts.MATCHED;
 byId('exceptions').textContent=currentReport.exceptions;
 byId('batch').textContent=`${currentReport.accountLabel} · ${currentReport.settlementDate} · Batch ${currentReport.batchId}`;
 const rows=byId('rows');rows.replaceChildren();
 const findings=currentReport.findings.filter(f=>byId('filter').value==='all'||f.status!=='MATCHED');
 for(const f of findings){
  const tr=document.createElement('tr');
  const ref=document.createElement('td');ref.textContent=f.reference;tr.append(ref);
  const outcome=document.createElement('td');const badge=document.createElement('span');badge.className='badge'+(f.status==='MATCHED'?' matched':'');badge.textContent=labels[f.status];outcome.append(badge);tr.append(outcome);
  for(const side of [f.ledger,f.bank]){const td=document.createElement('td');td.textContent=side.map(e=>`${e.currency} ${Number(e.amount).toFixed(2)}`).join(' / ')||'—';tr.append(td);}
  rows.append(tr);
 }
 if(!findings.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.className='empty';td.textContent='No exceptions found.';tr.append(td);rows.append(tr);}
 byId('download').disabled=false;
}
byId('demo').addEventListener('click',async()=>{try{const r=await fetch('/demo.json');if(!r.ok)throw Error('Sample could not be loaded');byId('payload').value=JSON.stringify(await r.json(),null,2);byId('message').textContent='Sample ready: one matched reference and five exceptions.';}catch(e){byId('message').textContent=e.message;}});
byId('submit').addEventListener('click',async()=>{
 const button=byId('submit');button.disabled=true;
 try{
  const key=byId('key').value;if(!key)throw Error('Enter your API key first.');
  const body=JSON.stringify(JSON.parse(byId('payload').value));
  if(body!==previousBody){requestKey=crypto.randomUUID();previousBody=body;}
  byId('message').textContent='Reconciling…';
  const r=await fetch('/api/batches',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key,'Idempotency-Key':requestKey},body});
  const data=await r.json();if(!r.ok)throw Error(data.errors?.join('; ')||data.detail||'Request failed');
  currentReport=data;render();byId('message').textContent=r.status===201?'Batch saved. Report ready.':'Existing batch returned. No duplicate created.';
 }catch(e){byId('message').textContent=e instanceof SyntaxError?'Invalid JSON. Check the settlement data.':e.message;}
 finally{button.disabled=false;}
});
byId('filter').addEventListener('change',render);
byId('download').addEventListener('click',()=>{if(!currentReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(currentReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`ledgermatch-${currentReport.batchId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
