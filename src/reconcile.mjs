import { semanticIdOf } from "@red-cup-engineering/computer-content-engineering-services-section/semantic-content-identity";

const semanticId = semanticIdOf("brokerage.account-evidence-reconciliation.record");

const credential = /^(authorization|api[-_]?key|api[-_]?secret|secret|token|password)$/iu;
function rejectCredentials(value, seen = new Set()) { if (!value || typeof value !== "object" || seen.has(value)) return; seen.add(value); for (const [key, member] of Object.entries(value)) { if (credential.test(key)) throw new TypeError("credential-bearing-evidence-refused"); rejectCredentials(member, seen); } }

export function normalizeAlpacaSnapshot({ accountReference, observedAt, source, account, positions = [], orders = [], activities = [] }) {
  rejectCredentials({ source, account, positions, orders, activities });
  if (!source?.uri || !source?.digest || !Number.isFinite(Date.parse(observedAt))) throw new TypeError("dated-source-evidence-required");
  const normalized = { type: "NormalizedBrokerageAccountSnapshot", version: 1, venue: "alpaca", accountReference: String(accountReference), observedAt,
    source: { uri: source.uri, digest: source.digest },
    account: { status: account?.status ?? null, currency: account?.currency ?? "USD", cash: Number(account?.cash ?? 0), equity: Number(account?.equity ?? 0), buyingPower: Number(account?.buying_power ?? account?.buyingPower ?? 0) },
    positions: positions.map((p) => ({ symbol: String(p.symbol).toUpperCase(), quantity: Number(p.qty ?? p.quantity), marketValue: Number(p.market_value ?? p.marketValue ?? 0), averageEntryPrice: Number(p.avg_entry_price ?? p.averageEntryPrice ?? 0) })).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    orders: orders.map((o) => ({ id: String(o.id), symbol: String(o.symbol).toUpperCase(), side: o.side, status: o.status, quantity: Number(o.qty ?? o.quantity ?? 0), filledQuantity: Number(o.filled_qty ?? o.filledQuantity ?? 0) })).sort((a, b) => a.id.localeCompare(b.id)),
    activities: activities.map((a) => ({ id: String(a.id), type: a.activity_type ?? a.type, symbol: a.symbol ?? null, amount: Number(a.net_amount ?? a.amount ?? 0) })).sort((a, b) => a.id.localeCompare(b.id)),
  };
  return Object.freeze({ id: semanticId(normalized), ...normalized });
}

export function validateReconciliationRequest({ expected, observed, tolerances = { money: 0.01, quantity: 0.000001 } } = {}) {
  if (expected?.type !== "NormalizedBrokerageAccountSnapshot" || observed?.type !== "NormalizedBrokerageAccountSnapshot" || expected.accountReference !== observed.accountReference) throw new TypeError("comparable-snapshots-required");
  const money = Number(tolerances?.money), quantity = Number(tolerances?.quantity);
  if (!Number.isFinite(money) || money < 0 || !Number.isFinite(quantity) || quantity < 0) throw new TypeError("reconciliation-tolerances-invalid");
  return Object.freeze({ expected, observed, tolerances: Object.freeze({ money, quantity }) });
}

export function reconcileSnapshots(input) {
  const { expected, observed, tolerances } = validateReconciliationRequest(input);
  const mismatches = [];
  for (const key of ["cash", "equity", "buyingPower"]) if (Math.abs(expected.account[key] - observed.account[key]) > tolerances.money) mismatches.push({ path: `account.${key}`, expected: expected.account[key], observed: observed.account[key] });
  const bySymbol = (rows) => new Map(rows.map((row) => [row.symbol, row])); const e = bySymbol(expected.positions), o = bySymbol(observed.positions);
  for (const symbol of [...new Set([...e.keys(), ...o.keys()])].sort()) { const left = e.get(symbol), right = o.get(symbol); if (!left || !right) mismatches.push({ path: `positions.${symbol}`, expected: left ?? null, observed: right ?? null }); else if (Math.abs(left.quantity - right.quantity) > tolerances.quantity) mismatches.push({ path: `positions.${symbol}.quantity`, expected: left.quantity, observed: right.quantity }); }
  const body = { type: "BrokerageAccountReconciliation", version: 1, expected: expected.id, observed: observed.id, accountReference: expected.accountReference,
    mismatchCount: mismatches.length, disposition: mismatches.length ? "mismatch" : "reconciled", mismatches, selfAttestation: false };
  return Object.freeze({ id: semanticId(body), ...body });
}

/** Reconcile one customer-supplied pair of Alpaca snapshots, each raw or already normalized. */
export function reconcileAccountEvidence(request) {
  if (!request || typeof request !== "object") throw new TypeError("request-object-required");
  const normalized = (value) => value?.type === "NormalizedBrokerageAccountSnapshot" ? value : normalizeAlpacaSnapshot(value);
  return reconcileSnapshots({ expected: normalized(request.expected), observed: normalized(request.observed), ...(request.tolerances ? { tolerances: request.tolerances } : {}) });
}

export {reconcileBaseNativeUsdc} from './base-native-usdc.mjs';
