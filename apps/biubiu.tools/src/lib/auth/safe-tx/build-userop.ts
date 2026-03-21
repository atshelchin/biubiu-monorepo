/**
 * Safe ERC-4337 UserOperation 构建。
 *
 * 用 viem 实现，适配 SafeWebAuthnSharedSigner 签名格式。
 */
import {
	type Address,
	type Hex,
	encodeAbiParameters,
	encodeFunctionData,
	keccak256,
	concat,
	pad,
	toHex,
	numberToHex,
	size as hexSize
} from 'viem';
import {
	CONTRACTS,
	SAFE_OP_TYPEHASH,
	DOMAIN_SEPARATOR_TYPEHASH
} from './constants.js';
import {
	encodeSetupData,
	calculateSaltNonce,
	parseP256PublicKey
} from '../compute-safe-address.js';

// ─── Types ───

export interface UserOperation {
	sender: Address;
	nonce: Hex;
	initCode: Hex;
	callData: Hex;
	accountGasLimits: Hex;
	preVerificationGas: Hex;
	gasFees: Hex;
	paymasterAndData: Hex;
	signature: Hex;
}

export interface GasParams {
	verificationGasLimit: bigint;
	callGasLimit: bigint;
	preVerificationGas: bigint;
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
}

// ─── Gas packing ───

export function packAccountGasLimits(
	verificationGasLimit: bigint,
	callGasLimit: bigint
): Hex {
	const v = pad(numberToHex(verificationGasLimit), { size: 16 });
	const c = pad(numberToHex(callGasLimit), { size: 16 });
	return concat([v, c]);
}

export function packGasFees(
	maxPriorityFeePerGas: bigint,
	maxFeePerGas: bigint
): Hex {
	const p = pad(numberToHex(maxPriorityFeePerGas), { size: 16 });
	const m = pad(numberToHex(maxFeePerGas), { size: 16 });
	return concat([p, m]);
}

// ─── CallData ───

/** Encode executeUserOp(address to, uint256 value, bytes data, uint8 operation) */
export function buildCallData(
	to: Address,
	value: bigint,
	data: Hex = '0x',
	operation: number = 0
): Hex {
	return encodeFunctionData({
		abi: [
			{
				name: 'executeUserOp',
				type: 'function',
				inputs: [
					{ name: 'to', type: 'address' },
					{ name: 'value', type: 'uint256' },
					{ name: 'data', type: 'bytes' },
					{ name: 'operation', type: 'uint8' }
				],
				outputs: [],
				stateMutability: 'nonpayable'
			}
		],
		functionName: 'executeUserOp',
		args: [to, value, data, operation]
	});
}

// ─── InitCode ───

/** 构建首次部署的 initCode = factory + createProxyWithNonce calldata */
export function buildInitCode(publicKeyHex: string): Hex {
	const { x, y } = parseP256PublicKey(publicKeyHex);
	const saltNonce = calculateSaltNonce(x, y);
	const setupData = encodeSetupData(x, y);

	const factoryData = encodeFunctionData({
		abi: [
			{
				name: 'createProxyWithNonce',
				type: 'function',
				inputs: [
					{ name: '_singleton', type: 'address' },
					{ name: 'initializer', type: 'bytes' },
					{ name: 'saltNonce', type: 'uint256' }
				],
				outputs: [{ name: 'proxy', type: 'address' }],
				stateMutability: 'nonpayable'
			}
		],
		functionName: 'createProxyWithNonce',
		args: [CONTRACTS.safeSingleton, setupData, saltNonce]
	});

	return concat([CONTRACTS.safeProxyFactory, factoryData]);
}

// ─── SafeOp Hash (EIP-712) ───

