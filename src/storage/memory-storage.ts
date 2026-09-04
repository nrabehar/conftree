import type {
	AuditRecord,
	CreateAuditInput,
	CreateDefInput,
	CreateValueInput,
	FindAuditQuery,
	FindChainQuery,
	FindValuesQuery,
	ListValuesQuery,
	ListValuesResult,
	StorageAdapter,
	StorageTx,
} from './storage-port';
import type {
	DefRecord,
	Status,
	Value,
	ValueRecord,
	ValueType,
} from '../core/types';
import { NotFoundError } from '../core/errors';

interface StoredValue extends ValueRecord {
	validFrom: Date;
	validTo: Date | null;
}

function toTypedColumns(type: ValueType, value: Value) {
	return {
		bool: type === 'BOOLEAN' ? (value as boolean) : null,
		num: type === 'NUMERIC' ? (value as number) : null,
		text: type === 'TEXT' || type === 'ENUM' ? (value as string) : null,
		json: type === 'JSON' ? value : null,
		jsonSet: type === 'JSON',
		date: type === 'DATE' ? (value as Date) : null,
	};
}

export class MemoryStorageAdapter implements StorageAdapter {
	private defs: DefRecord[] = [];
	private values: StoredValue[] = [];
	private auditLog: AuditRecord[] = [];
	private nextId = 1;
	private txQueue: Promise<unknown> = Promise.resolve();

	private newId(prefix: string): string {
		return `${prefix}-${this.nextId++}`;
	}

	async findDefs(keys: string[]): Promise<DefRecord[]> {
		const result: DefRecord[] = [];
		for (const key of keys) {
			const found = this.latestByStatus(key, ['STABLE', 'DEPRECATED']);
			if (found) result.push(found);
		}
		return result;
	}

	async findValues(query: FindValuesQuery): Promise<ValueRecord[]> {
		const asOf = query.asOf ?? new Date();
		const ids = new Set(query.definitionIds);
		return this.values.filter(
			(v) =>
				ids.has(v.definitionId) &&
				v.scopeKind === query.scopeKind &&
				v.scopeRefId === query.scopeRefId &&
				v.validFrom <= asOf &&
				(v.validTo === null || v.validTo > asOf),
		);
	}

	async findChainValues(query: FindChainQuery): Promise<ValueRecord[]> {
		const asOf = query.asOf ?? new Date();
		const defIds = new Set(query.definitionIds);
		const refIds = new Set(query.chain);
		return this.values.filter(
			(v) =>
				defIds.has(v.definitionId) &&
				v.scopeRefId !== null &&
				refIds.has(v.scopeRefId) &&
				v.validFrom <= asOf &&
				(v.validTo === null || v.validTo > asOf),
		);
	}

	async findDefsByIds(ids: string[]): Promise<DefRecord[]> {
		const idSet = new Set(ids);
		return this.defs.filter((d) => idSet.has(d.id));
	}

	async findAnyDef(key: string): Promise<DefRecord | null> {
		return this.latestVersion(key) ?? null;
	}

	async listValues(query: ListValuesQuery): Promise<ListValuesResult> {
		const now = new Date();
		const categoryDefIds =
			query.category !== undefined
				? new Set(
						this.defs
							.filter((d) => d.category === query.category)
							.map((d) => d.id),
					)
				: null;
		const active = this.values
			.filter(
				(v) =>
					v.scopeKind === query.scopeKind &&
					v.scopeRefId === query.scopeRefId &&
					(categoryDefIds === null ||
						categoryDefIds.has(v.definitionId)) &&
					v.validFrom <= now &&
					(v.validTo === null || v.validTo > now),
			)
			.sort((a, b) => a.id.localeCompare(b.id));

		const startIndex = query.cursor
			? active.findIndex((v) => v.id === query.cursor) + 1
			: 0;
		const limit = query.limit ?? active.length - startIndex;
		const page = active.slice(startIndex, startIndex + limit);
		const nextCursor =
			startIndex + page.length < active.length
				? (page[page.length - 1]?.id ?? null)
				: null;

		return { values: page, nextCursor };
	}

