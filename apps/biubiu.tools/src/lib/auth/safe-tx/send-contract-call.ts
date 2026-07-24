/**
 * Safe 合约调用编排器（通用版）。
 *
 * 与 send-token.ts 相同的 UserOp 流程，但接受任意 callData + value。传输已改为
 * 直连（wallet/infra/*，无服务端代理）；UserOp 构建/签名/打包逐字节不变。
 *
 * Tempo（chainId 4217，无原生 gas 币）走独立分支：maxFee=0 的 UserOp + 把
 * `feeToken.transfer(bundlerEOA, reimbursement)` 追加进 MultiSend 批次，提交时带
 * `feeToken` 字段。详见 wallet/infra/tempo.ts。
 */
import { type Address, type Hex, numberToHex } from 'viem';
import {
	buildCallData,
	buildInitCode,
	buildDummySignature,
	buildContractSignatureWebAuthn,
	buildUserOpSignature,
	calculateSafeOpHash,
	packAccountGasLimits,
	packGasFees,
	formatUserOpForRpc,
	type UserOperation,
	type GasParams
} from './build-userop.js';
import { signSafeOpWithPasskey } from './webauthn-sign.js';
import type { SendStatus, SendResult } from './send-token.js';
import type { Call } from '$lib/wallet/types.js';
import { chainInfoBySlug, isTempoChain, explorerTxUrl } from '$lib/wallet/infra/chains.js';
import { isDeployed, getNonce, getGasPrices, getChainGasPriceAtto } from '$lib/wallet/infra/account-state.js';
import {
	estimateUserOperationGas,
	sendUserOperation,
	getUserOperationReceipt,
	getInBandGasQuotes,
	type UserOpDict
} from '$lib/wallet/infra/bundler-client.js';
import {
	calculateInBandFeeAmount,
	buildInBandFeeLeg,
	findInBandGasQuote
} from '$lib/wallet/infra/inband.js';
import {
	TEMPO_DEFAULT_FEE_TOKEN,
	TEMPO_FEE_TOKEN_DECIMALS,
	TEMPO_VERIFICATION_GAS_UNDEPLOYED,
	tempoCallGasLimit,
	tempoExpectedGas,
	tempoReimbursement
} from '$lib/wallet/infra/tempo.js';
import { encodeMultiSendCall, MULTISEND_ADDRESS } from '$lib/contract-caller/batch.js';

/**
 * verificationGasLimit for a first-deploy (undeployed Safe) on native (non-Tempo) ERC-4337 chains.
 *
 * In EntryPoint v0.7 the factory (initCode) executes inside `verificationGasLimit`, and an EVM Safe
 * deploy (proxy + 4337 module + WebAuthn signer setup + first P256 verify) meters to ~2M gas. Two
 * failure modes bracket the right value, so we PIN it to the bundler's hard cap:
 *   - too LOW (e.g. the bundler's own under-reported estimate) → the deploy OOGs → "AA13 initCode
 *     failed or OOG".
 *   - too HIGH → the bundler rejects it → "verificationGasLimit exceeds max 2000000".
 * The vela bundler caps verification at 2,000,000 on these chains, and that cap is ~exactly the
 * deploy cost — so 2M is both the max allowed and enough. (Tempo's cap is higher, 8M; see
 * TEMPO_VERIFICATION_GAS_UNDEPLOYED.)
 */
const NATIVE_VERIFICATION_GAS_UNDEPLOYED = 2_000_000n;

/** 可选 gas 覆盖：用户自定义 callGasLimit / maxFeePerGas / maxPriorityFeePerGas */
export interface GasOverrides {
	callGasLimit?: bigint;
	maxFeePerGas?: bigint;
	maxPriorityFeePerGas?: bigint;
}

/**
 * In-band 结算下 confirm UI 展示并让用户确认的报销报价：金额（fee 资产自身单位）+ 收款地址。
 * 传入后 sendInBand 逐字节签这个报价（签什么执行什么），不再重新现算。
 */
