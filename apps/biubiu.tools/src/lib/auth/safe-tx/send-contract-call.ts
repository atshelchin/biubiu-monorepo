/**
 * Safe 合约调用编排器（通用版）。
 *
 * 与 send-token.ts 相同的 UserOp 流程，但接受任意 callData + value。
 * 用于订阅购买、NFT 转让等合约交互。
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
	type UserOperation,
	type GasParams
} from './build-userop.js';
import { signSafeOpWithPasskey } from './webauthn-sign.js';
import {
	isDeployed,
	getNonce,
	getGasPrices,
	estimateUserOperationGas,
	sendUserOperation,
	getUserOperationReceipt
} from './bundler-client.js';
import { CHAIN_CONFIG } from './constants.js';
import type { SendStatus, SendResult } from './send-token.js';

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
	/** 网络标识（如 'arb-mainnet'） */
	network: string;
	onStatus: (status: SendStatus) => void;
	/** 自定义 gas 参数，未设置时自动估算 */
	gasOverrides?: GasOverrides;
}

export async function sendContractCall(params: ContractCallParams): Promise<SendResult> {
	const { safeAddress, publicKeyHex, credentialId, rpId, to, value, data, network, onStatus, gasOverrides } =
		params;

	const chainCfg = CHAIN_CONFIG[network];
	if (!chainCfg) return { success: false, error: `Unsupported network: ${network}` };

	try {
		onStatus('checking');
		const deployed = await isDeployed(safeAddress, network);
		const nonce = deployed ? await getNonce(safeAddress, network) : 0n;

		onStatus('building');
		const callData = buildCallData(to, value, data);
		const initCode: Hex = !deployed ? buildInitCode(publicKeyHex) : '0x';
		const gasPrices = await getGasPrices(network);

		const initialGas: GasParams = {
			verificationGasLimit: deployed ? 300000n : 800000n,
			callGasLimit: 3000000n, // 合约部署可能需要很多 gas，给足初始值让 bundler 正确估算
			preVerificationGas: 60000n,
			...gasPrices
		};

		onStatus('estimating');
		const dummySignature = buildDummySignature();
		const dummyUserOp: UserOperation = {
			sender: safeAddress,
			nonce: numberToHex(nonce),
			initCode,
			callData,
			accountGasLimits: packAccountGasLimits(
				initialGas.verificationGasLimit,
				initialGas.callGasLimit
			),
			preVerificationGas: numberToHex(initialGas.preVerificationGas),
			gasFees: packGasFees(initialGas.maxPriorityFeePerGas, initialGas.maxFeePerGas),
			paymasterAndData: '0x',
			signature: dummySignature
		};

		const estimates = await estimateUserOperationGas(dummyUserOp, network);

		const estimatedCallGasLimit = (BigInt(estimates.callGasLimit) * 15n) / 10n; // 1.5x buffer
		const estimatedVerificationGasLimit = (BigInt(estimates.verificationGasLimit) * 15n) / 10n;

		// Gas limit: use the LARGER of bundler estimate vs user override (never go below estimate)
		const userCallGas = gasOverrides?.callGasLimit ?? 0n;
		const finalCallGasLimit = userCallGas > estimatedCallGasLimit ? userCallGas : estimatedCallGasLimit;

		const refinedGas: GasParams = {
			verificationGasLimit: estimatedVerificationGasLimit,
			callGasLimit: finalCallGasLimit,
			preVerificationGas: BigInt(estimates.preVerificationGas) + 5000n,
			maxFeePerGas: gasOverrides?.maxFeePerGas ?? gasPrices.maxFeePerGas,
			maxPriorityFeePerGas: gasOverrides?.maxPriorityFeePerGas ?? gasPrices.maxPriorityFeePerGas
		};

		const safeOpHash = calculateSafeOpHash(
			safeAddress,
			callData,
			nonce,
			initCode,
			refinedGas,
			chainCfg.chainId
		);

		onStatus('signing');
		const sigResult = await signSafeOpWithPasskey(safeOpHash, credentialId, rpId);
		if (!sigResult.ok) {
			onStatus('failed');
			return { success: false, error: sigResult.error };
		}

		const { authenticatorData, clientDataFields, r, s } = sigResult.result;
		const contractSig = buildContractSignatureWebAuthn(authenticatorData, clientDataFields, r, s);
		const signature = buildUserOpSignature(0, 0, contractSig);

		const finalUserOp: UserOperation = {
			sender: safeAddress,
			nonce: numberToHex(nonce),
			initCode,
			callData,
			accountGasLimits: packAccountGasLimits(
				refinedGas.verificationGasLimit,
				refinedGas.callGasLimit
			),
			preVerificationGas: numberToHex(refinedGas.preVerificationGas),
			gasFees: packGasFees(refinedGas.maxPriorityFeePerGas, refinedGas.maxFeePerGas),
			paymasterAndData: '0x',
			signature
		};

		onStatus('submitting');
		const userOpHash = await sendUserOperation(finalUserOp, network);

		onStatus('waiting');
		const startTime = Date.now();
		while (Date.now() - startTime < 120_000) {
			const receipt = await getUserOperationReceipt(userOpHash, network);
			if (receipt) {
				if (receipt.success) {
					onStatus('confirmed');
					return {
						success: true,
						txHash: receipt.receipt.transactionHash,
						explorerUrl: `${chainCfg.explorerUrl}${receipt.receipt.transactionHash}`
					};
				}
				onStatus('failed');
				return { success: false, error: 'Transaction reverted' };
			}
			await new Promise((resolve) => setTimeout(resolve, 1500));
		}

		return { success: false, error: 'Transaction confirmation timed out' };
	} catch (err) {
		onStatus('failed');
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}
