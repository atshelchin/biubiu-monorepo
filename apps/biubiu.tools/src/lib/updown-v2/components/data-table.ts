/**
 * Column definition for the data table.
 * - `key`: unique identifier, also used as default sort accessor
 * - `label`: display text for header
 * - `getValue`: accessor for sorting (returns string | number)
 * - `sortable`: whether this column can be sorted (default true)
 * - `hideOnMobile`: hide at <=768px
 * - `align`: text alignment (default 'left')
 */
export interface Column<R> {
	key: string;
	label: string;
	getValue?: (row: R) => string | number;
	sortable?: boolean;
	hideOnMobile?: boolean;
	align?: 'left' | 'center' | 'right';
}

/**
 * Filter pill definition.
 * - `value`: the filter value (empty string = show all)
 * - `label`: display text
 */
export interface FilterOption {
	value: string;
	label: string;
}
