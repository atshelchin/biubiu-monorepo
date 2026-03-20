/**
 * 前端认证类型定义。
 * 与 core/src/auth/types.ts 保持一致（前端子集）。
 */

export interface EndpointPermissions {
	read: boolean;
	trading: boolean;
	funds: boolean;
}

export interface PasskeyStatus {
	registered: boolean;
	canRegister: boolean;
}

export interface EndpointCapabilities {
	endpoint: string;
	version: string;
	permissions: EndpointPermissions;
	passkey: PasskeyStatus;
	features: string[];
}

export interface AuthChallenge {
	challenge: string;
	expiresAt: string;
}

/** 已连接端点的持久化状态 */
export interface ManagedEndpoint {
	/** 端点 URL */
	url: string;
	/** API token */
	token: string;
	/** 客户端 ID */
	clientId: string;
	/** 用户设定的标签 */
	label: string;
	/** WebAuthn credential ID（注册后存储） */
	credentialId: string | null;
	/** 上次获取的权限快照 */
	permissions: EndpointPermissions | null;
	/** 添加时间 */
	addedAt: number;
}

/** 操作签名（附加到写请求） */
export interface OperationSignature {
	credentialId: string;
	authenticatorData: string;
	clientDataJSON: string;
	signature: string;
}
