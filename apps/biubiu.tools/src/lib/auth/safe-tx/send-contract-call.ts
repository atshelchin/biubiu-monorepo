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
import { type Address, type Hex, numberToHex, encodeFunctionData, erc20Abi } from 'viem';
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
	type UserOpDict
} from '$lib/wallet/infra/bundler-client.js';
import { fetchBundlerAccountInfo } from '$lib/wallet/infra/bundler-account.js';
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

		return isTempoChain(chainId) ? await sendTempo(ctx, params) : await sendNative(ctx, params);
	} catch (err) {
		onStatus('failed');
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/** 标准 ERC-4337（原生币付 gas）路径——逻辑与改造前一致，仅换直连传输。 */
async function sendNative(ctx: SendCtx, params: ContractCallParams): Promise<SendResult> {
	const { safeAddress, credentialId, rpId, chainId, deployed, nonce, initCode, onStatus } = ctx;
	const { to, value, data, operation, gasOverrides } = params;

	onStatus('building');
	const callData = buildCallData(to, value, data, operation ?? 0);
	const gasPrices = await getGasPrices(chainId);

	const initialGas: GasParams = {
		// Undeployed: start the estimate's dummy op with the deploy floor so a bundler that honours
		// the provided limit during simulation doesn't OOG the deploy and fail the estimate itself.
		verificationGasLimit: deployed ? 300000n : NATIVE_VERIFICATION_GAS_UNDEPLOYED,
		callGasLimit: 3000000n, // 合约部署可能需要很多 gas，给足初始值让 bundler 正确估算
		preVerificationGas: 60000n,
		...gasPrices
	};

	onStatus('estimating');
	const dummyUserOp = packOp(safeAddress, nonce, initCode, callData, initialGas, buildDummySignature());
	const estimates = await estimateUserOperationGas(formatUserOpForRpc(dummyUserOp), chainId);

	const estimatedCallGasLimit = (BigInt(estimates.callGasLimit) * 15n) / 10n; // 1.5x buffer
	const estimatedVerificationGasLimit = (BigInt(estimates.verificationGasLimit) * 15n) / 10n;

	// First-deploy: PIN verificationGasLimit to the bundler cap (= enough for the ~2M deploy, and the
	// max the bundler accepts). We deliberately do NOT use the estimate here: it under-reports the
	// undeployed deploy (→ AA13 OOG), and estimate×1.5 could also exceed the cap (→ "exceeds max").
	// Deployed ops use the pure estimate (no initCode, cheap verification, well under the cap).
	const finalVerificationGasLimit = deployed
		? estimatedVerificationGasLimit
		: NATIVE_VERIFICATION_GAS_UNDEPLOYED;

	// Gas limit: use the LARGER of bundler estimate vs user override (never go below estimate)
	const userCallGas = gasOverrides?.callGasLimit ?? 0n;
	const finalCallGasLimit = userCallGas > estimatedCallGasLimit ? userCallGas : estimatedCallGasLimit;

	const refinedGas: GasParams = {
		verificationGasLimit: finalVerificationGasLimit,
		callGasLimit: finalCallGasLimit,
		preVerificationGas: BigInt(estimates.preVerificationGas) + 5000n,
		maxFeePerGas: gasOverrides?.maxFeePerGas ?? gasPrices.maxFeePerGas,
		maxPriorityFeePerGas: gasOverrides?.maxPriorityFeePerGas ?? gasPrices.maxPriorityFeePerGas
	};

	const safeOpHash = calculateSafeOpHash(safeAddress, callData, nonce, initCode, refinedGas, BigInt(chainId));

	onStatus('signing');
	const signature = await signOp(safeOpHash, credentialId, rpId);
	if (!signature.ok) {
		onStatus('failed');
		return { success: false, error: signature.error };
	}

	const finalUserOp = packOp(safeAddress, nonce, initCode, callData, refinedGas, signature.value);

	onStatus('submitting');
	const userOpHash = await sendUserOperation(formatUserOpForRpc(finalUserOp), chainId);
	return waitReceipt(userOpHash, chainId, onStatus);
}

/** Tempo（稳定币付 gas）路径：maxFee=0 + 把报销 transfer 追加进 MultiSend。 */
async function sendTempo(ctx: SendCtx, params: ContractCallParams): Promise<SendResult> {
	const { safeAddress, credentialId, rpId, chainId, deployed, nonce, initCode, onStatus } = ctx;
	const feeToken = TEMPO_DEFAULT_FEE_TOKEN as Address;

	onStatus('building');
	// 1) 先取 bundler 的 per-Safe 报销收款 EOA（追加 transfer 的目标地址）。
	const info = await fetchBundlerAccountInfo(chainId, safeAddress);
	const feeCollector = info?.depositAddress;
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
	return waitReceipt(userOpHash, chainId, onStatus);
}

// ─── helpers ───

function bigintMax(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}

/** 把用户子调用 + 报销 transfer 编码成 Safe delegatecall 进 MultiSend 的 executeUserOp callData。 */
function tempoBatchCallData(
	userCalls: Call[],
	feeToken: Address,
	feeCollector: Address,
	reimbursement: bigint
): Hex {
	const transferData = encodeFunctionData({
		abi: erc20Abi,
		functionName: 'transfer',
		args: [feeCollector, reimbursement]
	});
	const all: Call[] = [...userCalls, { to: feeToken, value: 0n, data: transferData }];
	const queued = all.map((c, i) => ({ id: String(i), label: '', signature: '', to: c.to, value: c.value, data: c.data }));
	const multiSendData = encodeMultiSendCall(queued);
	return buildCallData(MULTISEND_ADDRESS, 0n, multiSendData, 1); // operation=1 delegatecall
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
	onStatus: (status: SendStatus) => void
): Promise<SendResult> {
	onStatus('waiting');
	const startTime = Date.now();
	while (Date.now() - startTime < 120_000) {
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
