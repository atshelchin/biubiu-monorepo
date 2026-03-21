/**
 * 固定密钥 E2E 测试 — 给 Safe 充值后运行此脚本提交真实交易。
 *
 * 运行: cd apps/biubiu.tools && bun scripts/e2e-funded-test.ts
 */
import {
	createPublicClient, http, encodeFunctionData, encodeAbiParameters,
	keccak256, concat, pad, numberToHex, toHex, size as hexSize, formatEther,
	type Hex, type Address
} from 'viem';
import { polygon } from 'viem/chains';
import {
	CONTRACTS, computeSafeAddress, encodeSetupData, calculateSaltNonce
} from '../src/lib/auth/compute-safe-address.js';
import {
	calculateSafeOpHash, buildCallData, buildInitCode, buildDummySignature,
	packAccountGasLimits, packGasFees, formatUserOpForRpc
} from '../src/lib/auth/safe-tx/build-userop.js';

const PIMLICO_KEY = process.env.PIMLICO_API_KEY || 'pim_ft3KoztkGnJBEPxoY1sHef';
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || 'CbatvD0Nho8l9ibkfDqDD';

function hex(b: Uint8Array): string {
	return Array.from(b).map(v => v.toString(16).padStart(2, '0')).join('');
}

// 固定密钥 JWK
const FIXED_JWK = {"crv":"P-256","d":"ITjGin-POzxYPg9N7no8KXLIEMszKNeOp8TBeMWrOkk","ext":true,"key_ops":["sign"],"kty":"EC","x":"j3-ocdyvae87azvc6rL5Ls8u8jDVQexEHn9oQJ4MHzA","y":"fRCfk7jQkPsZDa5bG8knYtw1xb9R9cWK_A_acvwgoYs"};