function calculateDomainSeparator(chainId: bigint): Hex {
	return keccak256(
		encodeAbiParameters(
			[{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
			[DOMAIN_SEPARATOR_TYPEHASH, chainId, CONTRACTS.safe4337Module]
		)
	);
}

export function calculateSafeOpHash(
	safeAddress: Address,
	callData: Hex,
	nonce: bigint,
	initCode: Hex,
	gas: GasParams,
	chainId: bigint,
	validAfter: number = 0,
	validUntil: number = 0,
	paymasterAndData: Hex = '0x'
): Hex {
	const safeOpStruct = encodeAbiParameters(
		[
			{ type: 'bytes32' },
			{ type: 'address' },
			{ type: 'uint256' },
			{ type: 'bytes32' },
			{ type: 'bytes32' },
			{ type: 'uint128' },
			{ type: 'uint128' },
			{ type: 'uint256' },
			{ type: 'uint128' },
			{ type: 'uint128' },
			{ type: 'bytes32' },
			{ type: 'uint48' },
			{ type: 'uint48' },
			{ type: 'address' }
		],
		[
			SAFE_OP_TYPEHASH,
			safeAddress,
			nonce,
			keccak256(initCode),
			keccak256(callData),
			gas.verificationGasLimit,
			gas.callGasLimit,
			gas.preVerificationGas,
			gas.maxPriorityFeePerGas,
			gas.maxFeePerGas,
			keccak256(paymasterAndData),
			validAfter,
			validUntil,
			CONTRACTS.entryPoint
		]
	);

	const structHash = keccak256(safeOpStruct);
	const domainSeparator = calculateDomainSeparator(chainId);

	return keccak256(concat(['0x1901', domainSeparator, structHash]));
}

// ─── Signature ───

/**
 * 构建 SafeWebAuthnSharedSigner 的合约签名。
 *
 * SharedSigner 从 Safe storage 读取 (x, y)，签名里不含公钥。
 * 动态数据: abi.encode(authenticatorData, clientDataFields, r, s)
 * 外层: Safe 合约签名格式 (r=signerAddr, s=offset, v=0x00)
 */
export function buildContractSignatureWebAuthn(
	authenticatorData: Hex,
	clientDataFields: string,
	sigR: bigint,
	sigS: bigint
): Hex {
	// r (32 bytes) = signer contract address, left-padded
	const r = pad(CONTRACTS.safeWebAuthnSharedSigner as Hex, { size: 32 });
	// s (32 bytes) = offset to dynamic data = 65 (after r+s+v)
	const s = pad(numberToHex(65n), { size: 32 });
	// v = 0x00 (contract signature type)
	const v = '0x00' as Hex;

	// Dynamic signature data: WebAuthn assertion (不含公钥，从 storage 读取)
	const dynamicData = encodeAbiParameters(
		[
			{ type: 'bytes' },
			{ type: 'string' },
			{ type: 'uint256' },
			{ type: 'uint256' }
		],
		[authenticatorData, clientDataFields, sigR, sigS]
	);

	const dataLength = pad(numberToHex(BigInt(hexSize(dynamicData))), { size: 32 });

	return concat([r, s, v, dataLength, dynamicData]);
}

/** 构建完整签名: validAfter + validUntil + contractSignature */
export function buildUserOpSignature(
	validAfter: number,
	validUntil: number,
	contractSig: Hex
): Hex {
	const va = pad(numberToHex(validAfter), { size: 6 });
	const vu = pad(numberToHex(validUntil), { size: 6 });
	return concat([va, vu, contractSig]);
}

/**
 * 构建 dummy signature（gas 估算用）。
 * 格式正确但签名值假，bundler 不验签只看长度。
 */
export function buildDummySignature(): Hex {
	const dummyAuthData = pad('0x01', { size: 37, dir: 'right' });
	const dummyClientDataFields = '"origin":"https://biubiu.tools","crossOrigin":false';

	const contractSig = buildContractSignatureWebAuthn(
		dummyAuthData,
		dummyClientDataFields,
		1n,
		1n
	);

	return buildUserOpSignature(0, 0, contractSig);
}

// ─── Format for RPC ───

/** v0.7 格式：拆分 packed 字段 */
export function formatUserOpForRpc(
	userOp: UserOperation
): Record<string, string | undefined> {
	const agl = userOp.accountGasLimits;
	const verificationGasLimit = ('0x' + agl.slice(2, 34)) as string;
	const callGasLimit = ('0x' + agl.slice(34)) as string;

	const gf = userOp.gasFees;
	const maxPriorityFeePerGas = ('0x' + gf.slice(2, 34)) as string;
	const maxFeePerGas = ('0x' + gf.slice(34)) as string;

	let factory: string | undefined;
	let factoryData: string | undefined;
	if (userOp.initCode && userOp.initCode !== '0x' && userOp.initCode.length > 42) {
		factory = '0x' + userOp.initCode.slice(2, 42);
		factoryData = '0x' + userOp.initCode.slice(42);
	}

	return {
		sender: userOp.sender,
		nonce: userOp.nonce,
		factory,
		factoryData,
		callData: userOp.callData,
		callGasLimit,
		verificationGasLimit,
		preVerificationGas: userOp.preVerificationGas,
		maxFeePerGas,
		maxPriorityFeePerGas,
		signature: userOp.signature
	};
}
