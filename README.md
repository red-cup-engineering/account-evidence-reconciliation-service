# Account evidence reconciliation

This service compares supplied Alpaca account balances and position quantities.
It does not fetch accounts, place orders, derive realized profit, reconcile fees,
or establish that two sources are independent. Base native-ETH/USDC/WETH
reconciliation is a separate export and retains its exact atomic-unit contract.

## Version 2 decimal evidence

`normalizeAlpacaSnapshot` produces `NormalizedBrokerageAccountSnapshot` version 2.
All observed monetary values and quantities are canonical decimal strings,
including position marks, cost basis, orders and activity amounts. The existing
`@red-cup-engineering/exact-number-data-service/decimal-string` provider performs
normalization and arithmetic; no amount is converted through a binary float.
Scientific notation is expanded exactly, so `"1e-999"` remains nonzero. Equal
values such as `"001.2500"` and `"1.25"` share the canonical carrier `"1.25"`.

Raw finite Number inputs remain a compatibility entrance for their represented
value, converted to decimal notation. Unsafe Number integers are refused. Use
original decimal strings when source precision matters; digits lost before this
service receives a Number cannot be recovered.

Required input includes the account reference, observation time, source URI and
digest, account currency, cash, equity, buying power, and an observed positions
array. Missing positions do not mean an empty portfolio. Missing optional marks,
entry prices, order quantities and activity amounts stay `null`; invalid supplied
values reject. Optional orders and activities default to empty ancillary arrays,
which do not establish that the account has no orders or activity.

Pre-normalized inputs must be version 2, carry canonical decimal strings and
retain a valid content identity. Version-1 numeric snapshots are not silently
upgraded: re-normalize retained original source evidence, preserving the old
record and its identity. Consumers of version-1 numeric fields must explicitly
adopt the version-2 string contract before using this source correction.

## Exact comparisons and limited claims

`reconcileAccountEvidence` accepts raw or version-2 normalized pairs.
`reconcileSnapshots` accepts normalized pairs. Account references and currencies
must match, and duplicate position symbols reject before comparison.

The default inclusive tolerances are `"0.01"` for money and `"0.000001"` for
quantity. Explicit tolerances must supply both nonnegative decimal values.
Omitted or `undefined` tolerances use the defaults; `null`, booleans, empty
strings, arrays and incomplete containers reject. Difference and tolerance
comparisons are exact, including negative values and quantities beyond 2^53.

`BrokerageAccountReconciliation` version 2 records the exact tolerances applied,
the compared snapshot identities, and string-valued mismatches. Its scope is
`account-balances-and-position-quantities`; `realizedPnl` is `null` and
`feesReconciled` is `false`. Comparing the same snapshot reports self-attestation;
separate snapshots leave independence unknown. A reconciled pair is not proof of
net profit or a complete accounting close.

## Verification and dependencies

The package uses the owning enterprise workspace's declared dependencies.
Run `npm test` in a complete workspace. `test/trading-vertical.test.mjs` additionally
needs the genuine venue adapter source and principal-brokerage-interface package.
The historical npm lockfile predates the current workspace package identities;
it is not a supported standalone dependency closure and has not been given a
fabricated registry resolution for the new exact-decimal dependency.
