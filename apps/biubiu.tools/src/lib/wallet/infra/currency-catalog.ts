/**
 * Fiat currency catalog for the display-currency picker.
 *
 * Adapted from vela-wallet `services/currency-catalog.ts`, scoped to the codes the
 * default rate provider (Frankfurter / ECB) returns plus USD. Symbols + grouping
 * formatting come from the app's i18n `formatCurrency` (Intl); this catalog only
 * supplies the picker list (code + human name) in a sensible preference order.
 */

export interface CurrencyMeta {
	code: string;
	name: string;
}

/** Preference order for the picker (common first), then the rest. */
export const CURRENCIES: CurrencyMeta[] = [
	{ code: 'USD', name: 'US Dollar' },
	{ code: 'EUR', name: 'Euro' },
	{ code: 'GBP', name: 'British Pound' },
	{ code: 'CNY', name: 'Chinese Yuan' },
	{ code: 'JPY', name: 'Japanese Yen' },
	{ code: 'KRW', name: 'South Korean Won' },
	{ code: 'HKD', name: 'Hong Kong Dollar' },
	{ code: 'INR', name: 'Indian Rupee' },
	{ code: 'SGD', name: 'Singapore Dollar' },
	{ code: 'AUD', name: 'Australian Dollar' },
	{ code: 'CAD', name: 'Canadian Dollar' },
	{ code: 'CHF', name: 'Swiss Franc' },
	{ code: 'NZD', name: 'New Zealand Dollar' },
	{ code: 'BRL', name: 'Brazilian Real' },
	{ code: 'MXN', name: 'Mexican Peso' },
	{ code: 'TRY', name: 'Turkish Lira' },
	{ code: 'PHP', name: 'Philippine Peso' },
	{ code: 'IDR', name: 'Indonesian Rupiah' },
	{ code: 'THB', name: 'Thai Baht' },
	{ code: 'MYR', name: 'Malaysian Ringgit' },
	{ code: 'ZAR', name: 'South African Rand' },
	{ code: 'PLN', name: 'Polish Zloty' },
	{ code: 'SEK', name: 'Swedish Krona' },
	{ code: 'NOK', name: 'Norwegian Krone' },
	{ code: 'DKK', name: 'Danish Krone' },
	{ code: 'CZK', name: 'Czech Koruna' },
	{ code: 'HUF', name: 'Hungarian Forint' },
	{ code: 'RON', name: 'Romanian Leu' },
	{ code: 'BGN', name: 'Bulgarian Lev' },
	{ code: 'ILS', name: 'Israeli Shekel' },
	{ code: 'ISK', name: 'Icelandic Krona' }
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyName(code: string): string {
	return BY_CODE.get(code.toUpperCase())?.name ?? code.toUpperCase();
}
