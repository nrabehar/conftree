import { Writer } from './writer';
import type { StorageAdapter, StorageTx } from '../storage/storage-port';
import type { ChangeBus } from '../cache/change-bus';
import type { DefRecord, ValueRecord } from '../core/types';
import {
	ConflictError,
	ScopeError,
	ValueError,
	NotFoundError,
} from '../core/errors';

describe('Writer', () => {
	let storage: jest.Mocked<StorageAdapter>;
	let tx: jest.Mocked<StorageTx>;
	let bus: jest.Mocked<ChangeBus>;
	let writer: Writer;

	const numericDef: DefRecord = {
		id: 'def-1',
		key: 'contribution.amount',
		version: 1,
		label: 'Contribution amount',
		description: null,
		type: 'NUMERIC',
		options: [],
		min: 0,
		max: 10000,
		scopes: ['entity'],
		inherit: 'INHERITABLE_OVERRIDABLE',
		required: true,
		secret: false,
		status: 'STABLE',
		category: 'contributions',
	};

	const enumDef: DefRecord = {
		...numericDef,
		id: 'def-2',
		key: 'contribution.frequency',
		type: 'ENUM',
		options: ['weekly', 'monthly'],
	};
	const jsonDef: DefRecord = {
		...numericDef,
		id: 'def-3',
		key: 'notif.settings',
		type: 'JSON',
	};
	const dateDef: DefRecord = {
		...numericDef,
		id: 'def-4',
		key: 'trial.endsAt',
		type: 'DATE',
	};
	const secretDef: DefRecord = {
		...numericDef,
		id: 'def-5',
		key: 'api.key',
		type: 'TEXT',
		secret: true,
	};

	function baseValueRow(overrides: Partial<ValueRecord> = {}) {
		return {
			id: 'v0',
			definitionId: 'def-1',
			scopeKind: 'entity',
			scopeRefId: 'e1',
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
		tx = {
			findDef: jest.fn(),
			findValue: jest.fn(),
			closeValue: jest.fn(),
			createValue: jest.fn(),
			createAudit: jest.fn(),
		};
		storage = {
			findDefs: jest.fn(),
			findValues: jest.fn(),
			findChainValues: jest.fn(),
			findAudit: jest.fn(),
			createDef: jest.fn(),
			listDefs: jest.fn(),
			transact: jest.fn((fn: (tx: StorageTx) => Promise<unknown>) =>
				fn(tx),
			),
		} as unknown as jest.Mocked<StorageAdapter>;
		bus = { publish: jest.fn(), subscribe: jest.fn() };
		writer = new Writer(storage, bus);
	});

	it('throws NotFoundError for an unknown key', async () => {
		tx.findDef.mockResolvedValue(null);

		await expect(
			writer.set({
				key: 'unknown',
				scope: { kind: 'entity', refId: 'e1' },
				value: 10,
				authorId: 'u1',
			}),
		).rejects.toThrow(NotFoundError);

		expect(bus.publish).not.toHaveBeenCalled();
	});

	it('throws ScopeError for a disallowed scope kind', async () => {
		tx.findDef.mockResolvedValue(numericDef);

		await expect(
			writer.set({
				key: 'contribution.amount',
				scope: { kind: 'user', refId: 'u1' },
				value: 10,
				authorId: 'u1',
			}),
		).rejects.toThrow(ScopeError);
	});

	it('rejects a numeric value below min', async () => {
		tx.findDef.mockResolvedValue(numericDef);

		await expect(
			writer.set({
				key: 'contribution.amount',
				scope: { kind: 'entity', refId: 'e1' },
				value: -5,
				authorId: 'u1',
			}),
		).rejects.toThrow(ValueError);
	});

	it('rejects a non-finite number', async () => {
		tx.findDef.mockResolvedValue(numericDef);

		await expect(
			writer.set({
				key: 'contribution.amount',
				scope: { kind: 'entity', refId: 'e1' },
				value: Infinity,
				authorId: 'u1',
			}),
		).rejects.toThrow(ValueError);
	});

	it('rejects an enum value not in options', async () => {
		tx.findDef.mockResolvedValue(enumDef);

		await expect(
			writer.set({
				key: 'contribution.frequency',
				scope: { kind: 'entity', refId: 'e1' },
				value: 'daily',
				authorId: 'u1',
			}),
		).rejects.toThrow(ValueError);
	});

	it('creates a first value when none exists and expectedVersion is omitted', async () => {
		tx.findDef.mockResolvedValue(numericDef);
		tx.findValue.mockResolvedValue(null);
		tx.createValue.mockResolvedValue(
			baseValueRow({ id: 'v1', num: 50, version: 1 }),
		);

		const result = await writer.set({
			key: 'contribution.amount',
			scope: { kind: 'entity', refId: 'e1' },
			value: 50,
			authorId: 'u1',
		});

		expect(result.version).toBe(1);
		expect(tx.closeValue).not.toHaveBeenCalled();
		expect(tx.createAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'created' }),
		);
		expect(bus.publish).toHaveBeenCalledWith({
			definitionId: 'def-1',
			key: 'contribution.amount',
			scopeKind: 'entity',
			scopeRefId: 'e1',
		});
	});

	it('supersedes the active value and bumps version on a correct expectedVersion', async () => {
		tx.findDef.mockResolvedValue(numericDef);
		tx.findValue.mockResolvedValue(
			baseValueRow({ id: 'v1', num: 50, version: 1 }),
		);
		tx.createValue.mockResolvedValue(
			baseValueRow({ id: 'v2', num: 75, version: 2 }),
		);

		const result = await writer.set({
			key: 'contribution.amount',
			scope: { kind: 'entity', refId: 'e1' },
			value: 75,
			expectedVersion: 1,
			authorId: 'u1',
		});

		expect(tx.closeValue).toHaveBeenCalledWith('v1');
		expect(result.version).toBe(2);
		expect(tx.createAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'superseded' }),
		);
	});

	it('throws ConflictError on a stale expectedVersion', async () => {
		tx.findDef.mockResolvedValue(numericDef);
		tx.findValue.mockResolvedValue(
			baseValueRow({ id: 'v1', num: 50, version: 3 }),
		);

		await expect(
			writer.set({
				key: 'contribution.amount',
				scope: { kind: 'entity', refId: 'e1' },
				value: 75,
				expectedVersion: 1,
				authorId: 'u1',
			}),
		).rejects.toThrow(ConflictError);

		expect(tx.closeValue).not.toHaveBeenCalled();
		expect(tx.createValue).not.toHaveBeenCalled();
		expect(bus.publish).not.toHaveBeenCalled();
	});

	describe('new value types', () => {
		it('accepts and stores a JSON object value', async () => {
			tx.findDef.mockResolvedValue(jsonDef);
			tx.findValue.mockResolvedValue(null);
			tx.createValue.mockImplementation((input) =>
				Promise.resolve(
					baseValueRow({
						id: 'v1',
						json: input.value,
						jsonSet: true,
						version: 1,
					}),
				),
			);

			const result = await writer.set({
				key: 'notif.settings',
				scope: { kind: 'entity', refId: 'e1' },
				value: { email: true, sms: false },
				authorId: 'u1',
			});

			expect(result.json).toEqual({ email: true, sms: false });
		});

		it('rejects a non-JSON-serializable value for a JSON setting', async () => {
			tx.findDef.mockResolvedValue(jsonDef);

			await expect(
				writer.set({
					key: 'notif.settings',
					scope: { kind: 'entity', refId: 'e1' },
					value: { bad: BigInt(1) } as any,
					authorId: 'u1',
				}),
			).rejects.toThrow(ValueError);
		});

		it('accepts a valid Date for a DATE setting and rejects an invalid one', async () => {
			tx.findDef.mockResolvedValue(dateDef);
			tx.findValue.mockResolvedValue(null);
			tx.createValue.mockResolvedValue(
				baseValueRow({
					id: 'v1',
					date: new Date('2026-01-01'),
					version: 1,
				}),
			);

			await expect(
				writer.set({
					key: 'trial.endsAt',
					scope: { kind: 'entity', refId: 'e1' },
					value: new Date('2026-01-01'),
					authorId: 'u1',
				}),
			).resolves.toMatchObject({ version: 1 });

			await expect(
				writer.set({
					key: 'trial.endsAt',
					scope: { kind: 'entity', refId: 'e1' },
					value: new Date('invalid'),
					authorId: 'u1',
				}),
			).rejects.toThrow(ValueError);
		});
	});

	describe('secret redaction', () => {
		it('never includes the plain value in the audit snapshot for a secret definition', async () => {
			tx.findDef.mockResolvedValue(secretDef);
			tx.findValue.mockResolvedValue(null);
			tx.createValue.mockResolvedValue(
				baseValueRow({ id: 'v1', text: 'sk-super-secret', version: 1 }),
			);

			await writer.set({
				key: 'api.key',
				scope: { kind: 'entity', refId: 'e1' },
				value: 'sk-super-secret',
				authorId: 'u1',
			});

			const auditCall = tx.createAudit.mock.calls[0][0];
			expect(JSON.stringify(auditCall)).not.toContain('sk-super-secret');
			expect(auditCall.after).toMatchObject({ value: '[redacted]' });
		});

		it('does redact for a non-secret definition (plain value kept in audit)', async () => {
			tx.findDef.mockResolvedValue(numericDef);
			tx.findValue.mockResolvedValue(null);
			tx.createValue.mockResolvedValue(
				baseValueRow({ id: 'v1', num: 50, version: 1 }),
			);

			await writer.set({
				key: 'contribution.amount',
				scope: { kind: 'entity', refId: 'e1' },
				value: 50,
				authorId: 'u1',
			});

			const auditCall = tx.createAudit.mock.calls[0][0];
			expect(auditCall.after).toMatchObject({ num: 50 });
		});
	});

	describe('unset', () => {
		it('closes the active value and audits an "unset" action', async () => {
			tx.findDef.mockResolvedValue(numericDef);
			tx.findValue.mockResolvedValue(
				baseValueRow({ id: 'v1', num: 50, version: 1 }),
			);

			await writer.unset({
				key: 'contribution.amount',
				scope: { kind: 'entity', refId: 'e1' },
				expectedVersion: 1,
				authorId: 'u1',
			});

			expect(tx.closeValue).toHaveBeenCalledWith('v1');
			expect(tx.createValue).not.toHaveBeenCalled();
			expect(tx.createAudit).toHaveBeenCalledWith(
				expect.objectContaining({ valueId: 'v1', action: 'unset' }),
			);
			expect(bus.publish).toHaveBeenCalledWith({
				definitionId: 'def-1',
				key: 'contribution.amount',
				scopeKind: 'entity',
				scopeRefId: 'e1',
			});
		});

		it('is a no-op when there is nothing to unset', async () => {
			tx.findDef.mockResolvedValue(numericDef);
			tx.findValue.mockResolvedValue(null);

			await writer.unset({
				key: 'contribution.amount',
				scope: { kind: 'entity', refId: 'e1' },
				authorId: 'u1',
			});

			expect(tx.closeValue).not.toHaveBeenCalled();
			expect(bus.publish).not.toHaveBeenCalled();
		});

		it('throws ConflictError on a stale expectedVersion', async () => {
			tx.findDef.mockResolvedValue(numericDef);
			tx.findValue.mockResolvedValue(
				baseValueRow({ id: 'v1', num: 50, version: 3 }),
			);

			await expect(
				writer.unset({
					key: 'contribution.amount',
					scope: { kind: 'entity', refId: 'e1' },
					expectedVersion: 1,
					authorId: 'u1',
				}),
			).rejects.toThrow(ConflictError);

			expect(tx.closeValue).not.toHaveBeenCalled();
		});

		it('throws NotFoundError for an unknown key', async () => {
			tx.findDef.mockResolvedValue(null);

			await expect(
				writer.unset({
					key: 'unknown',
					scope: { kind: 'entity', refId: 'e1' },
					authorId: 'u1',
				}),
			).rejects.toThrow(NotFoundError);
		});
	});

	describe('setMany', () => {
		it('writes several values in one transaction and publishes one change event per key', async () => {
			tx.findDef
				.mockResolvedValueOnce(numericDef)
				.mockResolvedValueOnce(enumDef);
			tx.findValue.mockResolvedValue(null);
			tx.createValue
				.mockResolvedValueOnce(
					baseValueRow({ id: 'v1', num: 50, version: 1 }),
				)
				.mockResolvedValueOnce(
					baseValueRow({
						id: 'v2',
						definitionId: 'def-2',
						text: 'monthly',
						version: 1,
					}),
				);

			const results = await writer.setMany([
				{
					key: 'contribution.amount',
					scope: { kind: 'entity', refId: 'e1' },
					value: 50,
					authorId: 'u1',
				},
				{
					key: 'contribution.frequency',
					scope: { kind: 'entity', refId: 'e1' },
					value: 'monthly',
					authorId: 'u1',
				},
			]);

			expect(results).toHaveLength(2);
			expect(storage.transact).toHaveBeenCalledTimes(1);
			expect(bus.publish).toHaveBeenCalledTimes(2);
		});

		it('propagates an error from within the batch without publishing anything', async () => {
			tx.findDef
				.mockResolvedValueOnce(numericDef)
				.mockResolvedValueOnce(enumDef);
			tx.findValue.mockResolvedValue(null);
			tx.createValue.mockResolvedValueOnce(
				baseValueRow({ id: 'v1', num: 50, version: 1 }),
			);

			await expect(
				writer.setMany([
					{
						key: 'contribution.amount',
						scope: { kind: 'entity', refId: 'e1' },
						value: 50,
						authorId: 'u1',
					},
					{
						key: 'contribution.frequency',
						scope: { kind: 'entity', refId: 'e1' },
						value: 'daily',
						authorId: 'u1',
					},
				]),
			).rejects.toThrow(ValueError);

			expect(bus.publish).not.toHaveBeenCalled();
		});
	});
});
