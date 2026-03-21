/**
 * 在 Polygon 主网模拟 EntryPoint.handleOps，追踪签名验证失败原因。
 *
 * 不发真实交易，用 eth_call 模拟。
 * 运行: cd apps/biubiu.tools && bun scripts/debug-signature.ts
 */
import {
	createPublicClient,
	http,
	encodeFunctionData,
	encodeAbiParameters,
	decodeFunctionResult,
	concat,
	pad,
	numberToHex,
	keccak256,
	toHex,
	type Hex,
	type Address
} from 'viem';
import { polygon } from 'viem/chains';
import {
	CONTRACTS,
	computeSafeAddress,
	parseP256PublicKey,
	encodeSetupData,
	calculateSaltNonce
} from '../src/lib/auth/compute-safe-address.js';
import {
	calculateSafeOpHash,
	buildCallData,
	buildInitCode,
	buildDummySignature,
	buildContractSignatureWebAuthn,
	buildUserOpSignature,
	formatUserOpForRpc,
	packAccountGasLimits,
	packGasFees,
	type GasParams,
	type UserOperation
} from '../src/lib/auth/safe-tx/build-userop.js';

const ALCHEMY_KEY = 'CbatvD0Nho8l9ibkfDqDD';
const PIMLICO_KEY = 'pim_ft3KoztkGnJBEPxoY1sHef';
const RPC_URL = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const BUNDLER_URL = `https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`;

const TEST_PUBLIC_KEY =
	'0408dbe337ec34437ace3af6b9204374eeff9f3e9dd07ecc259c53630a5505afa4003734bfecf5ae009cfc62882de37cc4b835e029a0da3e18ddee7e3d28a3f421';

const client = createPublicClient({ chain: polygon, transport: http(RPC_URL) });

