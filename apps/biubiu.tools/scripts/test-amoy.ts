/**
 * Amoy 测试网完整流程测试。
 *
 * 1. 验证所有合约存在
 * 2. 部署 Safe（真实交易）
 * 3. 验证 SharedSigner 配置
 * 4. 构建 UserOp + 提交 bundler
 *
 * 运行: cd apps/biubiu.tools && bun scripts/test-amoy.ts
 */
import {
	createPublicClient,
	http,
	encodeFunctionData,
	decodeFunctionResult,
	type Hex,
	type Address
} from 'viem';
import { polygonAmoy } from 'viem/chains';
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
	formatUserOpForRpc,
	packAccountGasLimits,
	packGasFees,
	type GasParams,
	type UserOperation
} from '../src/lib/auth/safe-tx/build-userop.js';
import { numberToHex } from 'viem';

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || 'CbatvD0Nho8l9ibkfDqDD';
const PIMLICO_KEY = process.env.PIMLICO_API_KEY || 'pim_ft3KoztkGnJBEPxoY1sHef';
const RPC_URL = `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const BUNDLER_URL = `https://api.pimlico.io/v2/80002/rpc?apikey=${PIMLICO_KEY}`;

// 测试公钥
const TEST_PUBLIC_KEY =
	'0408dbe337ec34437ace3af6b9204374eeff9f3e9dd07ecc259c53630a5505afa4003734bfecf5ae009cfc62882de37cc4b835e029a0da3e18ddee7e3d28a3f421';

const client = createPublicClient({ chain: polygonAmoy, transport: http(RPC_URL) });

async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
	});
	const json = await res.json() as any;
	if (json.error) throw new Error(`${method}: ${json.error.message}`);
	return json.result as T;
}

