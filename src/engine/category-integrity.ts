import { CategoryError } from '../core/errors';
import type { StorageAdapter } from '../storage/storage-port';

export function withCategoryIntegrity(storage: StorageAdapter): StorageAdapter {
	return {
		findDefs: (keys) => storage.findDefs(keys),
		findDefsByIds: (ids) => storage.findDefsByIds(ids),
		findAnyDef: (key) => storage.findAnyDef(key),
		findValues: (query) => storage.findValues(query),
		findChainValues: (query) => storage.findChainValues(query),
		findAudit: (query) => storage.findAudit(query),
		listValues: (query) => storage.listValues(query),
		listDefs: (status, category) => storage.listDefs(status, category),
		listCategories: () => storage.listCategories(),
		updateDefStatus: (key, status) => storage.updateDefStatus(key, status),
		transact: (fn) => storage.transact(fn),
		createDef: async (input) => {
			const existing = await storage.findAnyDef(input.key);
			const newCategory = input.category ?? null;
			if (existing && existing.category !== newCategory) {
				throw new CategoryError(
					input.key,
					existing.category,
					newCategory,
				);
			}
			return storage.createDef(input);
		},
	};
}
