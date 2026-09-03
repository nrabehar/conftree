import { Auditor } from './auditor';
import type { AuditRecord, StorageReader } from '../storage/storage-port';
import type { DefRecord } from '../core/types';
import { NotFoundError } from '../core/errors';

describe('Auditor', () => {
	let storage: jest.Mocked<StorageReader>;
	let auditor: Auditor;

	const def: DefRecord = {
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
		category: null,
	};

	beforeEach(() => {
		storage = {
			findDefs: jest.fn(),
			findValues: jest.fn(),
			findChainValues: jest.fn(),
			findAudit: jest.fn(),
		};
		auditor = new Auditor(storage);
	});

	it('throws NotFoundError for an unknown key', async () => {
		storage.findDefs.mockResolvedValue([]);

		await expect(auditor.history('unknown.key')).rejects.toThrow(
			NotFoundError,
		);
	});

	it('resolves the key to a definitionId and forwards an optional scope filter', async () => {
		storage.findDefs.mockResolvedValue([def]);
		const records: AuditRecord[] = [
			{
				id: 'audit-1',
				valueId: 'v1',
				definitionId: 'def-1',
				scopeKind: 'entity',
				scopeRefId: 'e1',
				action: 'created',
				authorId: 'u1',
				after: { num: 50 },
				at: new Date('2026-01-01'),
			},
		];
		storage.findAudit.mockResolvedValue(records);

		const result = await auditor.history('contribution.amount', {
			kind: 'entity',
			refId: 'e1',
		});

		expect(storage.findAudit).toHaveBeenCalledWith({
			definitionId: 'def-1',
			scopeKind: 'entity',
			scopeRefId: 'e1',
		});
		expect(result).toEqual(records);
	});

	it('queries across all scopes when no scope is given', async () => {
		storage.findDefs.mockResolvedValue([def]);
		storage.findAudit.mockResolvedValue([]);

		await auditor.history('contribution.amount');

		expect(storage.findAudit).toHaveBeenCalledWith({
			definitionId: 'def-1',
			scopeKind: undefined,
			scopeRefId: undefined,
		});
	});
});
