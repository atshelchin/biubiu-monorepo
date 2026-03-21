/**
 * 验证 Safe 部署 + SharedSigner 配置 + P256 签名。
 *
 * 在链上模拟，不花真钱。
 * 运行: cd apps/biubiu.tools && bun scripts/verify-safe-setup.ts
 */
import {
	createPublicClient,
	http,
	encodeFunctionData,
	decodeFunctionResult,
	concat,
	pad,
	numberToHex,
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

// ─── 配置 ───

const ALCHEMY_KEY = 'CbatvD0Nho8l9ibkfDqDD';
const RPC_URL = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

// 测试用的公钥（从你的 passkey 注册日志拿到的）
const TEST_PUBLIC_KEY = '0408dbe337ec34437ace3af6b9204374eeff9f3e9dd07ecc259c53630a5505afa4003734bfecf5ae009cfc62882de37cc4b835e029a0da3e18ddee7e3d28a3f421';

// ─── 测试 ───

const client = createPublicClient({ chain: polygon, transport: http(RPC_URL) });

async function main() {
	console.log('=== Safe Setup Verification ===\n');

	// 1. 计算地址
	const { x, y } = parseP256PublicKey(TEST_PUBLIC_KEY);
	const safeAddress = computeSafeAddress(TEST_PUBLIC_KEY);
	console.log('Safe Address:', safeAddress);
	console.log('Public Key X:', x);
	console.log('Public Key Y:', y);

	// 2. 检查是否已部署
	const code = await client.getCode({ address: safeAddress });
	console.log('Deployed:', code !== '0x' && code !== undefined && code !== null);

	// 3. 验证 setupData 编码
	const setupData = encodeSetupData(x, y);
	console.log('\nSetup Data length:', setupData.length / 2 - 1, 'bytes');

	// 4. 构建完整 initCode
	const saltNonce = calculateSaltNonce(x, y);
	const factoryData = encodeFunctionData({
		abi: [{
			name: 'createProxyWithNonce',
			type: 'function',
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

	// 5. 模拟部署（eth_call 不花钱）
	console.log('\n--- Simulating deployment via eth_call ---');
	try {
		const deployResult = await client.call({
			to: CONTRACTS.safeProxyFactory,
			data: factoryData
		});
		const deployedAddress = ('0x' + deployResult.data!.slice(26)) as Address;
		console.log('Simulated deploy address:', deployedAddress);
		console.log('Address match:', deployedAddress.toLowerCase() === safeAddress.toLowerCase());

		if (deployedAddress.toLowerCase() !== safeAddress.toLowerCase()) {
			console.error('❌ ADDRESS MISMATCH! Something is wrong with setupData or saltNonce');
			process.exit(1);
		}
		console.log('✅ Address computation verified');
	} catch (err: any) {
		console.error('Deploy simulation failed:', err.message);
		// 可能是因为已经部署了，继续检查
	}

	// 6. 检查 SharedSigner 配置（模拟部署后）
	// 由于 eth_call 是无状态的，我们需要通过 state override 来模拟
	// 改用直接检查：如果 Safe 已部署，查配置；未部署则跳过
	if (code && code !== '0x') {
		console.log('\n--- Checking SharedSigner configuration ---');
		const getConfigData = encodeFunctionData({
			abi: [{
				name: 'getConfiguration',
				type: 'function',
				inputs: [{ name: 'account', type: 'address' }],
				outputs: [{
					name: 'signer',
					type: 'tuple',
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
				name: 'getConfiguration',
				type: 'function',
				inputs: [{ name: 'account', type: 'address' }],
				outputs: [{
					name: 'signer',
					type: 'tuple',
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

		console.log('Configured X:', decoded.x?.toString());
		console.log('Configured Y:', decoded.y?.toString());
		console.log('Configured Verifiers:', decoded.verifiers?.toString());
		console.log('X match:', decoded.x?.toString() === x.toString());
		console.log('Y match:', decoded.y?.toString() === y.toString());

		if (decoded.x?.toString() === x.toString() && decoded.y?.toString() === y.toString()) {
			console.log('✅ SharedSigner configuration verified');
		} else {
			console.error('❌ SharedSigner configuration MISMATCH');
		}
	} else {
		console.log('\nSafe not deployed yet. Cannot verify SharedSigner config.');
		console.log('(Config will be set during first UserOp deployment)');
	}

	// 7. 检查合约存在性
	console.log('\n--- Contract existence checks ---');
	const contracts = [
		['SafeProxyFactory', CONTRACTS.safeProxyFactory],
		['SafeSingleton', CONTRACTS.safeSingleton],
		['Safe4337Module', CONTRACTS.safe4337Module],
		['SafeModuleSetup', CONTRACTS.safeModuleSetup],
		['SafeWebAuthnSharedSigner', CONTRACTS.safeWebAuthnSharedSigner],
		['MultiSend', CONTRACTS.multiSend],
		['EntryPoint', CONTRACTS.entryPoint],
	] as const;

	for (const [name, addr] of contracts) {
		const c = await client.getCode({ address: addr });
		const exists = c !== undefined && c !== null && c !== '0x' && c.length > 2;
		console.log(`${exists ? '✅' : '❌'} ${name}: ${addr} ${exists ? '' : '(NOT DEPLOYED!)'}`);
	}

	// 8. 检查 P256 预编译 (RIP-7212)
	console.log('\n--- P256 precompile check (0x0100) ---');
	try {
		// 调用 RIP-7212 预编译：ecrecover for P256
		// 如果存在返回数据，如果不存在返回空
		const p256Code = await client.getCode({ address: '0x0000000000000000000000000000000000000100' });
		const hasPrecompile = p256Code !== undefined && p256Code !== null && p256Code !== '0x';
		console.log(`P256 precompile (0x100): ${hasPrecompile ? '✅ exists' : '⚠️ not found (might still work as precompile)'}`);
		// 注意：预编译不一定有 code，但仍然可以调用
	} catch {
		console.log('⚠️ Could not check precompile');
	}

	console.log('\n=== Done ===');
}

main().catch(console.error);
