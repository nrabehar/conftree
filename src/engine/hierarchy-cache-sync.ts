import type { Cache } from '../cache/cache';
import type { ScopeHierarchy } from '../core/types';

export function withHierarchyInvalidation(
	hierarchy: ScopeHierarchy,
	cache: Cache,
): ScopeHierarchy {
	return {
		chain: (id) => hierarchy.chain(id),
		descendants: (id) => hierarchy.descendants(id),
		children: (id) => hierarchy.children(id),
		parent: (id) => hierarchy.parent(id),
		attach: async (id, parentId) => {
			await hierarchy.attach(id, parentId);
			cache.dropForScopes(await hierarchy.descendants(id));
		},
		move: async (id, newParentId) => {
			const descendants = await hierarchy.descendants(id);
			await hierarchy.move(id, newParentId);
			cache.dropForScopes(descendants);
		},
		detach: async (id) => {
			const descendants = await hierarchy.descendants(id);
			await hierarchy.detach(id);
			cache.dropForScopes(descendants);
		},
	};
}
