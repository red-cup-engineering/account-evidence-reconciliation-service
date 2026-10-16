import {semanticIdOf} from '@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/semantic-content-identity';
const identify=semanticIdOf('brokerage.base-account-reconciliation.record');
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const wallet='0x224c08a8526751887a83e2711b167f890c6d078d';
const router='0x2626664c2603336e57b271c5c0b26f421741e481';
const usdc='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hex=value=>{if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))throw new TypeError('exact-rpc-quantity-required');return BigInt(value);};
const atoms=value=>{if(typeof value!=='string'||!/^\d+$/.test(value))throw new TypeError('exact-account-atoms-required');return BigInt(value);};
const address=value=>{if(typeof value!=='string'||!/^0x[0-9a-f]{40}$/i.test(value))throw new TypeError('account-address-required');return value.toLowerCase();};
const hash=value=>{if(typeof value!=='string'||!/^0x[0-9a-f]{64}$/i.test(value))throw new TypeError('chain-hash-required');return value.toLowerCase();};
/** Exact block-boundary accounting for the admitted native ETH -> USDC sleeve.
 * Quantities and fees reconcile independently of USD marks and historical cost basis. */
export function reconcileBaseNativeUsdc({observed,transaction,before,after,operatorFeeWei}={}) {
 const receipt=observed?.receipt;
 if(observed?.type!=='FinalizedTransactionEffect'||observed.chainId!==8453||address(observed.address)!==wallet||!receipt)throw new TypeError('fixed-base-finalized-effect-required');
 const txHash=hash(observed.transactionHash),blockHash=hash(receipt.blockHash),block=hex(receipt.blockNumber);
 if(hash(receipt.transactionHash)!==txHash||hash(transaction?.hash)!==txHash||hash(transaction.blockHash)!==blockHash||hex(transaction.blockNumber)!==block||hex(transaction.chainId)!==8453n||address(transaction.from)!==wallet||address(transaction.to)!==router)throw new TypeError('correlated-base-router-transaction-required');
 if(hex(after?.blockNumber)!==block||hash(after.blockHash)!==blockHash||hex(before?.blockNumber)+1n!==block||hash(after.parentHash)!==hash(before.blockHash))throw new TypeError('adjacent-canonical-account-boundaries-required');
 for(const snapshot of [before,after])if(address(snapshot.address)!==wallet||snapshot.chainId!==8453)throw new TypeError('fixed-base-account-snapshot-required');
 const status=hex(receipt.status);if(![0n,1n].includes(status))throw new TypeError('final-execution-status-required');
 const l2=hex(receipt.gasUsed)*hex(receipt.effectiveGasPrice),l1=hex(receipt.l1Fee),operator=atoms(operatorFeeWei),fees=l2+l1+operator;
 let received=0n,sent=0n;const seen=new Set();
 for(const log of receipt.logs??[]) {
  if(address(log.address)!==usdc||log.topics?.[0]?.toLowerCase()!==transfer)continue;
  if(log.removed===true||hash(log.transactionHash)!==txHash||hash(log.blockHash)!==blockHash||hex(log.blockNumber)!==block||log.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(log.data))throw new TypeError('correlated-usdc-transfer-required');
  const index=hex(log.logIndex).toString();if(seen.has(index))throw new TypeError('duplicate-usdc-transfer-log');seen.add(index);
  const topicAddress=value=>{if(!/^0x0{24}[0-9a-f]{40}$/i.test(value??''))throw new TypeError('erc20-address-topic-required');return address('0x'+value.slice(-40));};
  const amount=BigInt(log.data);if(topicAddress(log.topics[2])===wallet)received+=amount;if(topicAddress(log.topics[1])===wallet)sent+=amount;
 }
 const value=status===1n?hex(transaction.value):0n,deltaUsdc=received-sent;
 const mismatches=[];
 const check=(asset,actual,expected)=>{if(actual!==expected)mismatches.push({asset,actualAtomic:actual.toString(),expectedAtomic:expected.toString()});};
 check('ETH',atoms(after.nativeBalanceWei)-atoms(before.nativeBalanceWei),-value-fees);
 check('USDC',atoms(after.usdcBalanceAtomic)-atoms(before.usdcBalanceAtomic),deltaUsdc);
 check('WETH',atoms(after.wrappedEtherBalanceWei)-atoms(before.wrappedEtherBalanceWei),0n);
 if(status===1n&&(value<=0n||received<=0n||sent!==0n))mismatches.push({asset:'route',reason:'successful native-input swap must spend ETH and receive USDC only'});
 if(status===0n&&(received!==0n||sent!==0n))mismatches.push({asset:'route',reason:'reverted swap cannot transfer USDC'});
 const body={type:'BaseNativeUsdcAccountReconciliation',version:1,reconciliationScope:'adjacent-block-native-ETH-USDC-WETH-quantities-and-fees',chainId:8453,address:wallet,executionId:observed.executionId,transactionHash:txHash,blockHash,before,after,disposition:status===1n?'succeeded':'reverted',nativeSpentWei:value.toString(),usdcReceivedAtomic:deltaUsdc.toString(),fees:{l2Wei:l2.toString(),l1Wei:l1.toString(),operatorWei:operator.toString(),totalWei:fees.toString()},mismatches,accountReconciled:mismatches.length===0,feesReconciled:mismatches.length===0,realizedPnlUsd:null,costBasisDisposition:'historical-basis-and-usd-marks-required',sourceEvidence:observed.evidence};
 return freeze({id:identify(body),...structuredClone(body)});
}
