import type { Action } from 'svelte/action';

/**
 * Mounts the node at `document.body` so a `position: fixed` overlay escapes any
 * ancestor with `transform` / `filter` / `overflow`. Such an ancestor becomes the
 * containing block for fixed descendants AND clips them — which silently breaks
 * overlays opened from inside another overlay (e.g. a modal within a modal: the
 * inner one loses its header/footer to the parent's clip band).
 *
 * Apply to the single wrapper around an overlay's backdrop+panel:
 *   {#if open}<div use:portal>…fixed backdrop + panel…</div>{/if}
 *
 * Caveats (true for any portal): the node leaves its DOM parent, so don't rely on
 * a surrounding <form> for implicit submit, or on CSS custom properties inherited
 * from a non-:root ancestor (theme tokens live at :root, so they're unaffected).
 */
export const portal: Action<HTMLElement> = (node) => {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
};