async function main() {
	console.log('=== Amoy Testnet Test ===\n');

	const { x, y } = parseP256PublicKey(TEST_PUBLIC_KEY);
	const safeAddress = computeSafeAddress(TEST_PUBLIC_KEY);
	console.log('Safe Address:', safeAddress);
	console.log('Public Key X:', x);
	console.log('Public Key Y:', y);

	// 1. 合约存在性检查
	console.log('\n--- Contract checks ---');
	const contracts = [
		['SafeProxyFactory', CONTRACTS.safeProxyFactory],
		['SafeSingleton', CONTRACTS.safeSingleton],
		['Safe4337Module', CONTRACTS.safe4337Module],
		['SafeModuleSetup', CONTRACTS.safeModuleSetup],
		['SharedSigner', CONTRACTS.safeWebAuthnSharedSigner],
		['MultiSend', CONTRACTS.multiSend],
		['EntryPoint', CONTRACTS.entryPoint]
	] as const;

	for (const [name, addr] of contracts) {
		const code = await client.getCode({ address: addr });
		const exists = code !== undefined && code !== null && code !== '0x' && code.length > 2;
		console.log(`${exists ? '✅' : '❌'} ${name}: ${addr}`);
		if (!exists) {
			console.error(`FATAL: ${name} not deployed on Amoy!`);
			return;
		}
	}

	// 2. 检查 Safe 状态
	const deployed = await client.getCode({ address: safeAddress });
	const isDeployed = deployed !== undefined && deployed !== '0x' && deployed !== null;
	console.log(`\nSafe deployed: ${isDeployed}`);

	// 3. 检查余额
	const balance = await client.getBalance({ address: safeAddress });
	console.log(`Safe balance: ${Number(balance) / 1e18} POL`);

	if (balance === 0n) {
		console.log('\n⚠️  请先给 Safe 充测试 POL:');
		console.log(`   地址: ${safeAddress}`);
		console.log('   Amoy 水龙头: https://faucet.polygon.technology/');
		return;
	}

	// 4. 模拟部署验证
	console.log('\n--- Deployment simulation ---');
	const setupData = encodeSetupData(x, y);
	const saltNonce = calculateSaltNonce(x, y);

	const factoryCalldata = encodeFunctionData({
		abi: [{
			name: 'createProxyWithNonce', type: 'function',
			inputs: [
				{ name: '_singleton', type: 'address' },
				{ name: 'initializer', type: 'bytes' },
				{ name: 'saltNonce', type: 'uint256' }
			],
			outputs: [{ name: 'proxy', type: 'address' }],
			stateMutability: 'nonpayable'
		}],
		functionName: 'createProxyWithNonce',
		args: [CONTRACTS.safeSingleton, setupData, saltNonce]
	});

	try {
		const deployResult = await client.call({
			to: CONTRACTS.safeProxyFactory,
			data: factoryCalldata
		});
		const simAddr = ('0x' + deployResult.data!.slice(26)) as Address;
		console.log('Simulated address:', simAddr);
		console.log('Match:', simAddr.toLowerCase() === safeAddress.toLowerCase() ? '✅' : '❌');
	} catch (err: any) {
		if (isDeployed) {
			console.log('Already deployed (expected simulation failure)');
		} else {
			console.error('Deploy simulation failed:', err.message);
			return;
		}
	}

	// 5. 如果已部署，检查 SharedSigner 配置
	if (isDeployed) {
		console.log('\n--- SharedSigner configuration ---');
		const getConfigData = encodeFunctionData({
			abi: [{
				name: 'getConfiguration', type: 'function',
				inputs: [{ name: 'account', type: 'address' }],
				outputs: [{
					name: 'signer', type: 'tuple',
					components: [
						{ name: 'x', type: 'uint256' },
						{ name: 'y', type: 'uint256' },
						{ name: 'verifiers', type: 'uint176' }
					]
				}],
				stateMutability: 'view'
			}],
			functionName: 'getConfiguration',
			args: [safeAddress]
		});

		const configResult = await client.call({
			to: CONTRACTS.safeWebAuthnSharedSigner,
			data: getConfigData
		});

		const decoded = decodeFunctionResult({
			abi: [{
				name: 'getConfiguration', type: 'function',
				inputs: [{ name: 'account', type: 'address' }],
				outputs: [{
					name: 'signer', type: 'tuple',
					components: [
						{ name: 'x', type: 'uint256' },
						{ name: 'y', type: 'uint256' },
						{ name: 'verifiers', type: 'uint176' }
					]
				}],
				stateMutability: 'view'
			}],
			functionName: 'getConfiguration',
			data: configResult.data!
		}) as any;

		console.log('Config x:', decoded.x?.toString());
		console.log('Config y:', decoded.y?.toString());
		console.log('Config verifiers:', decoded.verifiers?.toString());
		console.log('x match:', decoded.x === x ? '✅' : '❌');
		console.log('y match:', decoded.y === y ? '✅' : '❌');
		console.log('verifiers:', decoded.verifiers === 0x100n ? '✅ 0x100' : `❌ ${decoded.verifiers}`);
	}

	// 6. Gas 估算测试（用 dummy signature）
	console.log('\n--- Bundler gas estimation ---');
	const callData = buildCallData(safeAddress as Address, 0n);
	const initCode: Hex = !isDeployed ? buildInitCode(TEST_PUBLIC_KEY) : '0x';
	const dummySig = buildDummySignature();

	// 获取 gas 价格
	let gasPrices: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
	try {
		const pimlicoGas = await rpcCall<any>(BUNDLER_URL, 'pimlico_getUserOperationGasPrice', []);
		gasPrices = {
			maxFeePerGas: BigInt(pimlicoGas.fast.maxFeePerGas),
			maxPriorityFeePerGas: BigInt(pimlicoGas.fast.maxPriorityFeePerGas)
		};
		console.log('Gas prices:', gasPrices);
	} catch (err: any) {
		console.log('Pimlico gas price failed, using RPC fallback:', err.message);
		const baseFee = await rpcCall<Hex>(RPC_URL, 'eth_gasPrice', []);
		gasPrices = { maxFeePerGas: BigInt(baseFee) * 2n, maxPriorityFeePerGas: BigInt(baseFee) };
	}

	const initialGas: GasParams = {
		verificationGasLimit: isDeployed ? 300000n : 600000n,
		callGasLimit: 100000n,
		preVerificationGas: 60000n,
		...gasPrices
	};

	const dummyUserOp: UserOperation = {
		sender: safeAddress as Address,
		nonce: numberToHex(isDeployed ? await rpcCall<Hex>(RPC_URL, 'eth_call', [
			{ to: CONTRACTS.entryPoint, data: '0x35567e1a' + safeAddress.slice(2).padStart(64, '0') + '0'.repeat(64) },
			'latest'
		]).then(r => BigInt(r)) : 0n),
		initCode,
		callData,
		accountGasLimits: packAccountGasLimits(initialGas.verificationGasLimit, initialGas.callGasLimit),
		preVerificationGas: numberToHex(initialGas.preVerificationGas),
		gasFees: packGasFees(initialGas.maxPriorityFeePerGas, initialGas.maxFeePerGas),
		paymasterAndData: '0x',
		signature: dummySig
	};

	try {
		const estimates = await rpcCall<any>(
			BUNDLER_URL,
			'eth_estimateUserOperationGas',
			[formatUserOpForRpc(dummyUserOp), CONTRACTS.entryPoint]
		);
		console.log('✅ Gas estimation passed:', estimates);
	} catch (err: any) {
		console.error('❌ Gas estimation failed:', err.message);
	}

	console.log('\n=== Done ===');
	console.log('下一步: 在 UI 上用 Amoy 网络测试发送');
}

main().catch(console.error);
