/**
 * Safe 提现编排器。
 *
 * 单次签名流程：dummy signature 估算 gas → 真实签名 → 提交。
 */
import { type Address, type Hex, numberToHex } from 'viem';
import { parseP256PublicKey } from '../compute-safe-address.js';
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
import { ARBITRUM_CHAIN_ID } from './constants.js';

export type SendStatus =
	| 'checking'
	| 'building'
	| 'estimating'
	| 'signing'
	| 'submitting'
	| 'waiting'
	| 'confirmed'
	| 'failed';

export interface SendResult {
	success: boolean;
	txHash?: string;
	error?: string;
}

export interface SendParams {
	safeAddress: Address;
	publicKeyHex: string;
	credentialId: string;
	rpId: string;
	recipient: Address;
	amount: bigint;
	onStatus: (status: SendStatus) => void;
}

export async function sendEth(params: SendParams): Promise<SendResult> {
	const { safeAddress, publicKeyHex, credentialId, rpId, recipient, amount, onStatus } =
		params;
	const { x: pubX, y: pubY } = parseP256PublicKey(publicKeyHex);

	try {
		// 1. 检查部署状态 + nonce
		onStatus('checking');
		const deployed = await isDeployed(safeAddress);
		const nonce = deployed ? await getNonce(safeAddress) : 0n;

		// 2. 构建 callData + initCode
		onStatus('building');
		const callData = buildCallData(recipient, amount);
		const initCode: Hex = !deployed ? buildInitCode(publicKeyHex) : '0x';
		const gasPrices = await getGasPrices();

		// 初始 gas（偏高，后面会被估算覆盖）
		const initialGas: GasParams = {
			verificationGasLimit: deployed ? 300000n : 600000n,
			callGasLimit: 100000n,
			preVerificationGas: 60000n,
			...gasPrices
		};

		// 3. 用 dummy signature 估算 gas
		onStatus('estimating');
		const dummySignature = buildDummySignature(pubX, pubY);
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

		const estimates = await estimateUserOperationGas(dummyUserOp);

		// 用估算值 + 20% buffer
		const refinedGas: GasParams = {
			verificationGasLimit: (BigInt(estimates.verificationGasLimit) * 13n) / 10n,
			callGasLimit: (BigInt(estimates.callGasLimit) * 13n) / 10n,
			preVerificationGas: BigInt(estimates.preVerificationGas) + 5000n,
			...gasPrices
		};

		// 4. 用真实 gas 计算 safeOpHash
		const safeOpHash = calculateSafeOpHash(
			safeAddress,
			callData,
			nonce,
			initCode,
			refinedGas,
			ARBITRUM_CHAIN_ID
		);

		// 5. WebAuthn 签名（用户只需认证一次）
		onStatus('signing');
		const sigResult = await signSafeOpWithPasskey(safeOpHash, credentialId, rpId);
		if (!sigResult.ok) {
			return { success: false, error: sigResult.error };
		}

		const { authenticatorData, clientDataFields, r, s } = sigResult.result;

		// 6. 构建最终 UserOp
		const contractSig = buildContractSignatureWebAuthn(
			authenticatorData,
			clientDataFields,
			r,
			s,
			pubX,
			pubY
		);
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

		// 7. 提交
		onStatus('submitting');
		const userOpHash = await sendUserOperation(finalUserOp);

		// 8. 等待确认
		onStatus('waiting');
		const startTime = Date.now();
		while (Date.now() - startTime < 120_000) {
			const receipt = await getUserOperationReceipt(userOpHash);
			if (receipt) {
				if (receipt.success) {
					onStatus('confirmed');
					return {
						success: true,
						txHash: receipt.receipt.transactionHash
					};
				}
				onStatus('failed');
				return { success: false, error: 'Transaction reverted' };
			}
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}

		return { success: false, error: 'Transaction confirmation timed out' };
	} catch (err) {
		onStatus('failed');
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
