import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBaseNativeUsdc} from '../src/base-native-usdc.mjs';
const h=n=>'0x'+n.repeat(64),wallet='0x224C08A8526751887a83e2711B167f890c6D078d',router='0x2626664c2603336E57B271c5C0b26F421741e481',usdc='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const topic=a=>'0x'+'0'.repeat(24)+a.slice(2).toLowerCase();
const quantity=n=>'0x'+BigInt(n).toString(16);
export function fixture(status='0x1'){
 const value=9007199254740993n,fees=200000000000n+37n+11n,starting=10n**20n;
 const log={address:usdc,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(router),topic(wallet)],data:'0x'+(25000000n).toString(16).padStart(64,'0'),logIndex:'0x0',transactionHash:h('a'),blockHash:h('b'),blockNumber:'0x10',removed:false};
 const before={chainId:8453,address:wallet,blockNumber:'0xf',blockHash:h('c'),nativeBalanceWei:starting.toString(),usdcBalanceAtomic:'1000000',wrappedEtherBalanceWei:'12345'};
 return {observed:{type:'FinalizedTransactionEffect',chainId:8453,address:wallet,executionId:'ni:///sha-256;'+'a'.repeat(43),transactionHash:h('a'),evidence:{grant:'fixture'},receipt:{transactionHash:h('a'),blockHash:h('b'),blockNumber:'0x10',status,gasUsed:quantity(100000),effectiveGasPrice:quantity(2000000),l1Fee:'0x25',logs:status==='0x1'?[log]:[]}},transaction:{hash:h('a'),blockHash:h('b'),blockNumber:'0x10',chainId:'0x2105',from:wallet,to:router,value:quantity(value)},before,after:{...before,blockNumber:'0x10',blockHash:h('b'),parentHash:h('c'),nativeBalanceWei:(starting-fees-(status==='0x1'?value:0n)).toString(),usdcBalanceAtomic:status==='0x1'?'26000000':'1000000'},operatorFeeWei:'11'};
}
test('successful swap reconciles exact quantities beyond floating-point integer precision and all fees',()=>{
 const result=reconcileBaseNativeUsdc(fixture());assert.equal(result.accountReconciled,true);assert.equal(result.nativeSpentWei,'9007199254740993');assert.equal(result.usdcReceivedAtomic,'25000000');assert.equal(result.fees.totalWei,'200000000048');assert.equal(result.realizedPnlUsd,null);
});
test('reverted swap spends only fees and retains input holdings',()=>{const result=reconcileBaseNativeUsdc(fixture('0x0'));assert.equal(result.accountReconciled,true);assert.equal(result.nativeSpentWei,'0');assert.equal(result.usdcReceivedAtomic,'0');});
test('unexplained holdings or fees keep accounting incomplete',()=>{
 for(const asset of ['nativeBalanceWei','usdcBalanceAtomic','wrappedEtherBalanceWei']){const input=fixture();input.after[asset]=(BigInt(input.after[asset])+1n).toString();assert.equal(reconcileBaseNativeUsdc(input).accountReconciled,false);}
 const input=fixture();input.operatorFeeWei='12';assert.equal(reconcileBaseNativeUsdc(input).feesReconciled,false);
});
test('wrong chain, transaction, boundary, missing fees or duplicated transfers are rejected',()=>{
 for(const change of [i=>i.transaction.chainId='0x1',i=>i.transaction.hash=h('f'),i=>i.after.parentHash=h('e'),i=>delete i.observed.receipt.l1Fee,i=>i.observed.receipt.logs.push({...i.observed.receipt.logs[0]})]){const input=fixture();change(input);assert.throws(()=>reconcileBaseNativeUsdc(input));}
});

test('content-addressed account evidence cannot change with mutable input',()=>{const input=fixture();const result=reconcileBaseNativeUsdc(input);input.after.nativeBalanceWei='1';assert.notEqual(result.after.nativeBalanceWei,'1');assert.throws(()=>result.fees.totalWei='0');assert.throws(()=>result.mismatches.push({asset:'ETH'}));});
