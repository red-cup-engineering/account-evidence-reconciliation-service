import assert from "node:assert/strict";
import test from "node:test";

import { createAlpacaAdapter } from "../../pluggable-venue-adapter-service/src/alpaca-adapter.mjs";
import { formPrincipalBrokerageContract, grantBrokerageAuthority } from "@red-cup-engineering/principal-brokerage-interface";
import { normalizeAlpacaSnapshot, reconcileSnapshots } from "../src/reconcile.mjs";

test("principal authority carries an Alpaca observation into reconciled account evidence", async () => {
  const validUntil = "2099-01-02T00:00:00.000Z";
  const contract = formPrincipalBrokerageContract({
    principal: "urn:principal:test", venue: "alpaca-trading-paper", accountReference: "account:test",
    capital: { amount: 1_000, currency: "USD" },
    risk: { maximumLossAmount: 100, maximumOrderNotional: 100, maximumAggregateNotional: 200, concentrationLimit: 0.2 },
    scopes: ["account:read", "positions:read"], validUntil,
  });
  const grant = grantBrokerageAuthority({
    contract, adapter: "alpaca-trading-paper", credentialReference: "urn:credential-custody:test",
    scopes: ["account:read", "positions:read"], validUntil,
  });
  const authorityClient = { authorizedRequest: async ({ url }) => ({
    status: 200, headers: { "x-request-id": "request:test" }, authorityCustodyReceipt: "custody:test",
    body: url.endsWith("/v2/account")
      ? { status: "ACTIVE", currency: "USD", cash: "900", equity: "1000", buying_power: "1800" }
      : [{ symbol: "BLK", qty: "2", market_value: "100", avg_entry_price: "45" }],
  }) };
  const adapter = createAlpacaAdapter({ product: "alpaca-trading-paper", baseUrl: "https://paper-api.alpaca.markets/", authorityClient });
  const now = "2099-01-01T00:00:00.000Z";
  const account = await adapter.readAccount({ grant, now });
  const positions = await adapter.listPositions({ grant, now });
  const snapshot = normalizeAlpacaSnapshot({
    accountReference: contract.accountReference, observedAt: now,
    source: { uri: "https://paper-api.alpaca.markets/v2/account", digest: account.id },
    account: account.payload, positions: positions.payload,
  });
  const reconciliation = reconcileSnapshots({ expected: snapshot, observed: snapshot });
  assert.equal(reconciliation.disposition, "reconciled");
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(JSON.stringify({ account, positions, snapshot }).includes("urn:credential-custody:test"), false);
});
