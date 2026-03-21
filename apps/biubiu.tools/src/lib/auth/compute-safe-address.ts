/**
 * 计算 passkey 关联的 Safe 钱包地址。
 *
 * 基于 Safe 1.4.1 + ERC-4337 + SafeWebAuthnSharedSigner。
 * 地址由 P-256 公钥唯一确定（CREATE2 确定性部署）。
 *
 * 参考: computeSafeAddress.ts (bun-app/old)
 * 区别: 用 SafeWebAuthnSharedSigner (0x94a4...) 替代 SafeP256Signer
 */
import {
	type Address,
	type Hex,
	encodeAbiParameters,
	encodeFunctionData,
	keccak256,
	concat,
	slice,
	getAddress
} from 'viem';

// ============ Contract Addresses (Base Mainnet) ============

export const CONTRACTS = {
	// Safe 1.4.1
	safeProxyFactory: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67' as const,
	safeSingleton: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762' as const, // SafeL2
	compatibilityFallbackHandler: '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99' as const,

	// ERC-4337
	entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const,
	safe4337Module: '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226' as const,
	safeModuleSetup: '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47' as const,

	// SafeWebAuthnSharedSigner — 公钥存在 Safe storage (via delegatecall configure)
	safeWebAuthnSharedSigner: '0x94a4F6affBd8975951142c3999aEAB7ecee555c2' as const,

	// MultiSend 1.4.1 (same address on all chains)
	multiSend: '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526' as const
} as const;

// Safe Proxy creation code
const PROXY_CREATION_CODE =
	'0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564' as const;

// ============ Core Functions ============

/**
 * 从 hex 公钥（04 || x || y）提取 x, y 坐标为 bigint
 */
export function parseP256PublicKey(publicKeyHex: string): { x: bigint; y: bigint } {
	// 去掉 0x 前缀和 04 前缀
	const raw = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
	const withoutPrefix = raw.startsWith('04') ? raw.slice(2) : raw;

	if (withoutPrefix.length !== 128) {
		throw new Error(`Invalid P-256 public key length: expected 128 hex chars, got ${withoutPrefix.length}`);
	}

	const x = BigInt('0x' + withoutPrefix.slice(0, 64));
	const y = BigInt('0x' + withoutPrefix.slice(64));
	return { x, y };
}

/**
 * 编码 MultiSend 中的单个交易。
 * 格式: operation (1 byte) + to (20 bytes) + value (32 bytes) + dataLength (32 bytes) + data
 */
function encodeMultiSendTx(to: Address, data: Hex, operation: number = 0): Hex {
	const opByte = operation.toString(16).padStart(2, '0');
	const toBytes = to.slice(2).toLowerCase();
	const valueBytes = '0'.repeat(64); // value = 0
	const dataBytes = data === '0x' ? '' : data.slice(2);
	const dataLength = (dataBytes.length / 2).toString(16).padStart(64, '0');
	return `0x${opByte}${toBytes}${valueBytes}${dataLength}${dataBytes}` as Hex;
}

/**
 * Encode Safe.setup() calldata
 *
 * 通过 MultiSend delegatecall 批量执行：
 * 1. SafeModuleSetup.enableModules([safe4337Module])
 * 2. SafeWebAuthnSharedSigner.configure({x, y, verifiers})
 */
