import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileAccountEvidence, normalizeAlpacaSnapshot, reconcileSnapshots } from "../src/reconcile.mjs";
const raw=(cash='100')=>({accountReference:'test-account',observedAt:'2026-10-10T00:00:00.000Z',source:{uri:'urn:fixture:review',digest:'sha256:fixture'},account:{currency:'USD',cash,equity:'100',buying_power:'200'},positions:[]});
const zeroTolerance={money:'0',quantity:'0'};
test('exact one-cent difference is within inclusive one-cent default tolerance',()=>{
 assert.equal(reconcileAccountEvidence({expected:raw('0.30'),observed:raw('0.31')}).disposition,'reconciled');
});
test('adjacent decimal integers beyond 2^53 retain distinct evidence and mismatch',()=>{
 const left=raw('9007199254740992'),right=raw('9007199254740993');
 assert.notEqual(normalizeAlpacaSnapshot(left).id,normalizeAlpacaSnapshot(right).id);
 assert.equal(reconcileAccountEvidence({expected:left,observed:right,tolerances:zeroTolerance}).disposition,'mismatch');
});
test('position quantities beyond 2^53 retain the observed difference',()=>{
 const left=raw(),right=raw();left.positions=[{symbol:'TEST',qty:'9007199254740992'}];right.positions=[{symbol:'TEST',qty:'9007199254740993'}];
 assert.equal(reconcileAccountEvidence({expected:left,observed:right,tolerances:zeroTolerance}).disposition,'mismatch');
});
test('decimal underflow must not erase a nonzero balance',()=>{
 assert.equal(reconcileAccountEvidence({expected:raw('0'),observed:raw('1e-999'),tolerances:zeroTolerance}).disposition,'mismatch');
});
test('explicit invalid top-level tolerances cannot be silently replaced by defaults',()=>{
 for (const tolerances of [null,false,'',0]) assert.throws(()=>reconcileAccountEvidence({expected:raw(),observed:raw(),tolerances}),TypeError);
});
test('missing fee activity amount remains unknown rather than observed zero',()=>{
 const missing=raw();missing.activities=[{id:'f',activity_type:'FEE'}];
 assert.equal(normalizeAlpacaSnapshot(missing).activities[0].amount,null);
});
test('boolean order quantities must not be coerced to one',()=>{
 const malformed=raw();malformed.orders=[{id:'o',symbol:'TEST',side:'buy',status:'new',qty:true,filled_qty:'0'}];
 assert.throws(()=>normalizeAlpacaSnapshot(malformed),TypeError);
});

test('exact decimal carriers are canonical and versioned', () => {
 const left=raw('+00100.2500'), right=raw('100.25');
 assert.equal(normalizeAlpacaSnapshot(left).version, 2);
 assert.equal(normalizeAlpacaSnapshot(left).account.cash, '100.25');
 assert.equal(normalizeAlpacaSnapshot(left).id, normalizeAlpacaSnapshot(right).id);
 const minusZero=normalizeAlpacaSnapshot(raw('-0.000'));
 assert.equal(minusZero.account.cash, '0');
 const legacy=structuredClone(normalizeAlpacaSnapshot(left)); legacy.version=1;
 assert.throws(()=>reconcileSnapshots({expected:legacy,observed:legacy}), /normalized-alpaca-snapshot-required/);
});
test('unsafe Number inputs are refused instead of pretending to recover source digits', () => {
 assert.throws(()=>normalizeAlpacaSnapshot(raw(9007199254740992)), /exact-decimal-string-required/);
 const normal=normalizeAlpacaSnapshot(raw(0.3));
 assert.equal(normal.account.cash, '0.3');
});
test('negative differences use the same inclusive exact decimal boundary', () => {
 for (const [left,right] of [['0.30','0.31'],['0.31','0.30'],['-0.30','-0.31'],['-0.31','-0.30']]) {
   assert.equal(reconcileAccountEvidence({expected:raw(left),observed:raw(right)}).disposition,'reconciled');
 }
 assert.equal(reconcileAccountEvidence({expected:raw('0.30'),observed:raw('0.310000000000000000000000000000001')}).disposition,'mismatch');
});
test('quantity tolerances preserve exact boundaries and both signs', () => {
 const left=raw(),right=raw();
 left.positions=[{symbol:'TEST',qty:'-0.300000'}];right.positions=[{symbol:'TEST',qty:'-0.300001'}];
 assert.equal(reconcileAccountEvidence({expected:left,observed:right}).disposition,'reconciled');
 right.positions[0].qty='-0.30000100000000000001';
 assert.equal(reconcileAccountEvidence({expected:left,observed:right}).disposition,'mismatch');
});
test('order quantities and fee evidence preserve exact decimal strings or explicit unknowns', () => {
 const data=raw(); data.orders=[{id:'o',symbol:'TEST',side:'buy',status:'new',qty:'9007199254740993',filled_qty:'0'}];
 data.activities=[{id:'f',activity_type:'FEE',net_amount:'-0.00000000000000000001'}];
 const snapshot=normalizeAlpacaSnapshot(data);
 assert.equal(snapshot.orders[0].quantity,'9007199254740993');
 assert.equal(snapshot.orders[0].filledQuantity,'0');
 assert.equal(snapshot.activities[0].amount,'-0.00000000000000000001');
 delete data.orders[0].qty;delete data.orders[0].filled_qty;
 assert.equal(normalizeAlpacaSnapshot(data).orders[0].quantity,null);
 assert.equal(normalizeAlpacaSnapshot(data).orders[0].filledQuantity,null);
 for (const amount of [false,{},[],NaN,Infinity,'', ' ']) {data.activities[0].net_amount=amount;assert.throws(()=>normalizeAlpacaSnapshot(data),TypeError);}
});
test('the reconciliation identity records which exact tolerances were applied', () => {
 const left=raw(),right=raw();
 const a=reconcileAccountEvidence({expected:left,observed:right,tolerances:{money:'0.01',quantity:'0.000001'}});
 const b=reconcileAccountEvidence({expected:left,observed:right,tolerances:zeroTolerance});
 assert.equal(a.version,2);
 assert.notEqual(a.id,b.id);
 assert.deepEqual(a.tolerances,{money:'0.01',quantity:'0.000001'});
 for(const tolerances of [{money:'-0.01',quantity:'0'},[],{}, {money:'0'}]) assert.throws(()=>reconcileAccountEvidence({expected:left,observed:right,tolerances}),TypeError);
});
