/**
 * 业务域清单 —— 构建与体积门禁的唯一来源（spec 004 FR-006）。
 *
 * 新增一个域时在这里加一条，构建与门禁自动覆盖它；不需要改别的地方。
 */

/**
 * @typedef {object} Domain
 * @property {string} name      域名，同时是 Cargo feature 后缀与产物子目录名
 * @property {string} exportName 桥导出的类名，宿主 `new wasm.<exportName>()` 用
 * @property {number} maxBytes  该域产物的体积上限（实测 × 1.3）
 */

/** @type {Domain[]} */
export const DOMAINS = [
	{ name: 'revoke', exportName: 'RevokeCore', maxBytes: 409_000 },
	{ name: 'sender', exportName: 'SenderCore', maxBytes: 502_000 },
];

/**
 * 共享底座的实测值（`crux_core` + `serde_json` + 泛型桥），仅作记录。
 *
 * 它在**每个**产物里各存一份，所以涨 10 KB 就是每一页都涨 10 KB —— 比某个域自己涨严重得多。
 * 但切分之后无从只测它（任何一个产物都是「底座 + 某个域」），所以门禁不单独查它，
 * 而是靠「所有域同时超限」这个信号来识别（research.md D33）。
 *
 * 要重测：临时构建一次合并产物，底座 = revoke + sender − 合并。
 */
export const SHARED_BASE_MEASURED = 111_668;
