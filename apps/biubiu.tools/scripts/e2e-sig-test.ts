/**
 * 端到端签名测试：本地生成 P256 密钥 → 模拟 WebAuthn → 构建 UserOp → 提交 Pimlico
 *
 * 运行: cd apps/biubiu.tools && bun scripts/e2e-sig-test.ts
 */
import {
	createPublicClient, http, encodeFunctionData, encodeAbiParameters,
	keccak256, concat, pad, numberToHex, toHex, size as hexSize,
	type Hex, type Address
} from 'viem';
import { polygon } from 'viem/chains';
import {
	CONTRACTS, computeSafeAddress, parseP256PublicKey, encodeSetupData, calculateSaltNonce
} from '../src/lib/auth/compute-safe-address.js';
import {
	calculateSafeOpHash, packAccountGasLimits, packGasFees, formatUserOpForRpc
} from '../src/lib/auth/safe-tx/build-userop.js';

const PIMLICO_KEY = process.env.PIMLICO_API_KEY || 'pim_ft3KoztkGnJBEPxoY1sHef';
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || 'CbatvD0Nho8l9ibkfDqDD';
const CHAIN_ID = 137n;

function hex(b: Uint8Array): string {
	return Array.from(b).map(v => v.toString(16).padStart(2, '0')).join('');
}

