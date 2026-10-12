import assert from 'node:assert/strict';
import test from 'node:test';
import { cashflowAdjustedEquityChange } from '../src/reconcile.mjs';

const deposit = (id, net_amount) => ({ id, activity_type: 'CSD', net_amount });
const withdrawal = (id, net_amount) => ({ id, activity_type: 'CSW', net_amount });
const change = (overrides = {}) => cashflowAdjustedEquityChange({
  openingEquity: '150', closingEquity: '501.30',
  externalCashMovements: [deposit('cash-deposit-1', '350')],
  completeExternalFlowCoverage: true,
  ...overrides,
});

test('a cash deposit never manufactures investment profit', () => {
  assert.equal(change({ closingEquity: '500' }).equityChangeExcludingExternalFlows, '0');
  const result = change();
  assert.equal(result.equityChangeExcludingExternalFlows, '1.3');
  assert.equal(result.netExternalFlow, '350');
  assert.equal(result.performanceClaim, 'cashflow-adjusted-equity-only');
  assert.equal(result.independentlyVerifiedFlowCoverage, false);
});

test('withdrawal and mixed flows produce the correct signed residual', () => {
  const result = change({
    openingEquity: '500', closingEquity: '412',
    externalCashMovements: [withdrawal('one', '-100'), deposit('two', '2')],
  });
  assert.equal(result.netExternalFlow, '-98');
  assert.equal(result.equityChangeExcludingExternalFlows, '10');
});

test('negative investment returns are not coerced to zero', () => {
  assert.equal(change({ closingEquity: '490' }).equityChangeExcludingExternalFlows, '-10');
});

test('arbitrary decimal precision survives source normalization', () => {
  assert.equal(change({
    openingEquity: '9007199254740993', closingEquity: '9007199254740993.000000000000000000001',
    externalCashMovements: [],
  }).equityChangeExcludingExternalFlows, '0.000000000000000000001');
});

test('an absent flow is a coverage failure, never evidence of zero external flows', () => {
  for (const completeExternalFlowCoverage of [false, undefined, null, 1]) {
    assert.throws(() => change({ completeExternalFlowCoverage }), /complete-external-flow-coverage-required/);
  }
  assert.throws(() => change({ externalCashMovements: undefined }), /external-cash-movements-required/);
});

test('duplicate movements and ambiguous activities do not manufacture returns', () => {
  assert.throws(() => change({ externalCashMovements: [deposit('repeat','2'), deposit('repeat','2')] }), /duplicate-external-cash-movement/);
  assert.throws(() => change({ externalCashMovements: [{ id: 'a', activity_type: 'FILL', net_amount: '10' }] }), /external-cash-movement-type-required/);
  assert.throws(() => change({ externalCashMovements: [{ activity_type: 'CSD', net_amount: '10' }] }), /cash-movement-id-required/);
});

test('invalid financial arithmetic and inconsistent flow signs refuse', () => {
  assert.throws(() => change({ externalCashMovements: [deposit('bad','-5')] }), /deposit-sign-invalid/);
  assert.throws(() => change({ externalCashMovements: [withdrawal('bad','5')] }), /withdrawal-sign-invalid/);
  assert.throws(() => change({ externalCashMovements: [deposit('bad','0')] }), /deposit-sign-invalid/);
  assert.throws(() => change({ closingEquity: false }), /closing-equity-decimal-required/);
  assert.throws(() => change({ openingEquity: 'not a dollar' }));
});
