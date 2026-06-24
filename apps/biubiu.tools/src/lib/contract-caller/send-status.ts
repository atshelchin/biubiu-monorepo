/**
 * Maps a wallet send-phase to its localized button label. Shared by the
 * method, batch, and chain widgets so the "sending…" copy stays consistent.
 */
import { t } from '$lib/i18n';

export function sendingLabel(phase?: string): string {
	switch (phase) {
		case 'building':
			return t('cc.send.building');
		case 'estimating':
			return t('cc.send.estimating');
		case 'signing':
			return t('cc.send.signing');
		case 'submitting':
			return t('cc.send.submitting');
		case 'waiting':
			return t('cc.send.waiting');
		default:
			return t('cc.send.checking');
	}
}