async function main() {
	console.log('=== Funded E2E Test ===\n');

	// 1. 导入固定密钥
	const privateKey = await crypto.subtle.importKey('jwk', FIXED_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
	const pubJwk = { crv: FIXED_JWK.crv, ext: true, key_ops: ['verify'] as string[], kty: FIXED_JWK.kty, x: FIXED_JWK.x, y: FIXED_JWK.y };
	const publicKey = await crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
	const pubKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
	const pubX = BigInt('0x' + hex(pubKeyRaw.slice(1, 33)));
	const pubY = BigInt('0x' + hex(pubKeyRaw.slice(33, 65)));
	const publicKeyHex = '04' + hex(pubKeyRaw.slice(1, 33)) + hex(pubKeyRaw.slice(33, 65));

	const safeAddress = computeSafeAddress(publicKeyHex) as Address;
	console.log('Safe address:', safeAddress);
	console.log('Public key:', publicKeyHex.slice(0, 20) + '...');

	// 2. 检查余额
	const client = createPublicClient({ chain: polygon, transport: http(`https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`) });
	const balance = await client.getBalance({ address: safeAddress });
	console.log('Balance:', formatEther(balance), 'POL');

	if (balance === 0n) {
		console.log('\n⚠️  请先充值到:', safeAddress);
		return;
	}

	// 3. 构建 UserOp — 转 0 给自己（测试）
	const callData = buildCallData(safeAddress, 0n);
	const initCode = buildInitCode(publicKeyHex);

	// Gas estimation
	const dummySig = buildDummySignature();
	const gasRes = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'pimlico_getUserOperationGasPrice', params: [] })
	})).json() as any;

	const maxFeePerGas = BigInt(gasRes.result.fast.maxFeePerGas);
	const maxPriorityFeePerGas = BigInt(gasRes.result.fast.maxPriorityFeePerGas);

	const initialGas = { verificationGasLimit: 800000n, callGasLimit: 100000n, preVerificationGas: 60000n, maxFeePerGas, maxPriorityFeePerGas };

	// Estimate gas
	const dummyUserOp = {
		sender: safeAddress, nonce: numberToHex(0n), initCode, callData,
		accountGasLimits: packAccountGasLimits(initialGas.verificationGasLimit, initialGas.callGasLimit),
		preVerificationGas: numberToHex(initialGas.preVerificationGas),
		gasFees: packGasFees(initialGas.maxPriorityFeePerGas, initialGas.maxFeePerGas),
		paymasterAndData: '0x' as Hex, signature: dummySig
	};

	console.log('\nEstimating gas...');
	const estRes = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_estimateUserOperationGas', params: [formatUserOpForRpc(dummyUserOp), CONTRACTS.entryPoint] })
	})).json() as any;

	if (estRes.error) {
		console.log('Gas estimation failed:', estRes.error.message);
		return;
	}

	const refinedGas = {
		verificationGasLimit: (BigInt(estRes.result.verificationGasLimit) * 13n) / 10n,
		callGasLimit: (BigInt(estRes.result.callGasLimit) * 13n) / 10n,
		preVerificationGas: BigInt(estRes.result.preVerificationGas) + 5000n,
		maxFeePerGas, maxPriorityFeePerGas
	};
	console.log('Gas estimated:', refinedGas);

	// 4. 计算 SafeOp Hash
	const safeOpHash = calculateSafeOpHash(safeAddress, callData, 0n, initCode, refinedGas, 137n);
	console.log('safeOpHash:', safeOpHash);

	// 5. 模拟 WebAuthn 签名
	const hashBytes = new Uint8Array(safeOpHash.slice(2).match(/.{2}/g)!.map(b => parseInt(b, 16)));
	const b64url = btoa(String.fromCharCode(...hashBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

	const authenticatorData = new Uint8Array([
		0x49, 0x96, 0x0d, 0xe5, 0x88, 0x0e, 0x8c, 0x68, 0x74, 0x34, 0x17, 0x0f,
		0x64, 0x76, 0x60, 0x5b, 0x8f, 0xe4, 0xae, 0xb9, 0xa2, 0x86, 0x32, 0xc7,
		0x99, 0x5c, 0xf3, 0xba, 0x83, 0x1d, 0x97, 0x63,
		0x1d, 0x00, 0x00, 0x00, 0x00
	]);

	const clientDataFields = '"origin":"http://localhost:5173","crossOrigin":false';
	const clientDataJSON = '{"type":"webauthn.get","challenge":"' + b64url + '",' + clientDataFields + '}';

	const cdjHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientDataJSON)));
	const signingInput = new Uint8Array([...authenticatorData, ...cdjHash]);

	const sigRaw = new Uint8Array(await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' }, privateKey, signingInput
	));
	const sigR = BigInt('0x' + hex(sigRaw.slice(0, 32)));
	const sigS = BigInt('0x' + hex(sigRaw.slice(32, 64)));
	console.log('Signed! r:', sigR.toString().slice(0, 20) + '...');

	// 6. 构建签名
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

	// 7. 提交
	const finalUserOp = {
		sender: safeAddress, nonce: numberToHex(0n), initCode, callData,
		accountGasLimits: packAccountGasLimits(refinedGas.verificationGasLimit, refinedGas.callGasLimit),
		preVerificationGas: numberToHex(refinedGas.preVerificationGas),
		gasFees: packGasFees(refinedGas.maxPriorityFeePerGas, refinedGas.maxFeePerGas),
		paymasterAndData: '0x' as Hex, signature
	};

	console.log('\nSubmitting...');
	const sendRes = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_sendUserOperation', params: [formatUserOpForRpc(finalUserOp), CONTRACTS.entryPoint] })
	})).json() as any;

	if (sendRes.error) {
		console.log('❌', sendRes.error.message);
	} else {
		console.log('✅ UserOp hash:', sendRes.result);

		// 等待确认
		console.log('Waiting for confirmation...');
		for (let i = 0; i < 40; i++) {
			await new Promise(r => setTimeout(r, 3000));
			const receipt = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'eth_getUserOperationReceipt', params: [sendRes.result] })
			})).json() as any;

			if (receipt.result) {
				console.log('\n🎉 TX:', receipt.result.receipt.transactionHash);
				console.log('Success:', receipt.result.success);
				console.log('https://polygonscan.com/tx/' + receipt.result.receipt.transactionHash);
				return;
			}
			process.stdout.write('.');
		}
		console.log('\nTimeout');
	}
}

main().catch(console.error);
