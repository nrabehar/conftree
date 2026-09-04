import { MemoryStorageAdapter } from './memory-storage';
import { NotFoundError } from '../core/errors';
import type { DefRecord } from '../core/types';

describe('MemoryStorageAdapter', () => {
	let storage: MemoryStorageAdapter;

	beforeEach(() => {
		storage = new MemoryStorageAdapter();
	});

	describe('updateDefStatus', () => {
		it('changes the status of the current edition, preserving its id/version and other fields', async () => {
			const def = await storage.createDef({
				key: 'ui.theme',
				label: 'Theme',
				type: 'ENUM',
				options: ['light', 'dark'],
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
			});

			const updated = await storage.updateDefStatus(
				'ui.theme',
				'DEPRECATED',
			);

			expect(updated.status).toBe('DEPRECATED');
			expect(updated.id).toBe(def.id);
			expect(updated.version).toBe(def.version);
			expect(updated.label).toBe('Theme');
			expect(updated.options).toEqual(['light', 'dark']);
		});

		it('does not retroactively mutate a DefRecord obtained before the status change', async () => {
			await storage.createDef({
				key: 'ui.theme',
				label: 'Theme',
				type: 'ENUM',
				options: ['light', 'dark'],
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
			});
			const [before] = await storage.findDefs(['ui.theme']);

			await storage.updateDefStatus('ui.theme', 'DEPRECATED');

			expect(before.status).toBe('STABLE');
		});

		it('a RETIRED definition is no longer readable via findDefs and no longer writable via a transaction', async () => {
			await storage.createDef({
				key: 'ui.theme',
				label: 'Theme',
				type: 'ENUM',
				options: ['light', 'dark'],
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
			});
			await storage.updateDefStatus('ui.theme', 'RETIRED');

			expect(await storage.findDefs(['ui.theme'])).toEqual([]);
			await expect(
				storage.transact((tx) => tx.findDef('ui.theme')),
			).resolves.toBeNull();
		});

		it('throws NotFoundError for an unknown key', async () => {
			await expect(
				storage.updateDefStatus('unknown', 'RETIRED'),
			).rejects.toThrow(NotFoundError);
		});
	});

	describe('listValues', () => {
		async function seed() {
			const def = await storage.createDef({
				key: 'k',
				label: 'K',
				type: 'NUMERIC',
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
			});
			await storage.transact(async (tx) => {
				await tx.createValue({
					definitionId: def.id,
					scopeKind: 'user',
					scopeRefId: 'u1',
					version: 1,
					authorId: 'a',
					type: 'NUMERIC',
					value: 1,
				});
			});
			return def;
		}

		it('lists only active values at the exact scope', async () => {
			const def = await seed();
			await storage.transact(async (tx) => {
				await tx.createValue({
					definitionId: def.id,
					scopeKind: 'user',
					scopeRefId: 'u2',
					version: 1,
					authorId: 'a',
					type: 'NUMERIC',
					value: 2,
				});
			});

			const page = await storage.listValues({
				scopeKind: 'user',
				scopeRefId: 'u1',
			});

			expect(page.values).toHaveLength(1);
			expect(page.values[0].scopeRefId).toBe('u1');
			expect(page.nextCursor).toBeNull();
		});

		it('paginates with limit/cursor', async () => {
			await storage.createDef({
				key: 'k',
				label: 'K',
				type: 'NUMERIC',
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
			});
			for (let i = 0; i < 3; i++) {
				await storage.createDef({
					key: `k${i}`,
					label: `K${i}`,
					type: 'NUMERIC',
					scopes: ['user'],
					inherit: 'INDEPENDENT',
					required: false,
					status: 'STABLE',
				});
			}
			const defs = await storage.findDefs(['k', 'k0', 'k1', 'k2']);
			await storage.transact(async (tx) => {
				for (const d of defs) {
					await tx.createValue({
						definitionId: d.id,
						scopeKind: 'user',
						scopeRefId: 'u1',
						version: 1,
						authorId: 'a',
						type: 'NUMERIC',
						value: 1,
					});
				}
			});

			const firstPage = await storage.listValues({
				scopeKind: 'user',
				scopeRefId: 'u1',
				limit: 2,
			});
			expect(firstPage.values).toHaveLength(2);
			expect(firstPage.nextCursor).not.toBeNull();

			const secondPage = await storage.listValues({
				scopeKind: 'user',
				scopeRefId: 'u1',
				limit: 2,
				cursor: firstPage.nextCursor!,
			});
			expect(secondPage.values).toHaveLength(2);
			expect(secondPage.nextCursor).toBeNull();

			const allIds = new Set([
				...firstPage.values.map((v) => v.id),
				...secondPage.values.map((v) => v.id),
			]);
			expect(allIds.size).toBe(4);
		});

		it('filters by category, joining against the owning definition', async () => {
			const chamaDef = await storage.createDef({
				key: 'chama.amount',
				label: 'Amount',
				type: 'NUMERIC',
				scopes: ['group'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
				category: 'chama',
			});
			const uiDef = await storage.createDef({
				key: 'ui.theme',
				label: 'Theme',
				type: 'TEXT',
				scopes: ['group'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
				category: 'ui',
			});
			await storage.transact(async (tx) => {
				await tx.createValue({
					definitionId: chamaDef.id,
					scopeKind: 'group',
					scopeRefId: 'g1',
					version: 1,
					authorId: 'a',
					type: 'NUMERIC',
					value: 100,
				});
				await tx.createValue({
					definitionId: uiDef.id,
					scopeKind: 'group',
					scopeRefId: 'g1',
					version: 1,
					authorId: 'a',
					type: 'TEXT',
					value: 'dark',
				});
			});

			const page = await storage.listValues({
				scopeKind: 'group',
				scopeRefId: 'g1',
				category: 'chama',
			});

			expect(page.values).toHaveLength(1);
			expect(page.values[0].definitionId).toBe(chamaDef.id);
		});

		it('paginates correctly within a category filter', async () => {
			const defs: DefRecord[] = [];
			for (let i = 0; i < 3; i++) {
				defs.push(
					await storage.createDef({
						key: `chama.k${i}`,
						label: `K${i}`,
						type: 'NUMERIC',
						scopes: ['group'],
						inherit: 'INDEPENDENT',
						required: false,
						status: 'STABLE',
						category: 'chama',
					}),
				);
			}
			const otherDef = await storage.createDef({
				key: 'ui.theme',
				label: 'Theme',
				type: 'TEXT',
				scopes: ['group'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
				category: 'ui',
			});
			await storage.transact(async (tx) => {
				for (const def of defs) {
					await tx.createValue({
						definitionId: def.id,
						scopeKind: 'group',
						scopeRefId: 'g1',
						version: 1,
						authorId: 'a',
						type: 'NUMERIC',
						value: 1,
					});
				}
				await tx.createValue({
					definitionId: otherDef.id,
					scopeKind: 'group',
					scopeRefId: 'g1',
					version: 1,
					authorId: 'a',
					type: 'TEXT',
					value: 'dark',
				});
			});

			const firstPage = await storage.listValues({
				scopeKind: 'group',
				scopeRefId: 'g1',
				category: 'chama',
				limit: 2,
			});
			expect(firstPage.values).toHaveLength(2);
			expect(firstPage.nextCursor).not.toBeNull();

			const secondPage = await storage.listValues({
				scopeKind: 'group',
				scopeRefId: 'g1',
				category: 'chama',
				limit: 2,
				cursor: firstPage.nextCursor!,
			});
			expect(secondPage.values).toHaveLength(1);
			expect(secondPage.nextCursor).toBeNull();
		});
	});

	describe('findDefsByIds', () => {
		it('resolves definitions by internal id regardless of status', async () => {
			const def = await storage.createDef({
				key: 'k',
				label: 'K',
				type: 'NUMERIC',
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'DRAFT',
			});

			expect(await storage.findDefsByIds([def.id])).toEqual([def]);
			expect(await storage.findDefsByIds(['missing'])).toEqual([]);
		});
	});

	describe('transact rollback', () => {
		it('rolls back all writes from a failed transaction, including closeValue mutations', async () => {
			const def = await storage.createDef({
				key: 'k',
				label: 'K',
				type: 'NUMERIC',
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
			});
			await storage.transact(async (tx) => {
				await tx.createValue({
					definitionId: def.id,
					scopeKind: 'user',
					scopeRefId: 'u1',
					version: 1,
					authorId: 'a',
					type: 'NUMERIC',
					value: 1,
				});
			});

			await expect(
				storage.transact(async (tx) => {
					const current = await tx.findValue(def.id, 'user', 'u1');
					await tx.closeValue(current!.id);
					await tx.createValue({
						definitionId: def.id,
						scopeKind: 'user',
						scopeRefId: 'u1',
						version: 2,
						authorId: 'a',
						type: 'NUMERIC',
						value: 2,
					});
					throw new Error('boom');
				}),
			).rejects.toThrow('boom');

			const stillActive = await storage.transact((tx) =>
				tx.findValue(def.id, 'user', 'u1'),
			);
			expect(stillActive?.num).toBe(1);
			expect(stillActive?.version).toBe(1);
		});
	});

	describe('closeValue', () => {
		it('does not retroactively mutate a ValueRecord obtained before it was closed', async () => {
			const def = await storage.createDef({
				key: 'k',
				label: 'K',
				type: 'NUMERIC',
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
			});
			const before = await storage.transact((tx) =>
				tx.createValue({
					definitionId: def.id,
					scopeKind: 'user',
					scopeRefId: 'u1',
					version: 1,
					authorId: 'a',
					type: 'NUMERIC',
					value: 1,
				}),
			);

			await storage.transact((tx) => tx.closeValue(before.id));

			expect((before as unknown as { validTo: unknown }).validTo).toBe(
				null,
			);
		});
	});
});
