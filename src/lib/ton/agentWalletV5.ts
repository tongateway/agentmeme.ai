import { Address, beginCell, Cell, contractAddress, storeStateInit, toNano } from '@ton/core';
import { AGENT_WALLET_V5_CODE_BOC_BASE64 } from '../../contracts/agentWalletV5Code';

export const AGENT_WALLET_V5_OPCODES = {
  topup_action: 0x746f7075,
} as const;

export type AgentWalletDeployParams = {
  ownerAddress: Address;
  walletId: number; // uint32
  publicKeyHex: string; // 32 bytes hex
  promptHash: bigint; // uint256
  signatureAllowed?: boolean; // default true
  seqno?: number; // default 0
  workchain?: number; // default 0
};

export function agentWalletV5CodeCell(): Cell {
  return Cell.fromBase64(AGENT_WALLET_V5_CODE_BOC_BASE64);
}

export function agentWalletV5DataCell(params: AgentWalletDeployParams): Cell {
  const signatureAllowed = params.signatureAllowed ?? true;
  const seqno = params.seqno ?? 0;

  return beginCell()
    .storeBit(signatureAllowed)
    .storeUint(seqno, 32)
    .storeUint(params.walletId >>> 0, 32)
    .storeBuffer(Buffer.from(params.publicKeyHex, 'hex'), 32)
    .storeAddress(params.ownerAddress)
    .storeUint(params.promptHash, 256)
    .endCell();
}

export function agentWalletV5Init(params: AgentWalletDeployParams): { code: Cell; data: Cell } {
  return { code: agentWalletV5CodeCell(), data: agentWalletV5DataCell(params) };
}

export function agentWalletV5Address(params: AgentWalletDeployParams): Address {
  const wc = params.workchain ?? 0;
  return contractAddress(wc, agentWalletV5Init(params));
}

export function agentWalletV5StateInitBocBase64(params: AgentWalletDeployParams): string {
  const initCell = beginCell().store(storeStateInit(agentWalletV5Init(params))).endCell();
  return initCell.toBoc().toString('base64');
}

export function topupPayloadBocBase64(): string {
  return beginCell()
    .storeUint(AGENT_WALLET_V5_OPCODES.topup_action, 32)
    .storeUint(0, 64)
    .endCell()
    .toBoc()
    .toString('base64');
}

export function nanoFromTon(ton: string): string {
  return toNano(ton).toString(10);
}

