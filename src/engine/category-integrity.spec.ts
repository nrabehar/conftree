import { withCategoryIntegrity } from './category-integrity';
import { MemoryStorageAdapter } from '../storage/memory-storage';
import { CategoryError } from '../core/errors';

describe('withCategoryIntegrity', () => {
	function setup() {
		return withCategoryIntegrity(new MemoryStorageAdapter());
	}

	it('allows the first definition of a key with any category', async () => {
		const storage = setup();

		const def = await storage.createDef({
			key: 'chama.amount',
			label: 'Amount',
			type: 'NUMERIC',
			scopes: ['group'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
			category: 'chama',
		});

		expect(def.category).toBe('chama');
	});

	it('allows redefining the same key with the same category (intentional evolution)', async () => {
		const storage = setup();
		await storage.createDef({
			key: 'chama.amount',
			label: 'Amount v1',
			type: 'NUMERIC',
			scopes: ['group'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
			category: 'chama',
		});

		const v2 = await storage.createDef({
			key: 'chama.amount',
			label: 'Amount v2',
			type: 'NUMERIC',
			scopes: ['group'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
			category: 'chama',
		});

		expect(v2.version).toBe(2);
		expect(v2.category).toBe('chama');
	});

	it('allows redefining an uncategorized key as still uncategorized', async () => {
		const storage = setup();
		await storage.createDef({
			key: 'k',
			label: 'K v1',
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});

		const v2 = await storage.createDef({
			key: 'k',
			label: 'K v2',
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});

		expect(v2.version).toBe(2);
		expect(v2.category).toBeNull();
	});

	it('rejects redefining an existing key under a different category', async () => {
		const storage = setup();
		await storage.createDef({
			key: 'amount',
			label: 'Chama amount',
			type: 'NUMERIC',
			scopes: ['group'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
			category: 'chama',
		});

		await expect(
			storage.createDef({
				key: 'amount',
				label: 'Unrelated feature amount',
				type: 'NUMERIC',
				scopes: ['group'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
				category: 'billing',
			}),
		).rejects.toThrow(CategoryError);
	});

	it('rejects moving a previously-uncategorized key into a category', async () => {
		const storage = setup();
		await storage.createDef({
			key: 'k',
			label: 'K v1',
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});

		await expect(
			storage.createDef({
				key: 'k',
				label: 'K v2',
				type: 'NUMERIC',
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
				category: 'chama',
			}),
		).rejects.toThrow(CategoryError);
	});

	it('rejects moving a categorized key back to uncategorized', async () => {
		const storage = setup();
		await storage.createDef({
			key: 'k',
			label: 'K v1',
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
			category: 'chama',
		});

		await expect(
			storage.createDef({
				key: 'k',
				label: 'K v2',
				type: 'NUMERIC',
				scopes: ['user'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
			}),
		).rejects.toThrow(CategoryError);
	});

	it('a rejected redefinition does not create a new version', async () => {
		const storage = setup();
		await storage.createDef({
			key: 'amount',
			label: 'Chama amount',
			type: 'NUMERIC',
			scopes: ['group'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
			category: 'chama',
		});

		await expect(
			storage.createDef({
				key: 'amount',
				label: 'Unrelated feature amount',
				type: 'NUMERIC',
				scopes: ['group'],
				inherit: 'INDEPENDENT',
				required: false,
				status: 'STABLE',
				category: 'billing',
			}),
		).rejects.toThrow(CategoryError);

		const rows = await storage.listDefs();
		expect(rows).toHaveLength(1);
		expect(rows[0].category).toBe('chama');
	});

	it('other StorageAdapter methods keep working correctly through the wrapper (no `this` binding issues)', async () => {
		const storage = setup();
		await storage.createDef({
			key: 'k',
			label: 'K',
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
			category: 'chama',
		});

		expect(await storage.listCategories()).toEqual(['chama']);
		expect((await storage.findDefs(['k']))[0]?.key).toBe('k');
		await storage.transact(async (tx) => {
			const def = await tx.findDef('k');
			expect(def?.key).toBe('k');
		});
	});
});