export function encodeSetupData(x: bigint, y: bigint): Hex {
	// 1. enableModules([safe4337Module])
	const enableModulesData = encodeFunctionData({
		abi: [{
			name: 'enableModules',
			type: 'function',
			inputs: [{ name: 'modules', type: 'address[]' }],
			outputs: [],
			stateMutability: 'nonpayable'
		}],
		functionName: 'enableModules',
		args: [[CONTRACTS.safe4337Module]]
	});

	// 2. configure({x, y, verifiers: 0}) — verifiers=0 使用 RIP-7212 P256 预编译
	const configureData = encodeFunctionData({
		abi: [{
			name: 'configure',
			type: 'function',
			inputs: [{
				name: 'signer',
				type: 'tuple',
				components: [
					{ name: 'x', type: 'uint256' },
					{ name: 'y', type: 'uint256' },
					{ name: 'verifiers', type: 'uint176' }
				]
			}],
			outputs: [],
			stateMutability: 'nonpayable'
		}],
		functionName: 'configure',
		args: [{ x, y, verifiers: 0x100n }] // RIP-7212 P256 预编译
	});

	// 用 MultiSend 批量 delegatecall
	const tx1 = encodeMultiSendTx(CONTRACTS.safeModuleSetup, enableModulesData, 1); // delegatecall
	const tx2 = encodeMultiSendTx(CONTRACTS.safeWebAuthnSharedSigner, configureData, 1); // delegatecall
	const packed = concat([tx1, tx2]);

	const multiSendData = encodeFunctionData({
		abi: [{
			name: 'multiSend',
			type: 'function',
			inputs: [{ name: 'transactions', type: 'bytes' }],
			outputs: [],
			stateMutability: 'payable'
		}],
		functionName: 'multiSend',
		args: [packed]
	});

	// Safe.setup: to=MultiSend, data=multiSend(packed), operation=delegatecall
	const setupData = encodeFunctionData({
		abi: [{
			name: 'setup',
			type: 'function',
			inputs: [
				{ name: '_owners', type: 'address[]' },
				{ name: '_threshold', type: 'uint256' },
				{ name: 'to', type: 'address' },
				{ name: 'data', type: 'bytes' },
				{ name: 'fallbackHandler', type: 'address' },
				{ name: 'paymentToken', type: 'address' },
				{ name: 'payment', type: 'uint256' },
				{ name: 'paymentReceiver', type: 'address' }
			],
			outputs: [],
			stateMutability: 'nonpayable'
		}],
		functionName: 'setup',
		args: [
			[CONTRACTS.safeWebAuthnSharedSigner],
			1n,
			CONTRACTS.multiSend,            // to: MultiSend
			multiSendData,                   // data: multiSend(packed)
			CONTRACTS.safe4337Module,         // fallbackHandler
			'0x0000000000000000000000000000000000000000',
			0n,
			'0x0000000000000000000000000000000000000000'
		]
	});

	return setupData;
}

/**
 * 从 P256 公钥计算 saltNonce（确保不同公钥产生不同 Safe 地址）
 */
export function calculateSaltNonce(x: bigint, y: bigint): bigint {
	const hash = keccak256(
		encodeAbiParameters(
			[{ type: 'uint256' }, { type: 'uint256' }],
			[x, y]
		)
	);
	return BigInt(hash);
}

/**
 * 计算 Safe Proxy CREATE2 地址
 */
function calculateProxyAddress(setupData: Hex, nonce: bigint): Address {
	// deploymentCode = proxyCreationCode + abi.encode(safeSingleton)
	const singletonEncoded = encodeAbiParameters(
		[{ type: 'address' }],
		[CONTRACTS.safeSingleton]
	);
	const deploymentCode = concat([PROXY_CREATION_CODE, singletonEncoded]);
	const initCodeHash = keccak256(deploymentCode);

	// salt = keccak256(keccak256(initializer), nonce)
	const initializerHash = keccak256(setupData);
	const saltData = encodeAbiParameters(
		[{ type: 'bytes32' }, { type: 'uint256' }],
		[initializerHash, nonce]
	);
	const salt = keccak256(saltData);

	// CREATE2: keccak256(0xff ++ factory ++ salt ++ initCodeHash)
	const data = concat(['0xff', CONTRACTS.safeProxyFactory, salt, initCodeHash]);
	const hash = keccak256(data);
	return getAddress(slice(hash, 12));
}

/**
 * 从 P-256 公钥计算关联的 Safe 钱包地址。
 *
 * @param publicKeyHex - hex 格式公钥（04 前缀无压缩格式）
 * @returns Safe 钱包地址
 */
export function computeSafeAddress(publicKeyHex: string): Address {
	const { x, y } = parseP256PublicKey(publicKeyHex);
	const saltNonce = calculateSaltNonce(x, y);
	const setupData = encodeSetupData(x, y);
	return calculateProxyAddress(setupData, saltNonce);
}
