/**
 * Safe 提现编排器（多网络、native + ERC-20、可选 ERC-20 代付 gas）。
 *
 * 流程：dummy signature 估算 gas → 真实签名 → 提交。
 * 当指定 gasToken 时，使用 Pimlico ERC-20 Paymaster 代付 gas，
 * 并用 MultiSend 在同一笔交易中 approve paymaster + 执行转账。
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
	getUserOperationReceipt,
	getPaymasterStubData,
	getPaymasterData,
	getTokenQuotes
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
	amount: string;
	network: string;
	tokenAddress: string | null;
	decimals: number;
	/** ERC-20 代付 gas 的 token 地址（null 则用 native token 付 gas） */
	gasTokenAddress?: string | null;
	onStatus: (status: SendStatus) => void;
}

// ─── MultiSend 编码 ───

function encodeMultiSendTx(to: Address, data: Hex, value: bigint = 0n, operation: number = 0): Hex {
	const opByte = operation.toString(16).padStart(2, '0');
	const toBytes = to.slice(2).toLowerCase();
	const valueBytes = value.toString(16).padStart(64, '0');
	const dataBytes = data === '0x' ? '' : data.slice(2);
	const dataLength = (dataBytes.length / 2).toString(16).padStart(64, '0');
	return `0x${opByte}${toBytes}${valueBytes}${dataLength}${dataBytes}` as Hex;
}

function buildMultiSendCallData(txs: Array<{ to: Address; data: Hex; value?: bigint }>): Hex {
	let packed = '0x' as Hex;
	for (const tx of txs) {
		const encoded = encodeMultiSendTx(tx.to, tx.data, tx.value ?? 0n);
		packed = `${packed}${encoded.slice(2)}` as Hex;
	}

	const multiSendData = encodeFunctionData({
		abi: [{
			name: 'multiSend', type: 'function',
			inputs: [{ name: 'transactions', type: 'bytes' }],
			outputs: [], stateMutability: 'payable'
		}],
		functionName: 'multiSend',
		args: [packed]
	});

	// executeUserOp with DelegateCall to MultiSend
	return buildCallData(
		'0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526' as Address, // MultiSend
		0n,
		multiSendData,
		1 // DelegateCall
	);
}

