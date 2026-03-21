/**
 * 将测试 Safe 的全部余额转到指定地址。
 */
import {
	createPublicClient, http, encodeFunctionData, encodeAbiParameters,
	keccak256, concat, pad, numberToHex, toHex, size as hexSize, formatEther, parseEther,
	type Hex, type Address
} from 'viem';
import { polygon } from 'viem/chains';
import { CONTRACTS, computeSafeAddress, encodeSetupData, calculateSaltNonce } from '../src/lib/auth/compute-safe-address.js';
import { calculateSafeOpHash, buildCallData, buildInitCode, buildDummySignature, buildContractSignatureWebAuthn, buildUserOpSignature, packAccountGasLimits, packGasFees, formatUserOpForRpc } from '../src/lib/auth/safe-tx/build-userop.js';

const PIMLICO_KEY = process.env.PIMLICO_API_KEY || 'pim_ft3KoztkGnJBEPxoY1sHef';
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || 'CbatvD0Nho8l9ibkfDqDD';
const RECIPIENT = '0xc11cf330c85d30BcCf1fb0093BD46aB90A4db8Ba' as Address;

const FIXED_JWK = {"crv":"P-256","d":"ITjGin-POzxYPg9N7no8KXLIEMszKNeOp8TBeMWrOkk","ext":true,"key_ops":["sign"],"kty":"EC","x":"j3-ocdyvae87azvc6rL5Ls8u8jDVQexEHn9oQJ4MHzA","y":"fRCfk7jQkPsZDa5bG8knYtw1xb9R9cWK_A_acvwgoYs"};

function hex(b: Uint8Array): string { return Array.from(b).map(v => v.toString(16).padStart(2, '0')).join(''); }

