import type { DefRecord, Scope, Value, ValueRecord } from '../core/types';
import {
	ConflictError,
	ScopeError,
	ValueError,
	NotFoundError,
} from '../core/errors';
import type { StorageAdapter, StorageTx } from '../storage/storage-port';
import type { ChangeBus } from '../cache/change-bus';

export interface SetParams {
	key: string;
	scope: Scope;
	value: Value;
	expectedVersion?: number;
	authorId: string;
	reason?: string;
}

export interface UnsetParams {
	key: string;
	scope: Scope;
	expectedVersion?: number;
	authorId: string;
	reason?: string;
}

const REDACTED = '[redacted]';

export class Writer {
	constructor(
		private readonly storage: StorageAdapter,
		private readonly bus?: ChangeBus,
	) {}

	async set(params: SetParams): Promise<ValueRecord> {
		const created = await this.storage.transact((tx) =>
			this.setInTx(tx, params),
		);
		await this.emit(created, params.key);
		return created;
	}

	async setMany(paramsList: SetParams[]): Promise<ValueRecord[]> {
		const created = await this.storage.transact(async (tx) => {
			const results: ValueRecord[] = [];
			for (const params of paramsList) {
				results.push(await this.setInTx(tx, params));
			}
			return results;
		});
		await Promise.all(
			created.map((row, i) => this.emit(row, paramsList[i].key)),
		);
		return created;
	}

	private async setInTx(
		tx: StorageTx,
		params: SetParams,
	): Promise<ValueRecord> {
		const def = await tx.findDef(params.key);
		if (!def) throw new NotFoundError(params.key);

		if (
			params.scope.kind !== 'default' &&
			!def.scopes.includes(params.scope.kind)
		) {
			throw new ScopeError(def.key, params.scope.kind);
		}

		this.validate(def, params.value);

		const current = await tx.findValue(
			def.id,
			params.scope.kind,
			params.scope.refId,
		);

		const currentVersion = current?.version ?? 0;
		const expected = params.expectedVersion ?? 0;
		if (currentVersion !== expected) {
			throw new ConflictError(
				def.key,
				params.scope.kind,
				params.scope.refId,
			);
		}

		if (current) {
			await tx.closeValue(current.id);
		}

		const created = await tx.createValue({
			definitionId: def.id,
			scopeKind: params.scope.kind,
			scopeRefId: params.scope.refId,
			version: currentVersion + 1,
			authorId: params.authorId,
			reason: params.reason,
			type: def.type,
			value: params.value,
		});

		await tx.createAudit({
			valueId: created.id,
			definitionId: def.id,
			scopeKind: created.scopeKind,
			scopeRefId: created.scopeRefId,
			action: current ? 'superseded' : 'created',
			authorId: params.authorId,
			before: current ? this.snapshotOf(def, current) : undefined,
			after: this.snapshotOf(def, created),
			reason: params.reason,
		});

		return created;
	}

	async unset(params: UnsetParams): Promise<void> {
		const closed = await this.storage.transact((tx) =>
			this.unsetInTx(tx, params),
		);
		if (closed) await this.emit(closed, params.key);
	}

	private async unsetInTx(
		tx: StorageTx,
		params: UnsetParams,
	): Promise<ValueRecord | null> {
		const def = await tx.findDef(params.key);
		if (!def) throw new NotFoundError(params.key);

		if (
			params.scope.kind !== 'default' &&
			!def.scopes.includes(params.scope.kind)
		) {
			throw new ScopeError(def.key, params.scope.kind);
		}

		const current = await tx.findValue(
			def.id,
			params.scope.kind,
			params.scope.refId,
		);

		const currentVersion = current?.version ?? 0;
		const expected = params.expectedVersion ?? 0;
		if (currentVersion !== expected) {
			throw new ConflictError(
				def.key,
				params.scope.kind,
				params.scope.refId,
			);
		}
		if (!current) return null;

		await tx.closeValue(current.id);
		await tx.createAudit({
			valueId: current.id,
			definitionId: def.id,
			scopeKind: current.scopeKind,
			scopeRefId: current.scopeRefId,
			action: 'unset',
			authorId: params.authorId,
			before: this.snapshotOf(def, current),
			reason: params.reason,
		});

		return current;
	}

	private async emit(created: ValueRecord, key: string): Promise<void> {
		await this.bus?.publish({
			definitionId: created.definitionId,
			key,
			scopeKind: created.scopeKind,
			scopeRefId: created.scopeRefId,
		});
	}

	private validate(def: DefRecord, value: Value): void {
		switch (def.type) {
			case 'BOOLEAN':
				if (typeof value !== 'boolean') {
					throw new ValueError(
						`Setting "${def.key}" expects a boolean`,
					);
				}
				break;
			case 'NUMERIC': {
				if (typeof value !== 'number' || !Number.isFinite(value)) {
					throw new ValueError(
						`Setting "${def.key}" expects a finite number`,
					);
				}
				if (def.min !== null && value < def.min) {
					throw new ValueError(
						`Setting "${def.key}" must be >= ${def.min}, got ${value}`,
					);
				}
				if (def.max !== null && value > def.max) {
					throw new ValueError(
						`Setting "${def.key}" must be <= ${def.max}, got ${value}`,
					);
				}
				break;
			}
			case 'TEXT':
				if (typeof value !== 'string') {
					throw new ValueError(
						`Setting "${def.key}" expects a string`,
					);
				}
				break;
			case 'ENUM':
				if (typeof value !== 'string' || !def.options.includes(value)) {
					throw new ValueError(
						`Setting "${def.key}" must be one of: ${def.options.join(', ')}`,
					);
				}
				break;
			case 'JSON':
				try {
					JSON.stringify(value);
				} catch {
					throw new ValueError(
						`Setting "${def.key}" expects a JSON-serializable value`,
					);
				}
				break;
			case 'DATE':
				if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
					throw new ValueError(
						`Setting "${def.key}" expects a valid Date`,
					);
				}
				break;
		}
	}

	private snapshotOf(def: DefRecord, row: ValueRecord) {
		if (def.secret) {
			return {
				scopeKind: row.scopeKind,
				scopeRefId: row.scopeRefId,
				version: row.version,
				value: REDACTED,
			};
		}
		return {
			scopeKind: row.scopeKind,
			scopeRefId: row.scopeRefId,
			version: row.version,
			bool: row.bool,
			num: row.num,
			text: row.text,
			json: row.jsonSet ? row.json : undefined,
			date: row.date,
		};
	}
}
