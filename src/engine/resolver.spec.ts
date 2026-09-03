import { Resolver } from './resolver';
import type { DefRecord, ScopeHierarchy, ValueRecord } from '../core/types';
import type { StorageReader } from '../storage/storage-port';
import type { Cache } from '../cache/cache';
import {
	RequiredError,
	ScopeError,
	NotFoundError,
	CorruptError,
} from '../core/errors';

describe('Resolver', () => {
	let storage: jest.Mocked<StorageReader>;
	let hierarchy: jest.Mocked<ScopeHierarchy>;
	let cache: { get: jest.Mock; set: jest.Mock };
	let resolver: Resolver;

	const baseDef: DefRecord = {
		id: 'def-1',
		key: 'contribution.amount',
		version: 1,
		label: 'Contribution amount',
		description: null,
		type: 'NUMERIC',
		options: [],
		min: null,
		max: null,
		scopes: ['entity'],
		inherit: 'INHERITABLE_OVERRIDABLE',
		required: true,
		secret: false,
		status: 'STABLE',
		category: 'contributions',
	};

	function valueRow(overrides: Partial<ValueRecord>) {
		return {
			id: 'v1',
			definitionId: 'def-1',
			scopeKind: 'entity',
			scopeRefId: null,
			bool: null,
			num: null,
			text: null,
			json: null,
			jsonSet: false,
			date: null,
			version: 1,
			...overrides,
		};
	}

	beforeEach(() => {
		storage = {
			findDefs: jest.fn(),
			findValues: jest.fn(),
			findChainValues: jest.fn(),
			findAudit: jest.fn(),
		};
		hierarchy = {
			chain: jest.fn(),
			descendants: jest.fn(),
			children: jest.fn(),
			parent: jest.fn(),
			attach: jest.fn(),
			move: jest.fn(),
			detach: jest.fn(),
		};
		cache = { get: jest.fn().mockReturnValue(undefined), set: jest.fn() };
		resolver = new Resolver(storage, hierarchy, cache as unknown as Cache);
	});

	it('throws NotFoundError for an unknown key', async () => {
		storage.findDefs.mockResolvedValue([]);

		await expect(
			resolver.get('unknown.key', { kind: 'entity', refId: 'e1' }),
		).rejects.toThrow(NotFoundError);
	});

	it('throws ScopeError when scope kind is not in scopes', async () => {
		storage.findDefs.mockResolvedValue([baseDef]);

		await expect(
			resolver.get('contribution.amount', { kind: 'user', refId: 'u1' }),
		).rejects.toThrow(ScopeError);
	});

	it('returns the local value when the scope defines its own', async () => {
		storage.findDefs.mockResolvedValue([baseDef]);
		hierarchy.chain.mockResolvedValue(['child-entity', 'root-entity']);
		storage.findChainValues.mockResolvedValue([
			valueRow({ scopeRefId: 'child-entity', num: 50 }),
		]);

		const result = await resolver.get('contribution.amount', {
			kind: 'entity',
			refId: 'child-entity',
		});

		expect(result).toBe(50);
	});

	it('climbs to the parent when the child has no local value (inheritable_overridable)', async () => {
		storage.findDefs.mockResolvedValue([baseDef]);
		hierarchy.chain.mockResolvedValue(['child-entity', 'root-entity']);
		storage.findChainValues.mockResolvedValue([
			valueRow({ scopeRefId: 'root-entity', num: 75 }),
		]);

		const result = await resolver.get('contribution.amount', {
			kind: 'entity',
			refId: 'child-entity',
		});

		expect(result).toBe(75);
	});

	it('falls back to the "default" scope value when nothing is found in the chain', async () => {
		storage.findDefs.mockResolvedValue([baseDef]);
		hierarchy.chain.mockResolvedValue(['child-entity', 'root-entity']);
		storage.findChainValues.mockResolvedValue([]);
		storage.findValues.mockResolvedValue([
			valueRow({ scopeKind: 'default', scopeRefId: null, num: 10 }),
		]);

		const result = await resolver.get('contribution.amount', {
			kind: 'entity',
			refId: 'child-entity',
		});

		expect(result).toBe(10);
	});

	it('throws RequiredError when required, no value, and no default', async () => {
		storage.findDefs.mockResolvedValue([baseDef]);
		hierarchy.chain.mockResolvedValue(['child-entity', 'root-entity']);
		storage.findChainValues.mockResolvedValue([]);
		storage.findValues.mockResolvedValue([]);

		await expect(
			resolver.get('contribution.amount', {
				kind: 'entity',
				refId: 'child-entity',
			}),
		).rejects.toThrow(RequiredError);
	});

	it('does not climb the hierarchy for INDEPENDENT settings', async () => {
		storage.findDefs.mockResolvedValue([
			{ ...baseDef, inherit: 'INDEPENDENT' },
		]);
		storage.findValues.mockResolvedValue([]);

		await expect(
			resolver.get('contribution.amount', {
				kind: 'entity',
				refId: 'child-entity',
			}),
		).rejects.toThrow(RequiredError);

		expect(hierarchy.chain).not.toHaveBeenCalled();
	});

	it('never touches the hierarchy provider when none is supplied (no-hierarchy use case)', async () => {
		const resolverWithoutHierarchy = new Resolver(storage);
		storage.findDefs.mockResolvedValue([
			{
				...baseDef,
				type: 'BOOLEAN',
				scopes: ['user'],
				inherit: 'INDEPENDENT',
			},
		]);
		storage.findValues.mockResolvedValue([
			valueRow({ scopeKind: 'user', scopeRefId: 'user-42', bool: true }),
		]);

		const result = await resolverWithoutHierarchy.get(
			'contribution.amount',
			{ kind: 'user', refId: 'user-42' },
		);

		expect(result).toBe(true);
	});

	describe('new value types', () => {
		it('resolves a JSON value, including a legitimately-null JSON payload', async () => {
			storage.findDefs.mockResolvedValue([
				{
					...baseDef,
					type: 'JSON',
					inherit: 'INDEPENDENT',
					scopes: ['user'],
				},
			]);
			storage.findValues.mockResolvedValue([
				valueRow({
					scopeKind: 'user',
					scopeRefId: 'u1',
					json: null,
					jsonSet: true,
				}),
			]);

			const result = await resolver.get('contribution.amount', {
				kind: 'user',
				refId: 'u1',
			});

			expect(result).toBeNull();
		});

		it('resolves a JSON object value', async () => {
			storage.findDefs.mockResolvedValue([
				{
					...baseDef,
					type: 'JSON',
					inherit: 'INDEPENDENT',
					scopes: ['user'],
				},
			]);
			storage.findValues.mockResolvedValue([
				valueRow({
					scopeKind: 'user',
					scopeRefId: 'u1',
					json: { a: 1, b: [2, 3] },
					jsonSet: true,
				}),
			]);

			const result = await resolver.get('contribution.amount', {
				kind: 'user',
				refId: 'u1',
			});

			expect(result).toEqual({ a: 1, b: [2, 3] });
		});

		it('throws CorruptError when a JSON row has jsonSet=false', async () => {
			storage.findDefs.mockResolvedValue([
				{
					...baseDef,
					type: 'JSON',
					inherit: 'INDEPENDENT',
					scopes: ['user'],
				},
			]);
			storage.findValues.mockResolvedValue([
				valueRow({
					scopeKind: 'user',
					scopeRefId: 'u1',
					jsonSet: false,
				}),
			]);

			await expect(
				resolver.get('contribution.amount', {
					kind: 'user',
					refId: 'u1',
				}),
			).rejects.toThrow(CorruptError);
		});

		it('resolves a DATE value', async () => {
			const when = new Date('2026-01-01T00:00:00.000Z');
			storage.findDefs.mockResolvedValue([
				{
					...baseDef,
					type: 'DATE',
					inherit: 'INDEPENDENT',
					scopes: ['user'],
				},
			]);
			storage.findValues.mockResolvedValue([
				valueRow({ scopeKind: 'user', scopeRefId: 'u1', date: when }),
			]);

			const result = await resolver.get('contribution.amount', {
				kind: 'user',
				refId: 'u1',
			});

			expect(result).toBe(when);
		});
	});

	describe('batching', () => {
		it('getMany fetches definitions, hierarchy chain, and values with a single call each', async () => {
			storage.findDefs.mockResolvedValue([
				baseDef,
				{ ...baseDef, id: 'def-2', key: 'contribution.frequency' },
			]);
			hierarchy.chain.mockResolvedValue(['child-entity', 'root-entity']);
			storage.findChainValues.mockResolvedValue([
				valueRow({ scopeRefId: 'child-entity', num: 42 }),
				valueRow({
					id: 'v2',
					definitionId: 'def-2',
					scopeRefId: 'child-entity',
					num: 43,
				}),
			]);

			await resolver.getMany(
				['contribution.amount', 'contribution.frequency'],
				{
					kind: 'entity',
					refId: 'child-entity',
				},
			);

			expect(storage.findDefs).toHaveBeenCalledTimes(1);
			expect(hierarchy.chain).toHaveBeenCalledTimes(1);
			expect(storage.findChainValues).toHaveBeenCalledTimes(1);
			expect(storage.findChainValues).toHaveBeenCalledWith(
				expect.objectContaining({ definitionIds: ['def-1', 'def-2'] }),
			);
		});

		it('batches the default-scope fallback lookup for multiple missing keys in one call', async () => {
			storage.findDefs.mockResolvedValue([
				{ ...baseDef, inherit: 'INDEPENDENT', required: false },
				{
					...baseDef,
					id: 'def-2',
					key: 'contribution.frequency',
					inherit: 'INDEPENDENT',
					required: false,
				},
			]);
			storage.findValues.mockResolvedValueOnce([]).mockResolvedValueOnce([
				valueRow({
					definitionId: 'def-1',
					scopeKind: 'default',
					scopeRefId: null,
					num: 1,
				}),
				valueRow({
					id: 'v2',
					definitionId: 'def-2',
					scopeKind: 'default',
					scopeRefId: null,
					num: 2,
				}),
			]);

			const result = await resolver.getMany(
				['contribution.amount', 'contribution.frequency'],
				{
					kind: 'entity',
					refId: 'e1',
				},
			);

			expect(result['contribution.amount']).toBe(1);
			expect(result['contribution.frequency']).toBe(2);
			expect(storage.findValues).toHaveBeenCalledTimes(2);
		});
	});

	describe('getMany fail-fast', () => {
		it('rejects the whole batch when one of several keys is unknown', async () => {
			storage.findDefs.mockResolvedValue([baseDef]);

			await expect(
				resolver.getMany(['contribution.amount', 'unknown.key'], {
					kind: 'entity',
					refId: 'e1',
				}),
			).rejects.toThrow(NotFoundError);
		});

		it('rejects the whole batch when one of several keys has no resolvable value', async () => {
			storage.findDefs.mockResolvedValue([
				baseDef,
				{
					...baseDef,
					id: 'def-2',
					key: 'contribution.frequency',
					inherit: 'INDEPENDENT',
				},
			]);
			hierarchy.chain.mockResolvedValue(['child-entity', 'root-entity']);
			storage.findChainValues.mockResolvedValue([
				valueRow({ scopeRefId: 'child-entity', num: 50 }),
			]);
			storage.findValues.mockResolvedValue([]);

			await expect(
				resolver.getMany(
					['contribution.amount', 'contribution.frequency'],
					{ kind: 'entity', refId: 'child-entity' },
				),
			).rejects.toThrow(RequiredError);
		});
	});

	describe('multi-tenant isolation', () => {
		it('does not leak an INDEPENDENT value between two different scopeRefId sharing the same scopeKind', async () => {
			storage.findDefs.mockResolvedValue([
				{ ...baseDef, inherit: 'INDEPENDENT' },
			]);
			storage.findValues.mockImplementation((query) =>
				Promise.resolve(
					query.scopeRefId === 'tenant-a'
						? [valueRow({ scopeRefId: 'tenant-a', num: 10 })]
						: [],
				),
			);

			const tenantAValue = await resolver.get('contribution.amount', {
				kind: 'entity',
				refId: 'tenant-a',
			});
			expect(tenantAValue).toBe(10);

			await expect(
				resolver.get('contribution.amount', {
					kind: 'entity',
					refId: 'tenant-b',
				}),
			).rejects.toThrow(RequiredError);

			expect(hierarchy.chain).not.toHaveBeenCalled();
		});
	});

	describe('cache', () => {
		it('serves a cached value without touching storage when present', async () => {
			cache.get.mockReturnValueOnce(99);

			const result = await resolver.get('contribution.amount', {
				kind: 'entity',
				refId: 'child-entity',
			});

			expect(result).toBe(99);
			expect(storage.findDefs).not.toHaveBeenCalled();
		});

		it('populates the cache after a successful resolution', async () => {
			storage.findDefs.mockResolvedValue([baseDef]);
			hierarchy.chain.mockResolvedValue(['child-entity', 'root-entity']);
			storage.findChainValues.mockResolvedValue([
				valueRow({ scopeRefId: 'child-entity', num: 50 }),
			]);

			await resolver.get('contribution.amount', {
				kind: 'entity',
				refId: 'child-entity',
			});

			expect(cache.set).toHaveBeenCalledWith(
				'contribution.amount',
				{ kind: 'entity', refId: 'child-entity' },
				50,
			);
		});

		it('never reads or writes the cache for a historical (asOf) read', async () => {
			storage.findDefs.mockResolvedValue([baseDef]);
			hierarchy.chain.mockResolvedValue(['child-entity', 'root-entity']);
			storage.findChainValues.mockResolvedValue([
				valueRow({ scopeRefId: 'child-entity', num: 50 }),
			]);

			await resolver.get(
				'contribution.amount',
				{ kind: 'entity', refId: 'child-entity' },
				new Date('2020-01-01'),
			);

			expect(cache.get).not.toHaveBeenCalled();
			expect(cache.set).not.toHaveBeenCalled();
		});
	});
});