export async function sendToken(params: SendParams): Promise<SendResult> {
	const {
		safeAddress, publicKeyHex, credentialId, rpId,
		recipient, amount, network, tokenAddress, decimals,
		gasTokenAddress, onStatus
	} = params;

	const chainCfg = CHAIN_CONFIG[network];
	if (!chainCfg) return { success: false, error: `Unsupported network: ${network}` };

	const amountWei = parseUnits(String(amount), decimals);
	const isNative = !tokenAddress;
	const usePaymaster = !!gasTokenAddress;

	try {
		// 1. 检查部署状态 + nonce
		onStatus('checking');
		const deployed = await isDeployed(safeAddress, network);
		const nonce = deployed ? await getNonce(safeAddress, network) : 0n;

		// 2. 构建 callData
		onStatus('building');
		let callData: Hex;

		if (usePaymaster && !isNative) {
			// ERC-20 转账 + paymaster：需要 MultiSend 来 batch approve + transfer
			// 先获取 paymaster 合约地址
			let paymasterAddress: Address;
			try {
				const quotes = await getTokenQuotes(network, [gasTokenAddress]);
				paymasterAddress = (quotes as Array<{ paymaster: string }>)[0]?.paymaster as Address;
				if (!paymasterAddress) throw new Error('No paymaster available');
			} catch {
				paymasterAddress = '0x0000000000000039cd5e8aE05257CE51C473ddd1' as Address;
			}

			// 如果 gasToken 和 transferToken 是同一个，用 MultiSend batch: approve + transfer
			// 如果不同，只需 approve gasToken（transfer 在 callData 里单独做）
			const transferData = encodeFunctionData({
				abi: erc20Abi, functionName: 'transfer',
				args: [recipient, amountWei]
			});

			// approve paymaster 花费 gas token（用一个较大的固定额度，实际只扣需要的）
			const approveData = encodeFunctionData({
				abi: erc20Abi, functionName: 'approve',
				args: [paymasterAddress, parseUnits('10', decimals)] // 授权足够的金额
			});

			if (gasTokenAddress === tokenAddress) {
				// 同一个 token：MultiSend(approve gasToken for paymaster + transfer token)
				callData = buildMultiSendCallData([
					{ to: gasTokenAddress as Address, data: approveData },
					{ to: tokenAddress as Address, data: transferData }
				]);
			} else {
				// 不同 token：MultiSend(approve gasToken + transfer other token)
				callData = buildMultiSendCallData([
					{ to: gasTokenAddress as Address, data: approveData },
					{ to: tokenAddress as Address, data: transferData }
				]);
			}
		} else if (usePaymaster && isNative) {
			// Native 转账 + paymaster：MultiSend(approve gasToken + native transfer)
			let paymasterAddress: Address;
			try {
				const quotes = await getTokenQuotes(network, [gasTokenAddress]);
				paymasterAddress = (quotes as Array<{ paymaster: string }>)[0]?.paymaster as Address;
				if (!paymasterAddress) throw new Error('No paymaster available');
			} catch {
				paymasterAddress = '0x0000000000000039cd5e8aE05257CE51C473ddd1' as Address;
			}

			const approveData = encodeFunctionData({
				abi: erc20Abi, functionName: 'approve',
				args: [paymasterAddress, parseUnits('10', 6)] // USDC/USDT 6 decimals
			});

			// Native transfer 不需要 data，但 MultiSend 需要包装
			callData = buildMultiSendCallData([
				{ to: gasTokenAddress as Address, data: approveData },
				{ to: recipient, data: '0x', value: amountWei }
			]);
		} else if (isNative) {
			callData = buildCallData(recipient, amountWei);
		} else {
			const transferData = encodeFunctionData({
				abi: erc20Abi, functionName: 'transfer',
				args: [recipient, amountWei]
			});
			callData = buildCallData(tokenAddress as Address, 0n, transferData);
		}

		const initCode: Hex = !deployed ? buildInitCode(publicKeyHex) : '0x';
		const gasPrices = await getGasPrices(network);

		const initialGas: GasParams = {
			verificationGasLimit: deployed ? 300000n : 600000n,
			callGasLimit: usePaymaster ? 200000n : (isNative ? 100000n : 150000n),
			preVerificationGas: 60000n,
			...gasPrices
		};

		// 3. 估算 gas
		onStatus('estimating');
		const dummySignature = buildDummySignature();

		let paymasterAndData: Hex = '0x';

		if (usePaymaster) {
			// 先构建 dummy UserOp 获取 paymaster stub data
			const stubUserOp: UserOperation = {
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

			const stubData = await getPaymasterStubData(stubUserOp, network, gasTokenAddress);
			// 组装 paymasterAndData = paymaster + verificationGasLimit(16) + postOpGasLimit(16) + data
			const pmVerGas = stubData.paymasterVerificationGasLimit ?? '0x00';
			const pmPostGas = stubData.paymasterPostOpGasLimit ?? '0x00';
			const pmVerGasPad = BigInt(pmVerGas).toString(16).padStart(32, '0');
			const pmPostGasPad = BigInt(pmPostGas).toString(16).padStart(32, '0');
			paymasterAndData = (stubData.paymaster + pmVerGasPad + pmPostGasPad + (stubData.paymasterData?.slice(2) ?? '')) as Hex;
		}

		const dummyUserOp: UserOperation = {
			sender: safeAddress,
			nonce: numberToHex(nonce),
			initCode,
			callData,
			accountGasLimits: packAccountGasLimits(initialGas.verificationGasLimit, initialGas.callGasLimit),
			preVerificationGas: numberToHex(initialGas.preVerificationGas),
			gasFees: packGasFees(initialGas.maxPriorityFeePerGas, initialGas.maxFeePerGas),
			paymasterAndData,
			signature: dummySignature
		};

		const estimates = await estimateUserOperationGas(dummyUserOp, network);

		const refinedGas: GasParams = {
			verificationGasLimit: (BigInt(estimates.verificationGasLimit) * 13n) / 10n,
			callGasLimit: (BigInt(estimates.callGasLimit) * 13n) / 10n,
			preVerificationGas: BigInt(estimates.preVerificationGas) + 5000n,
			...gasPrices
		};

		// 4. 获取最终 paymaster data（如果用 paymaster）
		if (usePaymaster) {
			const finalStubOp: UserOperation = {
				sender: safeAddress,
				nonce: numberToHex(nonce),
				initCode,
				callData,
				accountGasLimits: packAccountGasLimits(refinedGas.verificationGasLimit, refinedGas.callGasLimit),
				preVerificationGas: numberToHex(refinedGas.preVerificationGas),
				gasFees: packGasFees(refinedGas.maxPriorityFeePerGas, refinedGas.maxFeePerGas),
				paymasterAndData: '0x',
				signature: dummySignature
			};

			const pmData = await getPaymasterData(finalStubOp, network, gasTokenAddress);
			const pmVerGas2 = BigInt(pmData.paymasterVerificationGasLimit ?? '0x00').toString(16).padStart(32, '0');
			const pmPostGas2 = BigInt(pmData.paymasterPostOpGasLimit ?? '0x00').toString(16).padStart(32, '0');
			paymasterAndData = (pmData.paymaster + pmVerGas2 + pmPostGas2 + (pmData.paymasterData?.slice(2) ?? '')) as Hex;
		}

		// 5. 计算 SafeOp Hash
		const safeOpHash = calculateSafeOpHash(
			safeAddress, callData, nonce, initCode, refinedGas,
			chainCfg.chainId, 0, 0, paymasterAndData
		);

		// 6. WebAuthn 签名
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
			paymasterAndData,
			signature
		};

		// 7. 提交
		onStatus('submitting');
		const userOpHash = await sendUserOperation(finalUserOp, network);

		// 8. 等待确认
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
