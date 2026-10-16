import { expandDecimalNotation, addDecimalStrings, negateDecimalString, compareDecimalStrings } from "@red-cup-engineering/exact-number-data-service/decimal-string";
import { semanticIdOf } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/semantic-content-identity";

const semanticId = semanticIdOf("brokerage.account-evidence-reconciliation.record");

const credential = /^(authorization|api[-_]?key|api[-_]?secret|secret|token|password)$/iu;
function rejectCredentials(value, seen = new Set()) { if (!value || typeof value !== "object" || seen.has(value)) return; seen.add(value); for (const [key, member] of Object.entries(value)) { if (credential.test(key)) throw new TypeError("credential-bearing-evidence-refused"); rejectCredentials(member, seen); } }

const nonempty = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field}-required`);
  return value;
};
// Preserve observed coefficient digits. Numeric input is a compatibility entrance
// for its already-represented value only; unsafe Number integers have lost custody.
const decimal = (value, field) => {
  if (typeof value !== "string" && typeof value !== "number") throw new TypeError(`${field}-decimal-required`);
  if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new TypeError(`${field}-exact-decimal-string-required`);
  return addDecimalStrings([expandDecimalNotation(value)]);
};
const optionalDecimal = (value, field) => value == null ? null : decimal(value, field);
const validateDecimal = (value, field) => {
  if (typeof value !== "string" || decimal(value, field) !== value) throw new TypeError(`${field}-canonical-decimal-required`);
};
const validateOptionalDecimal = (value, field) => { if (value !== null) validateDecimal(value, field); };
const exceedsTolerance = (expected, observed, tolerance) => {
  const difference = addDecimalStrings([observed, negateDecimalString(expected)]);
  return compareDecimalStrings(difference, tolerance) > 0 || compareDecimalStrings(difference, negateDecimalString(tolerance)) < 0;
};
const rows = (value, field) => {
  if (!Array.isArray(value)) throw new TypeError(`${field}-array-required`);
  return value;
};
const freeze = (value) => {
  if (value && typeof value === "object") { for (const member of Object.values(value)) freeze(member); Object.freeze(value); }
  return value;
};
function validateEvidence({ accountReference, observedAt, source }) {
  nonempty(accountReference, "account-reference");
  if (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt))) throw new TypeError("dated-source-evidence-required");
  nonempty(source?.uri, "source-uri"); nonempty(source?.digest, "source-digest");
}
function validatePositions(positions) {
  const symbols = new Set();
  for (const position of rows(positions, "positions")) {
    const symbol = nonempty(position?.symbol, "position-symbol");
    if (symbol !== symbol.trim().toUpperCase()) throw new TypeError("canonical-position-symbol-required");
    if (symbols.has(symbol)) throw new TypeError("duplicate-position-symbol");
    symbols.add(symbol);
    validateDecimal(position.quantity, "position-quantity");
    validateOptionalDecimal(position.marketValue, "position-market-value");
    validateOptionalDecimal(position.averageEntryPrice, "position-average-entry-price");
  }
}

/** Missing balances or an unobserved positions list cannot stand for a zero account.
 * Version 2 carries canonical decimal strings; absent optional amounts stay null. */
export function normalizeAlpacaSnapshot({ accountReference, observedAt, source, account, positions, orders = [], activities = [] } = {}) {
  rejectCredentials({ source, account, positions, orders, activities });
  validateEvidence({ accountReference, observedAt, source });
  const normalized = { type: "NormalizedBrokerageAccountSnapshot", version: 2, venue: "alpaca", accountReference, observedAt,
    source: { uri: source.uri, digest: source.digest },
    account: { status: account?.status ?? null, currency: nonempty(account?.currency, "account-currency"), cash: decimal(account?.cash, "account-cash"), equity: decimal(account?.equity, "account-equity"), buyingPower: decimal(account?.buying_power ?? account?.buyingPower, "account-buying-power") },
    positions: rows(positions, "positions").map((p) => ({ symbol: nonempty(p?.symbol, "position-symbol").trim().toUpperCase(), quantity: decimal(p.qty ?? p.quantity, "position-quantity"), marketValue: optionalDecimal(p.market_value ?? p.marketValue, "position-market-value"), averageEntryPrice: optionalDecimal(p.avg_entry_price ?? p.averageEntryPrice, "position-average-entry-price") })).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    orders: rows(orders, "orders").map((o) => ({ id: nonempty(o?.id, "order-id"), symbol: nonempty(o?.symbol, "order-symbol").trim().toUpperCase(), side: nonempty(o.side, "order-side"), status: nonempty(o.status, "order-status"), quantity: optionalDecimal(o.qty ?? o.quantity, "order-quantity"), filledQuantity: optionalDecimal(o.filled_qty ?? o.filledQuantity, "order-filled-quantity") })).sort((a, b) => a.id.localeCompare(b.id)),
    activities: rows(activities, "activities").map((a) => ({ id: nonempty(a?.id, "activity-id"), type: nonempty(a.activity_type ?? a.type, "activity-type"), symbol: a.symbol ?? null, amount: optionalDecimal(a.net_amount ?? a.amount, "activity-amount") })).sort((a, b) => a.id.localeCompare(b.id)),
  };
  validatePositions(normalized.positions);
  return freeze({ id: semanticId(normalized), ...normalized });
}

function validateSnapshot(snapshot) {
  rejectCredentials(snapshot);
  if (snapshot?.type !== "NormalizedBrokerageAccountSnapshot" || snapshot.version !== 2 || snapshot.venue !== "alpaca") throw new TypeError("normalized-alpaca-snapshot-required");
  validateEvidence(snapshot);
  nonempty(snapshot.account?.currency, "account-currency");
  for (const key of ["cash", "equity", "buyingPower"]) validateDecimal(snapshot.account[key], `account-${key}`);
  validatePositions(snapshot.positions);
  for (const order of rows(snapshot.orders, "orders")) {
    nonempty(order?.id, "order-id");
    const symbol = nonempty(order?.symbol, "order-symbol");
    if (symbol !== symbol.trim().toUpperCase()) throw new TypeError("canonical-order-symbol-required");
    nonempty(order.side, "order-side"); nonempty(order.status, "order-status");
    validateOptionalDecimal(order.quantity, "order-quantity");
    validateOptionalDecimal(order.filledQuantity, "order-filled-quantity");
  }
  for (const activity of rows(snapshot.activities, "activities")) {
    nonempty(activity?.id, "activity-id"); nonempty(activity?.type, "activity-type");
    validateOptionalDecimal(activity.amount, "activity-amount");
  }
  const { id, ...body } = snapshot;
  if (id !== semanticId(body)) throw new TypeError("snapshot-content-identity-mismatch");
}

export function validateReconciliationRequest({ expected, observed, tolerances = { money: "0.01", quantity: "0.000001" } } = {}) {
  validateSnapshot(expected); validateSnapshot(observed);
  if (expected.accountReference !== observed.accountReference || expected.account.currency !== observed.account.currency) throw new TypeError("comparable-snapshots-required");
  if (!tolerances || typeof tolerances !== "object" || Array.isArray(tolerances)) throw new TypeError("reconciliation-tolerances-invalid");
  const money = decimal(tolerances.money, "money-tolerance"), quantity = decimal(tolerances.quantity, "quantity-tolerance");
  if (compareDecimalStrings(money, "0") < 0 || compareDecimalStrings(quantity, "0") < 0) throw new TypeError("reconciliation-tolerances-invalid");
  return Object.freeze({ expected, observed, tolerances: Object.freeze({ money, quantity }) });
}

/** Compare only observed balances and position quantities. This does not derive
 * fills, fees, realized P&L, or independence of the supplied source evidence. */
export function reconcileSnapshots(input) {
  const { expected, observed, tolerances } = validateReconciliationRequest(input);
  const mismatches = [];
  for (const key of ["cash", "equity", "buyingPower"]) if (exceedsTolerance(expected.account[key], observed.account[key], tolerances.money)) mismatches.push({ path: `account.${key}`, expected: expected.account[key], observed: observed.account[key] });
  const bySymbol = (rows) => new Map(rows.map((row) => [row.symbol, row])); const e = bySymbol(expected.positions), o = bySymbol(observed.positions);
  for (const symbol of [...new Set([...e.keys(), ...o.keys()])].sort()) { const left = e.get(symbol), right = o.get(symbol); if (!left || !right) mismatches.push({ path: `positions.${symbol}`, expected: left ?? null, observed: right ?? null }); else if (exceedsTolerance(left.quantity, right.quantity, tolerances.quantity)) mismatches.push({ path: `positions.${symbol}.quantity`, expected: left.quantity, observed: right.quantity }); }
  const body = { type: "BrokerageAccountReconciliation", version: 2, expected: expected.id, observed: observed.id, accountReference: expected.accountReference,
    reconciliationScope: "account-balances-and-position-quantities", tolerances, realizedPnl: null, feesReconciled: false,
    mismatchCount: mismatches.length, disposition: mismatches.length ? "mismatch" : "reconciled", mismatches, selfAttestation: expected.id === observed.id ? true : null };
  return freeze({ id: semanticId(body), ...structuredClone(body) });
}

/** Reconcile one customer-supplied pair of Alpaca snapshots, each raw or already normalized. */
export function reconcileAccountEvidence(request) {
  if (!request || typeof request !== "object") throw new TypeError("request-object-required");
  const normalized = (value) => value?.type === "NormalizedBrokerageAccountSnapshot" ? value : normalizeAlpacaSnapshot(value);
  return reconcileSnapshots({ expected: normalized(request.expected), observed: normalized(request.observed), tolerances: request.tolerances });
}

export {reconcileBaseNativeUsdc} from './base-native-usdc.mjs';

/**
 * Cash-flow-adjusted change in account equity over one fully covered interval.
 * This is an accounting residual, NOT a realized trading profit, risk-adjusted
 * alpha, or a time-weighted return. Dividends, fees, position marks and other
 * non-external changes remain inside the residual.
 *
 * The caller must independently establish complete CSD/CSW coverage for the
 * selected interval; this pure calculation cannot certify a broker history.
 */
export function cashflowAdjustedEquityChange({
  openingEquity, closingEquity, externalCashMovements, completeExternalFlowCoverage,
} = {}) {
  if (completeExternalFlowCoverage !== true) throw new TypeError("complete-external-flow-coverage-required");
  if (!Array.isArray(externalCashMovements)) throw new TypeError("external-cash-movements-required");
  const opening = decimal(openingEquity, "opening-equity");
  const closing = decimal(closingEquity, "closing-equity");
  const seen = new Set();
  const amounts = ["0"];
  for (const activity of externalCashMovements) {
    const id = nonempty(activity?.id, "cash-movement-id");
    if (seen.has(id)) throw new TypeError("duplicate-external-cash-movement");
    seen.add(id);
    if (!["CSD", "CSW"].includes(activity.activity_type)) throw new TypeError("external-cash-movement-type-required");
    const amount = decimal(activity.net_amount, "external-cash-movement-amount");
    if (activity.activity_type === "CSD" && compareDecimalStrings(amount, "0") <= 0) throw new RangeError("deposit-sign-invalid");
    if (activity.activity_type === "CSW" && compareDecimalStrings(amount, "0") >= 0) throw new RangeError("withdrawal-sign-invalid");
    amounts.push(amount);
  }
  const netExternalFlow = addDecimalStrings(amounts);
  return Object.freeze({
    openingEquity: opening,
    closingEquity: closing,
    netExternalFlow,
    equityChangeExcludingExternalFlows: addDecimalStrings([closing, negateDecimalString(opening), negateDecimalString(netExternalFlow)]),
    performanceClaim: "cashflow-adjusted-equity-only",
    independentlyVerifiedFlowCoverage: false,
  });
}
