/**
 * 站点级 Passkey 账号体系类型定义。
 */

/** 已登录用户信息（持久化到 localStorage） */
export interface AuthUser {
	/** 用户显示名 */
	name: string;
	/** WebAuthn credential ID（base64url） */
	credentialId: string;
	/** P-256 公钥（hex，04 前缀无压缩格式） */
	publicKey: string;
	/** RP ID（biubiu.tools / localhost） */
	rpId: string;
	/** 关联的 Safe 钱包地址（Base Mainnet，从公钥确定性派生） */
	safeAddress: string;
	/** 注册时间戳 */
	createdAt: number;
}

/** /api/challenge 返回 */
export interface IndexChallenge {
	challenge: string;
}

/** /api/query 返回 */
export interface StoredKey {
	rpId: string;
	credentialId: string;
	publicKey: string;
	name: string;
	createdAt: number;
}

/**
 * 本地 passkey 记录。
 *
 * 创建 passkey 后立即写入 localStorage，通过 credentialId 索引。
 * 确保即使后续上传失败，公钥数据也不会丢失。
 */
export interface LocalKey {
	rpId: string;
	credentialId: string;
	publicKey: string;
	name: string;
	createdAt: number;
}
