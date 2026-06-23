/**
 * Auto-fund the relayer from the user's passkey Safe (one fingerprint).
 * A plain native transfer Safe → relayer (operation = 0 CALL).
 * The manual fallback (user funds the relayer address themselves) needs no code.
 */
import { type Address } from 'viem';
import { sendContractCall } from '$lib/auth/safe-tx/send-contract-call';
import type { SendResult, SendStatus } from '$lib/auth/safe-tx/send-token';
import type { SweepNetwork } from '../types.js';
import type { SweepUser } from './sweep-multisend.js';

export function fundRelayerFromSafe(opts: {
	network: SweepNetwork;
	user: SweepUser;
	relayerAddress: Address;
	amountWei: bigint;
	onStatus?: (s: SendStatus) => void;
}): Promise<SendResult> {
	const { network, user, relayerAddress, amountWei, onStatus } = opts;
	return sendContractCall({
		safeAddress: user.safeAddress,
		publicKeyHex: user.publicKey,
		credentialId: user.credentialId,
		rpId: user.rpId,
		to: relayerAddress,
		value: amountWei,
		data: '0x',
		operation: 0,
		network: network.slug,
		onStatus: (s) => onStatus?.(s),
	});
}