async function main() {
	console.log('=== E2E Signature Test ===\n');

	// 1. 生成 P256 密钥对
	const keyPair = await crypto.subtle.generateKey(
		{ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
	);
	const pubKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
	const pubX = BigInt('0x' + hex(pubKeyRaw.slice(1, 33)));
	const pubY = BigInt('0x' + hex(pubKeyRaw.slice(33, 65)));
	const publicKeyHex = '04' + hex(pubKeyRaw.slice(1, 33)) + hex(pubKeyRaw.slice(33, 65));

	// 2. 计算 Safe 地址
	const safeAddress = computeSafeAddress(publicKeyHex) as Address;
	console.log('Safe:', safeAddress);

	// 3. 构建 initCode
	const setupData = encodeSetupData(pubX, pubY);
	const saltNonce = calculateSaltNonce(pubX, pubY);
	const factoryData = encodeFunctionData({
		abi: [{
			name: 'createProxyWithNonce', type: 'function',
			inputs: [{ name: 's', type: 'address' }, { name: 'i', type: 'bytes' }, { name: 'n', type: 'uint256' }],
			outputs: [{ type: 'address' }], stateMutability: 'nonpayable'
		}],
		functionName: 'createProxyWithNonce',
		args: [CONTRACTS.safeSingleton, setupData, saltNonce]
	});
	const initCode = concat([CONTRACTS.safeProxyFactory as Hex, factoryData]);

	// 4. 构建 callData (转 0 给自己)
	const callData = encodeFunctionData({
		abi: [{
			name: 'executeUserOp', type: 'function',
			inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' }, { name: 'operation', type: 'uint8' }],
			outputs: [], stateMutability: 'nonpayable'
		}],
		functionName: 'executeUserOp',
		args: [safeAddress, 0n, '0x', 0]
	});

	// 5. Gas
	const gasRes = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'pimlico_getUserOperationGasPrice', params: [] })
	})).json() as any;
	const maxFeePerGas = BigInt(gasRes.result.fast.maxFeePerGas);
	const maxPriorityFeePerGas = BigInt(gasRes.result.fast.maxPriorityFeePerGas);
	const gas = { verificationGasLimit: 800000n, callGasLimit: 100000n, preVerificationGas: 60000n, maxFeePerGas, maxPriorityFeePerGas };

	// 6. SafeOp Hash
	const safeOpHash = calculateSafeOpHash(safeAddress, callData, 0n, initCode, gas, CHAIN_ID);
	console.log('safeOpHash:', safeOpHash);

	// 7. 模拟 WebAuthn 签名
	const hashBytes = new Uint8Array(safeOpHash.slice(2).match(/.{2}/g)!.map(b => parseInt(b, 16)));
	const b64url = btoa(String.fromCharCode(...hashBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

	const authenticatorData = new Uint8Array([
		0x49, 0x96, 0x0d, 0xe5, 0x88, 0x0e, 0x8c, 0x68, 0x74, 0x34, 0x17, 0x0f,
		0x64, 0x76, 0x60, 0x5b, 0x8f, 0xe4, 0xae, 0xb9, 0xa2, 0x86, 0x32, 0xc7,
		0x99, 0x5c, 0xf3, 0xba, 0x83, 0x1d, 0x97, 0x63,
		0x1d, 0x00, 0x00, 0x00, 0x00
	]);

	const clientDataFields = ',"origin":"http://localhost:5173","crossOrigin":false';
	const clientDataJSON = '{"type":"webauthn.get","challenge":"' + b64url + '"' + clientDataFields + '}';

	// WebAuthn 签名的数据: authenticatorData || sha256(clientDataJSON)
	const cdjHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientDataJSON)));
	const signingInput = new Uint8Array([...authenticatorData, ...cdjHash]);

	// ECDSA-SHA256 签名
	const sigRaw = new Uint8Array(await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signingInput
	));
	const sigR = BigInt('0x' + hex(sigRaw.slice(0, 32)));
	const sigS = BigInt('0x' + hex(sigRaw.slice(32, 64)));
	console.log('sigR:', sigR);
	console.log('sigS:', sigS);

	// 8. 验证签名 (链上 P256 预编译)
	const finalHash = new Uint8Array(await crypto.subtle.digest('SHA-256', signingInput));
	const client = createPublicClient({ chain: polygon, transport: http(`https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`) });
	const verifyInput = '0x' + hex(finalHash) + sigR.toString(16).padStart(64, '0') + sigS.toString(16).padStart(64, '0') + hex(pubKeyRaw.slice(1, 33)) + hex(pubKeyRaw.slice(33, 65));
	const p256Result = await client.call({ to: '0x0000000000000000000000000000000000000100', data: verifyInput as any });
	console.log('P256 local verify:', p256Result.data && BigInt(p256Result.data || '0') === 1n ? '✅' : '❌');

	// 9. 构建合约签名
	const authDataHex = ('0x' + hex(authenticatorData)) as Hex;
	const r_pad = pad(CONTRACTS.safeWebAuthnSharedSigner as Hex, { size: 32 });
	const s_pad = pad(numberToHex(65n), { size: 32 });
	const dynamicData = encodeAbiParameters(
		[{ type: 'bytes' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }],
		[authDataHex, clientDataFields, sigR, sigS]
	);
	const dataLength = pad(numberToHex(BigInt(hexSize(dynamicData))), { size: 32 });
	const contractSig = concat([r_pad, s_pad, '0x00' as Hex, dataLength, dynamicData]);
	const signature = concat([pad(numberToHex(0), { size: 6 }), pad(numberToHex(0), { size: 6 }), contractSig]);

	// 10. 提交
	const userOp = {
		sender: safeAddress, nonce: numberToHex(0n), initCode, callData,
		accountGasLimits: packAccountGasLimits(gas.verificationGasLimit, gas.callGasLimit),
		preVerificationGas: numberToHex(gas.preVerificationGas),
		gasFees: packGasFees(gas.maxPriorityFeePerGas, gas.maxFeePerGas),
		paymasterAndData: '0x' as Hex, signature
	};

	console.log('\n--- Submitting to Pimlico ---');
	const formatted = formatUserOpForRpc(userOp);
	const sendRes = await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_sendUserOperation', params: [formatted, CONTRACTS.entryPoint] })
	});
	const sendJson = await sendRes.json() as any;
	if (sendJson.error) {
		console.log('❌', sendJson.error.message);
	} else {
		console.log('✅ UserOp hash:', sendJson.result);
	}
}

main().catch(console.error);
