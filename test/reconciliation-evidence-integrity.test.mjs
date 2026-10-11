import assert from "node:assert/strict";
import test from "node:test";
import { semanticIdOf } from "@red-cup-engineering/computer-content-address-engineering-services-section/semantic-content-identity";
import { normalizeAlpacaSnapshot, reconcileAccountEvidence, reconcileSnapshots } from "../src/reconcile.mjs";

const raw = () => ({
  accountReference: "test-account", observedAt: "2026-10-10T00:00:00.000Z",
  source: { uri: "urn:fixture:account-observation", digest: "sha256:fixture" },
  account: { currency: "USD", status: "ACTIVE", cash: "100.25", equity: "98.25", buying_power: "200.50" },
  positions: [{ symbol: "TEST", qty: "-0.25" }],
});
const normalized = () => normalizeAlpacaSnapshot(raw());

test("missing balances remain unknown rather than becoming a reconciled zero", () => {
  for (const field of ["cash", "equity", "buying_power"]) {
    const missing = raw(); delete missing.account[field];
    assert.throws(() => reconcileAccountEvidence({ expected: missing, observed: missing }), TypeError, field);
  }
});

test("unknown positions cannot stand for an observed empty portfolio", () => {
  const missing = raw(); delete missing.positions;
  assert.throws(() => normalizeAlpacaSnapshot(missing), /positions-array-required/);
  const empty = { ...raw(), positions: [] };
  assert.equal(reconcileAccountEvidence({ expected: empty, observed: empty }).disposition, "reconciled");
});

test("non-numeric or empty balance evidence cannot be coerced to zero", () => {
  for (const value of [null, "", "  ", true, false, [], {}, NaN, Infinity, "Infinity", "not-a-number", "0x10", "0b10"]) {
    const malformed = raw(); malformed.account.cash = value;
    assert.throws(() => normalizeAlpacaSnapshot(malformed), TypeError, String(value));
  }
});

test("caller-normalized non-finite quantities and balances cannot bypass validation", () => {
  for (const value of [NaN, Infinity, null, 100.25]) {
    const malformed = structuredClone(normalized()); malformed.account.cash = value;
    assert.throws(() => reconcileSnapshots({ expected: normalized(), observed: malformed }), TypeError);
  }
  const malformed = structuredClone(normalized()); malformed.positions[0].quantity = NaN;
  assert.throws(() => reconcileSnapshots({ expected: normalized(), observed: malformed }), TypeError);
});

test("pre-normalized evidence must still be dated, identified and Alpaca-scoped", () => {
  for (const mutate of [
    s => { s.source.digest = ""; }, s => { s.observedAt = "invalid"; },
    s => { s.venue = "another-venue"; }, s => { s.version = 1; },
    s => { s.accountReference = ""; }, s => { s.id = "invented-id"; },
  ]) {
    const malformed = structuredClone(normalized()); mutate(malformed);
    assert.throws(() => reconcileSnapshots({ expected: malformed, observed: malformed }), TypeError);
  }
});

test("a content identity must bind current finite snapshot content", () => {
  const changed = structuredClone(normalized()); changed.account.cash = "95";
  assert.throws(() => reconcileSnapshots({ expected: normalized(), observed: changed }), /snapshot-content-identity-mismatch/);
});

test("duplicate normalized symbols cannot overwrite an earlier position", () => {
  const duplicate = raw(); duplicate.positions.push({ symbol: "test", qty: "5" });
  assert.throws(() => normalizeAlpacaSnapshot(duplicate), /duplicate-position-symbol/);
  const forged = structuredClone(normalized()); forged.positions.unshift({ ...forged.positions[0], quantity: "5" });
  assert.throws(() => reconcileSnapshots({ expected: normalized(), observed: forged }), /duplicate-position-symbol/);
});

test("missing principal, currency or symbol cannot acquire a fabricated identity", () => {
  for (const mutate of [
    s => { delete s.accountReference; }, s => { s.accountReference = " "; },
    s => { delete s.account.currency; }, s => { delete s.positions[0].symbol; },
  ]) { const malformed = raw(); mutate(malformed); assert.throws(() => normalizeAlpacaSnapshot(malformed), TypeError); }
});

test("same numeric balances in different currencies are not comparable", () => {
  const eur = raw(); eur.account.currency = "EUR";
  assert.throws(() => reconcileAccountEvidence({ expected: raw(), observed: eur }), /comparable-snapshots-required/);
});

