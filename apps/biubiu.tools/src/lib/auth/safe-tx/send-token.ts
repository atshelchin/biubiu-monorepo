/**
 * Safe 提现编排器（多网络、支持 native + ERC-20）。
 *
 * 单次签名流程：dummy signature 估算 gas → 真实签名 → 提交。
 */
import { type Address, type Hex, numberToHex, encodeFunctionData, erc20Abi, parseUnits } from 'viem';
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
	explorerUrl?: string;
	error?: string;
}

export interface SendParams {
	safeAddress: Address;
	publicKeyHex: string;
	credentialId: string;
	rpId: string;
	recipient: Address;
	/** 发送数量（人类可读格式，如 "0.1"） */
	amount: string;
	/** Alchemy 网络标识（如 "arb-mainnet"） */
	network: string;
	/** token 合约地址（native token 为 null） */
	tokenAddress: string | null;
	/** token 精度 */
	decimals: number;
	onStatus: (status: SendStatus) => void;
}

/**
 * 构建 ERC-20 transfer calldata
 */
function buildErc20TransferData(to: Address, amount: bigint): Hex {
	return encodeFunctionData({
		abi: erc20Abi,
		functionName: 'transfer',
		args: [to, amount]
	});
}

export async function sendToken(params: SendParams): Promise<SendResult> {
	const {
		safeAddress,
		publicKeyHex,
		credentialId,
		rpId,
		recipient,
		amount,
		network,
		tokenAddress,
		decimals,
		onStatus
	} = params;

	const chainCfg = CHAIN_CONFIG[network];
	if (!chainCfg) {
		return { success: false, error: `Unsupported network: ${network}` };
	}

	// publicKeyHex 用于 buildInitCode（首次部署配置 signer）
	const amountWei = parseUnits(String(amount), decimals);
	const isNative = !tokenAddress;

	try {
		// 1. 检查部署状态 + nonce
		onStatus('checking');
		const deployed = await isDeployed(safeAddress, network);
		const nonce = deployed ? await getNonce(safeAddress, network) : 0n;

		// 2. 构建 callData
		onStatus('building');
		let callData: Hex;
		if (isNative) {
			// native token: 直接转账
			callData = buildCallData(recipient, amountWei);
		} else {
			// ERC-20: token.transfer(recipient, amount)
			const transferData = buildErc20TransferData(recipient, amountWei);
			callData = buildCallData(tokenAddress as Address, 0n, transferData);
		}

		const initCode: Hex = !deployed ? buildInitCode(publicKeyHex) : '0x';
		const gasPrices = await getGasPrices(network);

		const initialGas: GasParams = {
			verificationGasLimit: deployed ? 300000n : 600000n,
			callGasLimit: isNative ? 100000n : 150000n,
			preVerificationGas: 60000n,
			...gasPrices
		};

		// 3. 用 dummy signature 估算 gas
		onStatus('estimating');
		const dummySignature = buildDummySignature();
		const dummyUserOp: UserOperation = {
			sender: safeAddress,
			nonce: numberToHex(nonce),
			initCode,
			callData,
			accountGasLimits: packAccountGasLimits(initialGas.verificationGasLimit, initialGas.callGasLimit),
			preVerificationGas: numberToHex(initialGas.preVerificationGas),
			gasFees: packGasFees(initialGas.maxPriorityFeePerGas, initialGas.maxFeePerGas),
			paymasterAndData: '0x',
			signature: dummySignature
		};

		const estimates = await estimateUserOperationGas(dummyUserOp, network);

		const refinedGas: GasParams = {
			verificationGasLimit: (BigInt(estimates.verificationGasLimit) * 13n) / 10n,
			callGasLimit: (BigInt(estimates.callGasLimit) * 13n) / 10n,
			preVerificationGas: BigInt(estimates.preVerificationGas) + 5000n,
			...gasPrices
		};

		// 4. 真实 gas 算 safeOpHash
		const safeOpHash = calculateSafeOpHash(
			safeAddress,
			callData,
			nonce,
			initCode,
			refinedGas,
			chainCfg.chainId
		);

		// 5. WebAuthn 签名
		console.log('[send] safeOpHash:', safeOpHash);
		console.log('[send] safeAddress:', safeAddress);
		console.log('[send] nonce:', nonce);
		console.log('[send] chainId:', chainCfg.chainId);
		console.log('[send] deployed:', deployed);

		onStatus('signing');
		const sigResult = await signSafeOpWithPasskey(safeOpHash, credentialId, rpId);
		if (!sigResult.ok) {
			return { success: false, error: sigResult.error };
		}

		const { authenticatorData, clientDataFields, r, s } = sigResult.result;
		console.log('[send] authenticatorData:', authenticatorData);
		console.log('[send] clientDataFields:', JSON.stringify(clientDataFields));
		console.log('[send] sig r:', r.toString());
		console.log('[send] sig s:', s.toString());

		const contractSig = buildContractSignatureWebAuthn(authenticatorData, clientDataFields, r, s);
		const signature = buildUserOpSignature(0, 0, contractSig);
		console.log('[send] signature length:', signature.length);

		const finalUserOp: UserOperation = {
			sender: safeAddress,
			nonce: numberToHex(nonce),
			initCode,
			callData,
			accountGasLimits: packAccountGasLimits(refinedGas.verificationGasLimit, refinedGas.callGasLimit),
			preVerificationGas: numberToHex(refinedGas.preVerificationGas),
			gasFees: packGasFees(refinedGas.maxPriorityFeePerGas, refinedGas.maxFeePerGas),
			paymasterAndData: '0x',
			signature
		};

		// 6. 提交
		console.log('[send] finalUserOp:', JSON.stringify({
			sender: finalUserOp.sender,
			nonce: finalUserOp.nonce,
			initCode: finalUserOp.initCode.slice(0, 20) + '...' + finalUserOp.initCode.length + ' chars',
			callData: finalUserOp.callData.slice(0, 20) + '...',
			accountGasLimits: finalUserOp.accountGasLimits,
			preVerificationGas: finalUserOp.preVerificationGas,
			gasFees: finalUserOp.gasFees,
			signatureLen: finalUserOp.signature.length
		}));
		console.log('[send] gas used for hash:', JSON.stringify({
			verificationGasLimit: refinedGas.verificationGasLimit.toString(),
			callGasLimit: refinedGas.callGasLimit.toString(),
			preVerificationGas: refinedGas.preVerificationGas.toString(),
			maxFeePerGas: refinedGas.maxFeePerGas.toString(),
			maxPriorityFeePerGas: refinedGas.maxPriorityFeePerGas.toString()
		}));

		onStatus('submitting');
		const userOpHash = await sendUserOperation(finalUserOp, network);

		// 7. 等待确认
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
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}

		return { success: false, error: 'Transaction confirmation timed out' };
	} catch (err) {
		onStatus('failed');
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}