export interface QuotedInBandFee {
	amount: bigint;
	recipient: Address;
}

export interface ContractCallParams {
	safeAddress: Address;
	publicKeyHex: string;
	credentialId: string;
	rpId: string;
	/** 目标合约地址 */
	to: Address;
	/** 发送的 ETH（wei） */
	value: bigint;
	/** 编码后的合约调用 data */
	data: Hex;
	/**
	 * Safe 执行类型：0 = CALL（默认），1 = DELEGATECALL。
	 * 批量发送经 MultiSend 1.4.1 时必须传 1（Safe delegatecall 进 MultiSend）。
	 */
	operation?: number;
	/**
	 * 原始子调用列表（批量时）。Tempo 分支需要它来追加报销 transfer 后重新编码
	 * MultiSend；native 分支忽略它，仍用 to/value/data/operation（字节不变）。
	 */
	calls?: Call[];
	/** 网络标识（如 'arb-mainnet'） */
	network: string;
	onStatus: (status: SendStatus) => void;
	/** 自定义 gas 参数，未设置时自动估算 */
	gasOverrides?: GasOverrides;
	/**
	 * In-band 结算：用哪个资产付 gas。null/未设 = 原生币；否则为白名单稳定币地址（用户所选）。
	 * Tempo 忽略此项（固定 pathUSD）。
	 */
	gasFeeToken?: Address | null;
	/** In-band：confirm UI 已展示并确认的报销报价，逐字节签署（可选；无则提交时现算）。 */
	quotedFee?: QuotedInBandFee;
	/** 等待上链确认的最长毫秒数（默认 120000）。到点返回超时，调用方可用当前 gas 重发（同 nonce → 替换）。 */
	confirmTimeoutMs?: number;
}

interface SendCtx {
	safeAddress: Address;
	publicKeyHex: string;
	credentialId: string;
	rpId: string;
	chainId: number;
	deployed: boolean;
	nonce: bigint;
	initCode: Hex;
	onStatus: (status: SendStatus) => void;
}

