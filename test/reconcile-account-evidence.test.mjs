import assert from "node:assert/strict";
import test from "node:test";
import { reconcileAccountEvidence } from "../src/reconcile.mjs";

const source = { uri: "https://example.invalid/filing", observedAt: "2026-07-22T20:00:00.000Z", digest: "sha256:filing" };
const snapshot = (cash) => ({ accountReference: "acct-1", observedAt: "2026-07-22T22:20:00.000Z", source, account: { cash, equity: cash, buying_power: cash } });

test("a customer-supplied pair of raw Alpaca snapshots is normalized and reconciled", () => {
  const reconciled = reconcileAccountEvidence({ expected: snapshot(100), observed: snapshot(100) });
  assert.equal(reconciled.type, "BrokerageAccountReconciliation");
  assert.equal(reconciled.disposition, "reconciled");
  assert.equal(reconciled.mismatchCount, 0);
  const mismatched = reconcileAccountEvidence({ expected: snapshot(100), observed: snapshot(50) });
  assert.equal(mismatched.disposition, "mismatch");
  assert.ok(mismatched.mismatchCount > 0);
  assert.throws(() => reconcileAccountEvidence(undefined), TypeError);
});
