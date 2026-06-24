/**
 * Safe 提现编排器（多网络、native + ERC-20，native token 付 gas）。
 *
 * 流程：dummy signature 估算 gas → 真实签名 → 提交。传输已改为直连
 * （wallet/infra/*）。Tempo（无原生 gas 币）委托给 send-contract-call 的 Tempo
 * 分支（稳定币付 gas）。
 */
import {
	type Address,
	type Hex,
	numberToHex,
	encodeFunctionData,
	erc20Abi,
	parseUnits
} from 'viem';
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
import { chainInfoBySlug, isTempoChain, explorerTxUrl } from '$lib/wallet/infra/chains.js';
import { isDeployed, getNonce, getGasPrices } from '$lib/wallet/infra/account-state.js';
import {
	estimateUserOperationGas,
	sendUserOperation,
	getUserOperationReceipt
} from '$lib/wallet/infra/bundler-client.js';
import { sendContractCall } from './send-contract-call.js';

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
	amount: string;
	network: string;
	tokenAddress: string | null;
	decimals: number;
	onStatus: (status: SendStatus) => void;
}

export async function sendToken(params: SendParams): Promise<SendResult> {
	const {
		safeAddress, publicKeyHex, credentialId, rpId,
		recipient, amount, network, tokenAddress, decimals, onStatus
	} = params;

	const chain = chainInfoBySlug(network);
	if (!chain) return { success: false, error: `Unsupported network: ${network}` };
	const chainId = chain.chainId;

	const amountWei = parseUnits(String(amount), decimals);
	const isNative = !tokenAddress;

	// Tempo：稳定币付 gas，复用 send-contract-call 的 Tempo 分支（native 转账在
	// Tempo 上无意义，这里把提现表示为一条普通 call 交给编排器追加报销 transfer）。
	if (isTempoChain(chainId)) {
		const to = (isNative ? recipient : (tokenAddress as Address));
		const value = isNative ? amountWei : 0n;
		const data: Hex = isNative
			? '0x'
			: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, amountWei] });
		return sendContractCall({
			safeAddress, publicKeyHex, credentialId, rpId,
			to, value, data, operation: 0, network, onStatus
		});
	}

	try {
		// 1. 检查部署状态 + nonce
		onStatus('checking');
		const deployed = await isDeployed(safeAddress, chainId);
		const nonce = deployed ? await getNonce(safeAddress, chainId) : 0n;

		// 2. 构建 callData
		onStatus('building');
		let callData: Hex;
		if (isNative) {
			callData = buildCallData(recipient, amountWei);
		} else {
			const transferData = encodeFunctionData({
				abi: erc20Abi, functionName: 'transfer',
				args: [recipient, amountWei]
			});
			callData = buildCallData(tokenAddress as Address, 0n, transferData);
		}

		const initCode: Hex = !deployed ? buildInitCode(publicKeyHex) : '0x';
		const gasPrices = await getGasPrices(chainId);

		const initialGas: GasParams = {
			verificationGasLimit: deployed ? 300000n : 600000n,
			callGasLimit: isNative ? 100000n : 150000n,
			preVerificationGas: 60000n,
			...gasPrices
		};

		// 3. 估算 gas
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

		const estimates = await estimateUserOperationGas(formatUserOpForRpc(dummyUserOp), chainId);

		const refinedGas: GasParams = {
			verificationGasLimit: (BigInt(estimates.verificationGasLimit) * 13n) / 10n,
			callGasLimit: (BigInt(estimates.callGasLimit) * 13n) / 10n,
			preVerificationGas: BigInt(estimates.preVerificationGas) + 5000n,
			...gasPrices
		};

		// 4. 计算 SafeOp Hash
		const safeOpHash = calculateSafeOpHash(
			safeAddress, callData, nonce, initCode, refinedGas, BigInt(chainId)
		);

		// 5. WebAuthn 签名
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
			accountGasLimits: packAccountGasLimits(refinedGas.verificationGasLimit, refinedGas.callGasLimit),
			preVerificationGas: numberToHex(refinedGas.preVerificationGas),
			gasFees: packGasFees(refinedGas.maxPriorityFeePerGas, refinedGas.maxFeePerGas),
			paymasterAndData: '0x',
			signature
		};

		// 6. 提交
		onStatus('submitting');
		const userOpHash = await sendUserOperation(formatUserOpForRpc(finalUserOp), chainId);

		// 7. 等待确认
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
	} catch (err) {
		onStatus('failed');
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}