export async function sendContractCall(params: ContractCallParams): Promise<SendResult> {
	const { safeAddress, publicKeyHex, credentialId, rpId, network, onStatus } = params;

	const chain = chainInfoBySlug(network);
	if (!chain) return { success: false, error: `Unsupported network: ${network}` };
	const chainId = chain.chainId;

	try {
		onStatus('checking');
		const deployed = await isDeployed(safeAddress, chainId);
		const nonce = deployed ? await getNonce(safeAddress, chainId) : 0n;
		const initCode: Hex = !deployed ? buildInitCode(publicKeyHex) : '0x';

		const ctx: SendCtx = {
			safeAddress, publicKeyHex, credentialId, rpId, chainId, deployed, nonce, initCode, onStatus
		};

		return isTempoChain(chainId) ? await sendTempo(ctx, params) : await sendInBand(ctx, params);
	} catch (err) {
		onStatus('failed');
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * 通用 in-band 结算路径（Tempo 之外的所有链）。vela relay 现在要求每条链都 in-band：
 *   - UserOp 用 maxFeePerGas = maxPriorityFeePerGas = 0 签署（EntryPoint 原生 prefund/refund 变 no-op），
 *   - 把「向 relay 结算地址报销」的 transfer 追加进 UserOp 的 MultiSend——原生 value 腿，或用户所选
 *     稳定币的 `transfer` 腿。结算地址与可付资产由 vela_getInBandGasQuote 给出；金额按
 *     gas × 网络价 × 3 定价（见 inband.ts，native 价上取整/fee 币下取整，永不少收，稳过 relay 的
 *     reimbursed ≥ required 复核）。非-Tempo 不带 feeToken 字段（外层是普通原生 EIP-1559 交易）。
 */
async function sendInBand(ctx: SendCtx, params: ContractCallParams): Promise<SendResult> {
	const { safeAddress, credentialId, rpId, chainId, deployed, nonce, initCode, onStatus } = ctx;
	const gasFeeToken = (params.gasFeeToken ?? null) as Address | null; // null = 原生币付 gas

	onStatus('building');
	// 用户子调用：批量透传 calls，否则用单条 to/value/data 合成。
	const userCalls: Call[] = params.calls ?? [{ to: params.to, value: params.value, data: params.data }];

	// 1) 取 relay 的 in-band 报价：结算收款地址 + 可付资产（含所选稳定币）的余额/USD 价。
	const quotes = await getInBandGasQuotes(safeAddress, chainId);
	const quote = quotes ? findInBandGasQuote(quotes, gasFeeToken) : null;
	const nativeQuote = quotes ? findInBandGasQuote(quotes, null) : null;
	if (!quote || !nativeQuote) {
		onStatus('failed');
		return {
			success: false,
			error: gasFeeToken
				? 'The gas relayer cannot accept the selected fee token right now. Please pick a different gas asset.'
				: 'The gas relayer is unavailable right now. Please try again.'
		};
	}

	const buildBatch = (amount: bigint, recipient: Address): Hex =>
		inBandBatchCallData([...userCalls, buildInBandFeeLeg(gasFeeToken, recipient, amount)]);

	// 2) maxFee=0 的 UserOp + gas 地板，用占位报销腿估算（自转账，收款人先填 Safe 自己：value/金额
	//    不影响 gas，relay 估算会把 sender 原生余额覆盖成 100 ETH，所选稳定币必是 Safe 持有的 → 占位不 revert）。
	const gas: GasParams = {
		verificationGasLimit: deployed ? 300000n : NATIVE_VERIFICATION_GAS_UNDEPLOYED,
		callGasLimit: 3000000n, // 合约调用可能很重，给足初始值让 bundler 正确估算
		preVerificationGas: 60000n,
		maxFeePerGas: 0n,
		maxPriorityFeePerGas: 0n
	};

	onStatus('estimating');
	const dummyOp = packOp(safeAddress, nonce, initCode, buildBatch(1n, safeAddress), gas, buildDummySignature());
	const hasContractCall = userCalls.some((c) => c.data && c.data !== '0x');
	try {
		const est = await estimateUserOperationGas(formatUserOpForRpc(dummyOp), chainId);
		// 未部署：钉死 2M（估算低报会 AA13 OOG，×1.5 又可能超 cap）；已部署：估算 ×1.5 兜底地板。
		gas.verificationGasLimit = deployed
			? bigintMax((BigInt(est.verificationGasLimit) * 15n) / 10n, 300000n)
			: NATIVE_VERIFICATION_GAS_UNDEPLOYED;
		const userCallGas = params.gasOverrides?.callGasLimit ?? 0n;
		gas.callGasLimit = bigintMax((BigInt(est.callGasLimit) * 15n) / 10n, bigintMax(userCallGas, 200000n));
		gas.preVerificationGas = BigInt(est.preVerificationGas) + 5000n;
	} catch (err) {
		// 含真实合约调用而估算失败：不提交注定 OOG 的 op。纯转账批次保留地板值。
		void err;
		if (hasContractCall) {
			onStatus('failed');
			return { success: false, error: 'Could not estimate gas for this transaction. The network may be busy — please try again.' };
		}
		gas.callGasLimit = 200000n;
	}

	// 3) 报销金额 + 收款地址：优先用 confirm UI 已展示并确认的报价（签什么执行什么）；否则现算。
	let feeAmount: bigint;
	let feeRecipient: Address;
	const quotedFee = params.quotedFee;
	if (quotedFee && quotedFee.amount > 0n && /^0x[0-9a-fA-F]{40}$/.test(quotedFee.recipient)) {
		feeAmount = quotedFee.amount;
		feeRecipient = quotedFee.recipient;
	} else {
		const gasPriceWei = await inBandGasPrice(chainId);
		const totalGas = gas.verificationGasLimit + gas.callGasLimit + gas.preVerificationGas;
		const amount = calculateInBandFeeAmount(totalGas, gasPriceWei, quote, nativeQuote);
		if (amount === null) {
			onStatus('failed');
			return { success: false, error: 'Could not calculate the gas fee. Please try again.' };
		}
		feeAmount = amount;
		feeRecipient = quote.recipient;
	}

	// 4) 回填真实报销腿 → 算 hash、签名、打包、提交（非-Tempo 不带 feeToken）。
	const finalCallData = buildBatch(feeAmount, feeRecipient);
	const safeOpHash = calculateSafeOpHash(safeAddress, finalCallData, nonce, initCode, gas, BigInt(chainId));

	onStatus('signing');
	const signature = await signOp(safeOpHash, credentialId, rpId);
	if (!signature.ok) {
		onStatus('failed');
		return { success: false, error: signature.error };
	}

	const finalUserOp = packOp(safeAddress, nonce, initCode, finalCallData, gas, signature.value);

	onStatus('submitting');
	const userOpHash = await sendUserOperation(formatUserOpForRpc(finalUserOp), chainId);
	return waitReceipt(userOpHash, chainId, onStatus, params.confirmTimeoutMs);
}

/** 报销定价用的网络 gas 价（原始链价，非含 bundler markup 的 tier 价）；0 时回退。 */
async function inBandGasPrice(chainId: number): Promise<bigint> {
	const raw = await getChainGasPriceAtto(chainId);
	if (raw > 0n) return raw;
	return (await getGasPrices(chainId)).maxFeePerGas;
}

/** in-band 报销报价（供 confirm UI 显示 + 回传 sendInBand 逐字节签署）。 */
export interface InBandFeeQuote {
	/** 报销金额（fee 资产自身单位）。 */
	amount: bigint;
	/** relay 结算收款地址（报销腿的目标）。 */
	recipient: Address;
	asset: 'native' | 'erc20';
	feeToken: Address | null;
	decimals: number;
	symbol: string;
}

/**
 * 估算某笔 in-band 发送的 gas 报销费用——**不签名**。confirm UI 用它展示费用并把结果作为
 * `quotedFee` 回传给 sendToken/sendContractCall（显示即签署）。Tempo 有独立定价，此处返回 null。
 * `gasFeeToken` null = 原生币；否则为 Safe 持有的白名单稳定币地址。relay 无法报价时返回 null。
 */
export async function estimateInBandFee(input: {
	safeAddress: Address;
	publicKeyHex: string;
	network: string;
	calls: Call[];
	gasFeeToken?: Address | null;
}): Promise<InBandFeeQuote | null> {
	const chain = chainInfoBySlug(input.network);
	if (!chain || isTempoChain(chain.chainId)) return null;
	const chainId = chain.chainId;
	const gasFeeToken = input.gasFeeToken ?? null;

	const quotes = await getInBandGasQuotes(input.safeAddress, chainId);
	const quote = quotes ? findInBandGasQuote(quotes, gasFeeToken) : null;
	const nativeQuote = quotes ? findInBandGasQuote(quotes, null) : null;
	if (!quote || !nativeQuote) return null;

	const deployed = await isDeployed(input.safeAddress, chainId);
	const nonce = deployed ? await getNonce(input.safeAddress, chainId) : 0n;
	const initCode: Hex = !deployed ? buildInitCode(input.publicKeyHex) : '0x';

	const gas: GasParams = {
		verificationGasLimit: deployed ? 300000n : NATIVE_VERIFICATION_GAS_UNDEPLOYED,
		callGasLimit: 3000000n,
		preVerificationGas: 60000n,
		maxFeePerGas: 0n,
		maxPriorityFeePerGas: 0n
	};
	const placeholder = inBandBatchCallData([
		...input.calls,
		buildInBandFeeLeg(gasFeeToken, input.safeAddress, 1n)
	]);
	const dummyOp = packOp(input.safeAddress, nonce, initCode, placeholder, gas, buildDummySignature());
	try {
		const est = await estimateUserOperationGas(formatUserOpForRpc(dummyOp), chainId);
		gas.verificationGasLimit = deployed
			? bigintMax((BigInt(est.verificationGasLimit) * 15n) / 10n, 300000n)
			: NATIVE_VERIFICATION_GAS_UNDEPLOYED;
		gas.callGasLimit = bigintMax((BigInt(est.callGasLimit) * 15n) / 10n, 200000n);
		gas.preVerificationGas = BigInt(est.preVerificationGas) + 5000n;
	} catch {
		gas.callGasLimit = 200000n;
	}

	const gasPriceWei = await inBandGasPrice(chainId);
	const totalGas = gas.verificationGasLimit + gas.callGasLimit + gas.preVerificationGas;
	const amount = calculateInBandFeeAmount(totalGas, gasPriceWei, quote, nativeQuote);
	if (amount === null) return null;
	return {
		amount,
		recipient: quote.recipient,
		asset: quote.asset,
		feeToken: quote.feeToken,
		decimals: quote.decimals,
		symbol: quote.symbol
	};
}

/** Tempo（稳定币付 gas）路径：maxFee=0 + 把报销 transfer 追加进 MultiSend。 */
async function sendTempo(ctx: SendCtx, params: ContractCallParams): Promise<SendResult> {
	const { safeAddress, credentialId, rpId, chainId, deployed, nonce, initCode, onStatus } = ctx;
	const feeToken = TEMPO_DEFAULT_FEE_TOKEN as Address;

	onStatus('building');
	// 1) 取 relay 的结算收款地址（pathUSD 报价里的 recipient）——追加 transfer 的目标。
	//    旧的 per-Safe depositAddress 模型已被 relay 移除，统一走 in-band 结算地址。
	const quotes = await getInBandGasQuotes(safeAddress, chainId);
	const feeCollector =
		findInBandGasQuote(quotes ?? [], feeToken)?.recipient ??
		findInBandGasQuote(quotes ?? [], null)?.recipient;
	if (!feeCollector || !/^0x[0-9a-fA-F]{40}$/.test(feeCollector)) {
		onStatus('failed');
		return { success: false, error: 'The Tempo gas relayer is unavailable right now. Please try again.' };
	}

	// 2) 用户子调用（批量透传 calls，否则用单条 to/value/data 合成）。
	const userCalls: Call[] = params.calls ?? [{ to: params.to, value: params.value, data: params.data }];
	const subCallCount = userCalls.length + 1; // + 报销 transfer
	const buildBatch = (reimbursement: bigint): Hex =>
		tempoBatchCallData(userCalls, feeToken, feeCollector as Address, reimbursement);

	const gasPriceAtto = await getChainGasPriceAtto(chainId);

	// 3) maxFee=0 的 UserOp + Tempo gas 地板，先估算。
	const gas: GasParams = {
		verificationGasLimit: deployed ? 300000n : TEMPO_VERIFICATION_GAS_UNDEPLOYED,
		callGasLimit: tempoCallGasLimit(subCallCount),
		preVerificationGas: 100000n,
		maxFeePerGas: 0n,
		maxPriorityFeePerGas: 0n
	};

	onStatus('estimating');
	const dummyOp = packOp(safeAddress, nonce, initCode, buildBatch(1n), gas, buildDummySignature());
	try {
		const est = await estimateUserOperationGas(formatUserOpForRpc(dummyOp), chainId);
		gas.verificationGasLimit = bigintMax((BigInt(est.verificationGasLimit) * 15n) / 10n, gas.verificationGasLimit);
		gas.callGasLimit = bigintMax((BigInt(est.callGasLimit) * 15n) / 10n, tempoCallGasLimit(subCallCount));
		gas.preVerificationGas = BigInt(est.preVerificationGas) + 10000n;
	} catch {
		// 估算失败时保留地板值（Tempo bundler 估算常低报，地板更安全）。
	}

	// 4) 报销额用现实 gas 定价（非膨胀上限），重建 callData。
	const expectedGas = tempoExpectedGas(deployed, subCallCount);
	const reimbursement = tempoReimbursement(expectedGas, gasPriceAtto, TEMPO_FEE_TOKEN_DECIMALS);
	const finalCallData = buildBatch(reimbursement);

	// 5) 对最终 callData 算 hash、签名、打包。
	const safeOpHash = calculateSafeOpHash(safeAddress, finalCallData, nonce, initCode, gas, BigInt(chainId));
	onStatus('signing');
	const signature = await signOp(safeOpHash, credentialId, rpId);
	if (!signature.ok) {
		onStatus('failed');
		return { success: false, error: signature.error };
	}
	const finalUserOp = packOp(safeAddress, nonce, initCode, finalCallData, gas, signature.value);

	// 6) 提交时 dict 并入 feeToken。
	onStatus('submitting');
	const dict: UserOpDict = { ...formatUserOpForRpc(finalUserOp), feeToken };
	const userOpHash = await sendUserOperation(dict, chainId);
	return waitReceipt(userOpHash, chainId, onStatus, params.confirmTimeoutMs);
}

// ─── helpers ───

function bigintMax(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}

/** 把一组普通 CALL 编码成 Safe delegatecall 进 MultiSend 的 executeUserOp callData（op=1）。 */
function inBandBatchCallData(calls: Call[]): Hex {
	const queued = calls.map((c, i) => ({ id: String(i), label: '', signature: '', to: c.to, value: c.value, data: c.data }));
	return buildCallData(MULTISEND_ADDRESS, 0n, encodeMultiSendCall(queued), 1);
}

/** 用户子调用 + Tempo pathUSD 报销 transfer 的 MultiSend callData（报销腿即通用 in-band fee leg）。 */
function tempoBatchCallData(
	userCalls: Call[],
	feeToken: Address,
	feeCollector: Address,
	reimbursement: bigint
): Hex {
	return inBandBatchCallData([...userCalls, buildInBandFeeLeg(feeToken, feeCollector, reimbursement)]);
}

function packOp(
	sender: Address,
	nonce: bigint,
	initCode: Hex,
	callData: Hex,
	gas: GasParams,
	signature: Hex
): UserOperation {
	return {
		sender,
		nonce: numberToHex(nonce),
		initCode,
		callData,
		accountGasLimits: packAccountGasLimits(gas.verificationGasLimit, gas.callGasLimit),
		preVerificationGas: numberToHex(gas.preVerificationGas),
		gasFees: packGasFees(gas.maxPriorityFeePerGas, gas.maxFeePerGas),
		paymasterAndData: '0x',
		signature
	};
}

async function signOp(
	safeOpHash: Hex,
	credentialId: string,
	rpId: string
): Promise<{ ok: true; value: Hex } | { ok: false; error: string }> {
	const sigResult = await signSafeOpWithPasskey(safeOpHash, credentialId, rpId);
	if (!sigResult.ok) return { ok: false, error: sigResult.error };
	const { authenticatorData, clientDataFields, r, s } = sigResult.result;
	const contractSig = buildContractSignatureWebAuthn(authenticatorData, clientDataFields, r, s);
	return { ok: true, value: buildUserOpSignature(0, 0, contractSig) };
}

async function waitReceipt(
	userOpHash: Hex,
	chainId: number,
	onStatus: (status: SendStatus) => void,
	timeoutMs = 120_000
): Promise<SendResult> {
	onStatus('waiting');
	const startTime = Date.now();
	while (Date.now() - startTime < timeoutMs) {
		const receipt = await getUserOperationReceipt(userOpHash, chainId);
		if (receipt) {
			if (receipt.success) {
				onStatus('confirmed');
				return {
					success: true,
					txHash: receipt.receipt.transactionHash,
					explorerUrl: `${explorerTxUrl(chainId)}${receipt.receipt.transactionHash}`
				};
			}
			onStatus('failed');
			return { success: false, error: 'Transaction reverted' };
		}
		await new Promise((resolve) => setTimeout(resolve, 1500));
	}
	return { success: false, error: 'Transaction confirmation timed out' };
}
