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
			cache.dropAll();
		},
		move: async (id, newParentId) => {
			await hierarchy.move(id, newParentId);
			cache.dropAll();
		},
		detach: async (id) => {
			await hierarchy.detach(id);
			cache.dropAll();
		},
	};
}