	async findAudit(query: FindAuditQuery): Promise<AuditRecord[]> {
		return this.auditLog
			.filter(
				(a) =>
					a.definitionId === query.definitionId &&
					(query.scopeKind === undefined ||
						a.scopeKind === query.scopeKind) &&
					(query.scopeRefId === undefined ||
						a.scopeRefId === query.scopeRefId),
			)
			.sort((a, b) => a.at.getTime() - b.at.getTime());
	}

	async createDef(input: CreateDefInput): Promise<DefRecord> {
		const existingVersions = this.defs.filter((d) => d.key === input.key);
		const version =
			existingVersions.length > 0
				? Math.max(...existingVersions.map((d) => d.version)) + 1
				: 1;
		const record: DefRecord = {
			id: this.newId('def'),
			key: input.key,
			version,
			label: input.label,
			description: input.description ?? null,
			type: input.type,
			options: input.options ?? [],
			min: input.min ?? null,
			max: input.max ?? null,
			scopes: input.scopes,
			inherit: input.inherit,
			required: input.required,
			secret: input.secret ?? false,
			status: input.status ?? 'DRAFT',
			category: input.category ?? null,
		};
		this.defs.push(record);
		return record;
	}

	async updateDefStatus(key: string, status: Status): Promise<DefRecord> {
		const current = this.latestVersion(key);
		if (!current) throw new NotFoundError(key);

		const updated: DefRecord = { ...current, status };
		this.defs = this.defs.map((d) => (d === current ? updated : d));
		return updated;
	}

	async listDefs(status?: Status, category?: string): Promise<DefRecord[]> {
		const rows = this.allLatestVersions().filter(
			(d) =>
				(status === undefined || d.status === status) &&
				(category === undefined || d.category === category),
		);
		return rows.sort(
			(a, b) =>
				(a.category ?? '').localeCompare(b.category ?? '') ||
				a.key.localeCompare(b.key),
		);
	}

	async listCategories(): Promise<string[]> {
		const categories = new Set(
			this.allLatestVersions()
				.map((d) => d.category)
				.filter((c): c is string => c !== null),
		);
		return [...categories].sort();
	}

	async transact<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T> {
		const run = this.txQueue.then(async () => {
			const valuesSnapshot = structuredClone(this.values);
			const auditLogSnapshot = structuredClone(this.auditLog);
			try {
				return await fn(this.tx());
			} catch (err) {
				this.values = valuesSnapshot;
				this.auditLog = auditLogSnapshot;
				throw err;
			}
		});
		this.txQueue = run.catch(() => {});
		return run;
	}

	private latestByStatus(
		key: string,
		statuses: Status[],
	): DefRecord | undefined {
		const latest = this.latestVersion(key);
		return latest && statuses.includes(latest.status) ? latest : undefined;
	}

	private latestVersion(key: string): DefRecord | undefined {
		return this.defs
			.filter((d) => d.key === key)
			.sort((a, b) => b.version - a.version)[0];
	}

	private allLatestVersions(): DefRecord[] {
		const byKey = new Map<string, DefRecord>();
		for (const d of this.defs) {
			const current = byKey.get(d.key);
			if (!current || d.version > current.version) byKey.set(d.key, d);
		}
		return [...byKey.values()];
	}

	private tx(): StorageTx {
		return {
			findDef: async (key: string) =>
				this.latestByStatus(key, ['STABLE']) ?? null,

			findValue: async (definitionId, scopeKind, scopeRefId) =>
				this.values.find(
					(v) =>
						v.definitionId === definitionId &&
						v.scopeKind === scopeKind &&
						v.scopeRefId === scopeRefId &&
						v.validTo === null,
				) ?? null,

			closeValue: async (id: string) => {
				const row = this.values.find((v) => v.id === id);
				if (!row) return;
				const closed: StoredValue = { ...row, validTo: new Date() };
				this.values = this.values.map((v) => (v === row ? closed : v));
			},

			createValue: async (input: CreateValueInput) => {
				const record: StoredValue = {
					id: this.newId('val'),
					definitionId: input.definitionId,
					scopeKind: input.scopeKind,
					scopeRefId: input.scopeRefId,
					version: input.version,
					validFrom: new Date(),
					validTo: null,
					...toTypedColumns(input.type, input.value),
				};
				this.values.push(record);
				return record;
			},

			createAudit: async (input: CreateAuditInput): Promise<void> => {
				this.auditLog.push({
					...input,
					id: this.newId('audit'),
					at: new Date(),
				});
			},
		};
	}
}