async function main() {
	console.log('=== Polygon Mainnet Signature Debug ===\n');

	const { x, y } = parseP256PublicKey(TEST_PUBLIC_KEY);
	const safeAddress = computeSafeAddress(TEST_PUBLIC_KEY) as Address;
	console.log('Safe:', safeAddress);

	// Step 1: 先部署 Safe（通过 eth_call 模拟但使用 state override）
	// 不能用 eth_call 持久化，但可以用 eth_call 配合 state override 来模拟已部署的 Safe

	// 方案: 真正在链上部署 Safe（不用 4337，用普通交易模拟）
	// 但我们没有 EOA 来发交易...

	// 方案2: 用 Pimlico 的 debug 功能
	// Pimlico 支持 pimlico_sendCompressedUserOperation 等高级方法

	// 方案3: 直接模拟 EntryPoint.simulateValidation
	console.log('\n--- EntryPoint.simulateValidation ---');

	const callData = buildCallData(safeAddress, 0n);
	const initCode = buildInitCode(TEST_PUBLIC_KEY);

	// 获取 gas 价格
	const gasPrice = await client.getGasPrice();
	const gas: GasParams = {
		verificationGasLimit: 800000n,
		callGasLimit: 100000n,
		preVerificationGas: 60000n,
		maxFeePerGas: gasPrice * 2n,
		maxPriorityFeePerGas: gasPrice
	};

	// 构建带 dummy sig 的 UserOp
	const dummySig = buildDummySignature();
	const userOp: UserOperation = {
		sender: safeAddress,
		nonce: numberToHex(0n),
		initCode,
		callData,
		accountGasLimits: packAccountGasLimits(gas.verificationGasLimit, gas.callGasLimit),
		preVerificationGas: numberToHex(gas.preVerificationGas),
		gasFees: packGasFees(gas.maxPriorityFeePerGas, gas.maxFeePerGas),
		paymasterAndData: '0x',
		signature: dummySig
	};

	// 用 simulateHandleOp 模拟
	// EntryPoint.simulateHandleOp(PackedUserOperation userOp, address target, bytes targetCallData)
	const simulateData = encodeFunctionData({
		abi: [{
			name: 'simulateHandleOp',
			type: 'function',
			inputs: [
				{
					name: 'op',
					type: 'tuple',
					components: [
						{ name: 'sender', type: 'address' },
						{ name: 'nonce', type: 'uint256' },
						{ name: 'initCode', type: 'bytes' },
						{ name: 'callData', type: 'bytes' },
						{ name: 'accountGasLimits', type: 'bytes32' },
						{ name: 'preVerificationGas', type: 'uint256' },
						{ name: 'gasFees', type: 'bytes32' },
						{ name: 'paymasterAndData', type: 'bytes' },
						{ name: 'signature', type: 'bytes' }
					]
				},
				{ name: 'target', type: 'address' },
				{ name: 'targetCallData', type: 'bytes' }
			],
			outputs: [],
			stateMutability: 'nonpayable'
		}],
		functionName: 'simulateHandleOp',
		args: [
			{
				sender: safeAddress,
				nonce: 0n,
				initCode,
				callData,
				accountGasLimits: userOp.accountGasLimits as `0x${string}`,
				preVerificationGas: gas.preVerificationGas,
				gasFees: userOp.gasFees as `0x${string}`,
				paymasterAndData: '0x' as Hex,
				signature: dummySig
			},
			'0x0000000000000000000000000000000000000000' as Address,
			'0x' as Hex
		]
	});

	try {
		// simulateHandleOp 总是 revert —— revert 数据包含执行结果
		const result = await client.call({
			to: CONTRACTS.entryPoint,
			data: simulateData,
			// 给 Safe 充钱来覆盖 gas
			stateOverride: [
				{
					address: safeAddress,
					balance: 10000000000000000000n // 10 POL
				}
			]
		});
		console.log('simulateHandleOp result:', result.data);
	} catch (err: any) {
		const revertData = err.data || err.cause?.data;
		if (revertData) {
			console.log('Revert data:', revertData);
			// ExecutionResult(uint256 preOpGas, uint256 paid, uint48 validAfter, uint48 validUntil, bool targetSuccess, bytes targetResult)
			// 如果成功，revert 数据包含 ExecutionResult
			// 如果失败，revert 数据包含 FailedOp(uint256 opIndex, string reason)
			const failedOpSig = '0x220266b6'; // FailedOp selector
			if (typeof revertData === 'string' && revertData.startsWith(failedOpSig)) {
				const reasonData = '0x' + revertData.slice(10); // skip selector
				try {
					const decoded = decodeFunctionResult({
						abi: [{
							name: 'FailedOp',
							type: 'function',
							inputs: [],
							outputs: [
								{ name: 'opIndex', type: 'uint256' },
								{ name: 'reason', type: 'string' }
							],
							stateMutability: 'view'
						}],
						functionName: 'FailedOp',
						data: ('0x' + revertData.slice(10)) as Hex
					});
					console.log('FailedOp reason:', decoded);
				} catch {
					// Try decoding as ABI parameters
					const decoded2 = decodeFunctionResult({
						abi: [{
							name: 'x', type: 'function', inputs: [],
							outputs: [{ type: 'uint256' }, { type: 'string' }],
							stateMutability: 'view'
						}],
						functionName: 'x',
						data: ('0x' + '0'.repeat(64) + revertData.slice(10)) as Hex
					});
					console.log('FailedOp decoded:', decoded2);
				}
			} else {
				console.log('Unknown revert format');
			}
		} else {
			console.log('Error:', err.message?.slice(0, 200));
		}
	}

	// Step 2: 尝试用 Pimlico eth_estimateUserOperationGas
	// 看看它给的错误是否更详细
	console.log('\n--- Pimlico estimation with dummy sig ---');
	try {
		const formatted = formatUserOpForRpc(userOp);
		const res = await fetch(BUNDLER_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_estimateUserOperationGas',
				params: [formatted, CONTRACTS.entryPoint]
			})
		});
		const json = await res.json() as any;
		if (json.error) {
			console.log('❌ Error:', json.error.message);
		} else {
			console.log('✅ Estimation passed:', json.result);
		}
	} catch (err: any) {
		console.log('Fetch error:', err.message);
	}

	// Step 3: 现在用一个"假的真实签名"测试 sendUserOperation
	// 构建一个有正确格式但签名值不同的 UserOp
	// 看看 Pimlico 返回的错误是否包含更多信息
	console.log('\n--- Pimlico sendUserOperation with fake real sig ---');

	const safeOpHash = calculateSafeOpHash(safeAddress, callData, 0n, initCode, gas, 137n);
	console.log('safeOpHash:', safeOpHash);

	// 构建一个格式正确但签名值假的 WebAuthn 签名
	const fakeAuthData = '0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000' as Hex;
	const fakeClientDataFields = ',"origin":"http://localhost:5173","crossOrigin":false';
	const fakeR = 12345n;
	const fakeS = 67890n;

	const fakeContractSig = buildContractSignatureWebAuthn(fakeAuthData, fakeClientDataFields, fakeR, fakeS);
	const fakeSig = buildUserOpSignature(0, 0, fakeContractSig);

	const fakeUserOp = { ...userOp, signature: fakeSig };

	try {
		const formatted = formatUserOpForRpc(fakeUserOp);
		const res = await fetch(BUNDLER_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 2,
				method: 'eth_sendUserOperation',
				params: [formatted, CONTRACTS.entryPoint]
			})
		});
		const json = await res.json() as any;
		if (json.error) {
			console.log('Expected error:', json.error.message?.slice(0, 300));
			// 看看错误是 AA24 还是别的
		} else {
			console.log('Unexpected success?!', json.result);
		}
	} catch (err: any) {
		console.log('Fetch error:', err.message);
	}

	console.log('\n=== Done ===');
}

main().catch(console.error);
