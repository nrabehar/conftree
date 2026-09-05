import { CategoryGuard } from './category-guard';
import type { StorageReader } from '../storage/storage-port';
import type { DefRecord } from '../core/types';
import { CategoryError } from '../core/errors';

describe('CategoryGuard', () => {
	let storage: jest.Mocked<StorageReader>;
	let guard: CategoryGuard;

	function def(overrides: Partial<DefRecord>): DefRecord {
		return {
			id: 'def-1',
			key: 'k',
			version: 1,
			label: 'K',
			description: null,
			type: 'TEXT',
			options: [],
			min: null,
			max: null,
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			secret: false,
			status: 'STABLE',
			category: null,
			...overrides,
		};
	}

	beforeEach(() => {
		storage = {
			findDefs: jest.fn(),
			findDefsByIds: jest.fn(),
			findAnyDef: jest.fn(),
			findAnyDefs: jest.fn(),
			findValues: jest.fn(),
			findChainValues: jest.fn(),
			findAudit: jest.fn(),
			listValues: jest.fn(),
		};
		guard = new CategoryGuard(storage, 'chama');
	});

	describe('resolveKeys', () => {
		it('resolves a mix of full and short keys in a single storage call', async () => {
			storage.findAnyDefs.mockResolvedValue([
				def({ key: 'chama.currency', category: 'chama' }),
			]);

			const resolved = await guard.resolveKeys([
				'currency',
				'chama.currency',
			]);

			expect(resolved).toEqual(['chama.currency', 'chama.currency']);
			expect(storage.findAnyDefs).toHaveBeenCalledTimes(1);
		});

		it('throws CategoryError when a full key belongs to another category', async () => {
			storage.findAnyDefs.mockResolvedValue([
				def({ key: 'ui.theme', category: 'ui' }),
			]);

			await expect(guard.resolveKeys(['ui.theme'])).rejects.toThrow(
				CategoryError,
			);
		});

		it('returns an empty array without calling storage for an empty input', async () => {
			expect(await guard.resolveKeys([])).toEqual([]);
			expect(storage.findAnyDefs).not.toHaveBeenCalled();
		});
	});

	describe('assertAll', () => {
		it('checks every key in a single storage call', async () => {
			storage.findAnyDefs.mockResolvedValue([
				def({ key: 'chama.currency', category: 'chama' }),
				def({ key: 'chama.limit', category: 'chama' }),
			]);

			await expect(
				guard.assertAll(['chama.currency', 'chama.limit']),
			).resolves.toBeUndefined();
			expect(storage.findAnyDefs).toHaveBeenCalledTimes(1);
		});

		it('throws CategoryError for a key from another category', async () => {
			storage.findAnyDefs.mockResolvedValue([
				def({ key: 'ui.theme', category: 'ui' }),
			]);

			await expect(guard.assertAll(['ui.theme'])).rejects.toThrow(
				CategoryError,
			);
		});
	});
});
