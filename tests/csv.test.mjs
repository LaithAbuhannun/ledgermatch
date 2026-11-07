import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePayments, reportCsv, csvCell } from '../src/main/resources/static/csv.mjs';
const header = 'reference,amount,currency\n';
test('parses normal rows and preserves amount precision', () => {
  assert.deepEqual(parsePayments(header+'PAY-1,9999999999999.99,AUD')[0],{reference:'PAY-1',amount:'9999999999999.99',currency:'AUD'});
});
test('supports BOM, CRLF, reordered headers and lowercase currencies', () => {
  assert.deepEqual(parsePayments('\uFEFFcurrency,reference,amount\r\naud,PAY-1,12.00\r\n')[0],{currency:'AUD',reference:'PAY-1',amount:'12.00'});
});
test('supports quoted fields and skips blank lines', () => {
  assert.equal(parsePayments(header+'"PAY-1","12.00","AUD"\n\n').length,1);
});
test('retains duplicate references for reconciliation', () => {
  assert.equal(parsePayments(header+'A,12,AUD\nA,12,AUD').length,2);
});
test('rejects missing, duplicate or extra headings', () => {
  for(const input of ['ref,amount,currency\nA,12,AUD','reference,amount,amount\nA,12,12','reference,amount,currency,extra\nA,12,AUD,x'])assert.throws(()=>parsePayments(input),/headings/);
});
test('rejects empty files and header-only files', () => {
  assert.throws(()=>parsePayments(''),/empty/);assert.throws(()=>parsePayments(header),/no payments/);
});
test('rejects zero, negative, overprecision and exponent amounts', () => {
  for(const amount of ['0','-10','1.001','1e2','NaN','10000000000000'])assert.throws(()=>parsePayments(header+`A,${amount},AUD`),/positive amount/);
});
test('handles quoted commas without silently splitting columns', () => {
  assert.throws(()=>parsePayments(header+'A,"1,000.00",AUD'),/positive amount/);
});
test('rejects invalid references, currencies and row width', () => {
  assert.throws(()=>parsePayments(header+'A B,12,AUD'),/reference/);
  assert.throws(()=>parsePayments(header+'A,12,Australia'),/currency/);
  assert.throws(()=>parsePayments(header+'A,12,AUD,extra'),/three columns/);
});
test('rejects broken quoting', () => {
  assert.throws(()=>parsePayments(header+'"A,12,AUD'),/closing/);
  assert.throws(()=>parsePayments(header+'"A"oops,12,AUD'),/Unexpected/);
});
test('enforces 5000 row limit', () => {
  assert.throws(()=>parsePayments(header+Array(5001).fill('A,12,AUD').join('\n')),/5,000/);
});
test('CSV export preserves duplicate source rows and absent sides', () => {
  const output=reportCsv({findings:[{reference:'A',status:'DUPLICATE_REFERENCE',ledger:[{amount:12,currency:'AUD'},{amount:12,currency:'AUD'}],bank:[]}]});
  assert.equal(output.split('\r\n').length,4);
  assert.match(output,/"bank","",""/);
});
test('CSV escapes quotations and neutralises spreadsheet formulas', () => {
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('hello "world"'), '"hello ""world"""');
});