async function main() {
	const privateKey = await crypto.subtle.importKey('jwk', FIXED_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
	const pubJwk = { crv: FIXED_JWK.crv, ext: true, key_ops: ['verify'] as string[], kty: FIXED_JWK.kty, x: FIXED_JWK.x, y: FIXED_JWK.y };
	const publicKey = await crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
	const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
	const publicKeyHex = '04' + hex(pubRaw.slice(1, 33)) + hex(pubRaw.slice(33, 65));
	const safeAddress = computeSafeAddress(publicKeyHex) as Address;

	const client = createPublicClient({ chain: polygon, transport: http(`https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`) });
	const balance = await client.getBalance({ address: safeAddress });
	console.log('Safe:', safeAddress);
	console.log('Balance:', formatEther(balance), 'POL');
	console.log('Recipient:', RECIPIENT);

	// Safe 已部署（上次交易部署了），nonce=1
	const nonce = 2n;

	// Gas
	const gasRes = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'pimlico_getUserOperationGasPrice', params: [] })
	})).json() as any;
	const maxFeePerGas = BigInt(gasRes.result.fast.maxFeePerGas);
	const maxPriorityFeePerGas = BigInt(gasRes.result.fast.maxPriorityFeePerGas);

	// 估算 gas 先
	const estimateGas = { verificationGasLimit: 300000n, callGasLimit: 100000n, preVerificationGas: 60000n, maxFeePerGas, maxPriorityFeePerGas };
	// 预留 gas 费用（估算）
	const gasCost = (estimateGas.verificationGasLimit + estimateGas.callGasLimit) * maxFeePerGas + estimateGas.preVerificationGas * maxFeePerGas;
	// 尽量多转，只留最小 gas 费
	const minGasCost = 100000n * maxFeePerGas;
	const transferAmount = balance > minGasCost ? balance - minGasCost : 0n;
	console.log('Transfer:', formatEther(transferAmount), 'POL');

	const callData = buildCallData(RECIPIENT, transferAmount);

	// Estimate
	const dummySig = buildDummySignature();
	const dummyOp = {
		sender: safeAddress, nonce: numberToHex(nonce), initCode: '0x' as Hex, callData,
		accountGasLimits: packAccountGasLimits(estimateGas.verificationGasLimit, estimateGas.callGasLimit),
		preVerificationGas: numberToHex(estimateGas.preVerificationGas),
		gasFees: packGasFees(maxPriorityFeePerGas, maxFeePerGas),
		paymasterAndData: '0x' as Hex, signature: dummySig
	};

	const estRes = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_estimateUserOperationGas', params: [formatUserOpForRpc(dummyOp), CONTRACTS.entryPoint] })
	})).json() as any;

	if (estRes.error) { console.log('Estimate failed:', estRes.error.message); return; }

	const gas = {
		verificationGasLimit: (BigInt(estRes.result.verificationGasLimit) * 13n) / 10n,
		callGasLimit: (BigInt(estRes.result.callGasLimit) * 13n) / 10n,
		preVerificationGas: BigInt(estRes.result.preVerificationGas) + 5000n,
		maxFeePerGas, maxPriorityFeePerGas
	};

	const safeOpHash = calculateSafeOpHash(safeAddress, callData, nonce, '0x' as Hex, gas, 137n);

	// Sign
	const hashBytes = new Uint8Array(safeOpHash.slice(2).match(/.{2}/g)!.map(b => parseInt(b, 16)));
	const b64url = btoa(String.fromCharCode(...hashBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	const authData = new Uint8Array([0x49,0x96,0x0d,0xe5,0x88,0x0e,0x8c,0x68,0x74,0x34,0x17,0x0f,0x64,0x76,0x60,0x5b,0x8f,0xe4,0xae,0xb9,0xa2,0x86,0x32,0xc7,0x99,0x5c,0xf3,0xba,0x83,0x1d,0x97,0x63,0x1d,0x00,0x00,0x00,0x00]);
	const cdFields = '"origin":"http://localhost:5173","crossOrigin":false';
	const cdJSON = '{"type":"webauthn.get","challenge":"' + b64url + '",' + cdFields + '}';
	const cdjHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cdJSON)));
	const sigInput = new Uint8Array([...authData, ...cdjHash]);
	const sigRaw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, sigInput));
	const sigR = BigInt('0x' + hex(sigRaw.slice(0, 32)));
	const sigS = BigInt('0x' + hex(sigRaw.slice(32, 64)));

	const authHex = ('0x' + hex(authData)) as Hex;
	const contractSig = buildContractSignatureWebAuthn(authHex, cdFields, sigR, sigS);
	const signature = buildUserOpSignature(0, 0, contractSig);

	const finalOp = {
		sender: safeAddress, nonce: numberToHex(nonce), initCode: '0x' as Hex, callData,
		accountGasLimits: packAccountGasLimits(gas.verificationGasLimit, gas.callGasLimit),
		preVerificationGas: numberToHex(gas.preVerificationGas),
		gasFees: packGasFees(gas.maxPriorityFeePerGas, gas.maxFeePerGas),
		paymasterAndData: '0x' as Hex, signature
	};

	console.log('\nSubmitting...');
	const sendRes = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_sendUserOperation', params: [formatUserOpForRpc(finalOp), CONTRACTS.entryPoint] })
	})).json() as any;

	if (sendRes.error) { console.log('❌', sendRes.error.message); return; }
	console.log('✅ UserOp:', sendRes.result);

	for (let i = 0; i < 40; i++) {
		await new Promise(r => setTimeout(r, 3000));
		const receipt = await (await fetch(`https://api.pimlico.io/v2/137/rpc?apikey=${PIMLICO_KEY}`, {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'eth_getUserOperationReceipt', params: [sendRes.result] })
		})).json() as any;
		if (receipt.result) {
			console.log('🎉 TX:', receipt.result.receipt.transactionHash);
			console.log('https://polygonscan.com/tx/' + receipt.result.receipt.transactionHash);
			const newBal = await client.getBalance({ address: safeAddress });
			console.log('Remaining:', formatEther(newBal), 'POL');
			return;
		}
		process.stdout.write('.');
	}
}

main().catch(console.error);