test("absent valuation and cost basis are retained as unknown", () => {
  const snapshot = normalized();
  assert.equal(snapshot.positions[0].marketValue, null);
  assert.equal(snapshot.positions[0].averageEntryPrice, null);
  const result = reconcileSnapshots({ expected: snapshot, observed: snapshot });
  assert.equal(result.reconciliationScope, "account-balances-and-position-quantities");
  assert.equal(result.realizedPnl, null);
  assert.equal(result.feesReconciled, false);
  assert.equal(result.selfAttestation, true);
});

test("separate evidence is not automatically represented as independent verification", () => {
  const newer = raw(); newer.observedAt = "2026-10-10T00:01:00.000Z";
  assert.equal(reconcileAccountEvidence({ expected: raw(), observed: newer }).selfAttestation, null);
});

test("normalized evidence and result mismatches cannot change after content addressing", () => {
  const snapshot = normalized();
  assert.throws(() => { snapshot.account.cash = 0; }, TypeError);
  assert.throws(() => { snapshot.positions[0].quantity = 0; }, TypeError);
  const changed = raw(); changed.account.cash = "90.25";
  const result = reconcileAccountEvidence({ expected: raw(), observed: changed });
  assert.throws(() => { result.mismatches[0].observed = 100.25; }, TypeError);
});

test("legitimate zero, signed fractional holdings and observed mismatches still work", () => {
  const zero = raw(); zero.account.cash = "0";
  const same = reconcileAccountEvidence({ expected: zero, observed: zero });
  assert.equal(same.disposition, "reconciled");
  const changed = raw(); changed.positions[0].qty = "-0.5";
  const mismatch = reconcileAccountEvidence({ expected: raw(), observed: changed });
  assert.deepEqual(mismatch.mismatches, [{ path: "positions.TEST.quantity", expected: "-0.25", observed: "-0.5" }]);
});

test("null, empty or boolean tolerances do not silently become exact equality", () => {
  for (const value of [null, "", true]) {
    assert.throws(() => reconcileSnapshots({ expected: normalized(), observed: normalized(), tolerances: { money: value, quantity: 0 } }), TypeError);
  }
});

// Rehash each malformed body so these exercise shape admission, not just stale IDs.
const reidentify = (snapshot) => {
  const { id, ...body } = snapshot;
  return { id: semanticIdOf("brokerage.account-evidence-reconciliation.record")(body), ...body };
};
test("caller-normalized orders preserve the raw entrance's required identity fields", () => {
  const input = raw(); input.orders = [{ id: "order-1", symbol: "TEST", side: "buy", status: "new", qty: "1", filled_qty: "0" }];
  const snapshot = normalizeAlpacaSnapshot(input);
  assert.equal(reconcileSnapshots({ expected: snapshot, observed: snapshot }).disposition, "reconciled");
  for (const field of ["id", "symbol", "side", "status"]) {
    for (const value of [null, "", " ", 1]) {
      const malformed = structuredClone(snapshot); malformed.orders[0][field] = value;
      const identified = reidentify(malformed);
      assert.throws(() => reconcileSnapshots({ expected: identified, observed: identified }), TypeError, field);
    }
    const missing = structuredClone(snapshot); delete missing.orders[0][field];
    const identified = reidentify(missing);
    assert.throws(() => reconcileSnapshots({ expected: identified, observed: identified }), TypeError, field);
  }
  for (const symbol of ["test", " TEST "]) {
    const malformed = structuredClone(snapshot); malformed.orders[0].symbol = symbol;
    const identified = reidentify(malformed);
    assert.throws(() => reconcileSnapshots({ expected: identified, observed: identified }), /canonical-order-symbol-required/);
  }
});
test("caller-normalized activities preserve the raw entrance's required identity fields", () => {
  const input = raw(); input.activities = [{ id: "fee-1", activity_type: "FEE", net_amount: "-0.01" }];
  const snapshot = normalizeAlpacaSnapshot(input);
  assert.equal(reconcileSnapshots({ expected: snapshot, observed: snapshot }).disposition, "reconciled");
  for (const field of ["id", "type"]) {
    for (const value of [null, "", " ", 1]) {
      const malformed = structuredClone(snapshot); malformed.activities[0][field] = value;
      const identified = reidentify(malformed);
      assert.throws(() => reconcileSnapshots({ expected: identified, observed: identified }), TypeError, field);
    }
    const missing = structuredClone(snapshot); delete missing.activities[0][field];
    const identified = reidentify(missing);
    assert.throws(() => reconcileSnapshots({ expected: identified, observed: identified }), TypeError, field);
  }
});
