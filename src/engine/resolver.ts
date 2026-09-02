import type {
	DefRecord,
	Scope,
	ScopeHierarchy,
	Value,
	ValueRecord,
} from '../core/types';
import { DEFAULT_SCOPE } from '../core/types';
import {
	CorruptError,
	RequiredError,
	ScopeError,
	NotFoundError,
} from '../core/errors';
import type { StorageReader } from '../storage/storage-port';
import type { Cache } from '../cache/cache';

export class Resolver {
	constructor(
		private readonly storage: StorageReader,
		private readonly hierarchy?: ScopeHierarchy,
		private readonly cache?: Cache,
	) {}

	async get(key: string, scope: Scope, asOf?: Date): Promise<Value> {
		const result = await this.getMany([key], scope, asOf);
		return result[key];
	}

	async getMany(
		keys: string[],
		scope: Scope,
		asOf?: Date,
	): Promise<Record<string, Value>> {
		const uniqueKeys = [...new Set(keys)];
		const result: Record<string, Value> = {};
		const uncached: string[] = [];

		if (asOf === undefined) {
			for (const key of uniqueKeys) {
				const cached = this.cache?.get(key, scope);
				if (cached !== undefined) result[key] = cached;
				else uncached.push(key);
			}
		} else {
			uncached.push(...uniqueKeys);
		}
		if (uncached.length === 0) return result;

		const defByKey = await this.getDefs(uncached);
		for (const key of uncached) {
			this.checkScope(defByKey.get(key)!, scope);
		}

		const exactDefs: DefRecord[] = [];
		const chainDefs: DefRecord[] = [];
		for (const key of uncached) {
			const def = defByKey.get(key)!;
			const climbsHierarchy =
				def.inherit !== 'INDEPENDENT' &&
				scope.refId !== null &&
				this.hierarchy;
			(climbsHierarchy ? chainDefs : exactDefs).push(def);
		}

		const chain =
			chainDefs.length > 0 && scope.refId !== null && this.hierarchy
				? await this.hierarchy.chain(scope.refId)
				: [];

		const [exactRows, chainRows] = await Promise.all([
			exactDefs.length > 0
				? this.storage.findValues({
						definitionIds: exactDefs.map((d) => d.id),
						scopeKind: scope.kind,
						scopeRefId: scope.refId,
						asOf,
					})
				: Promise.resolve([] as ValueRecord[]),
			chainDefs.length > 0 && chain.length > 0
				? this.storage.findChainValues({
						definitionIds: chainDefs.map((d) => d.id),
						chain,
						asOf,
					})
				: Promise.resolve([] as ValueRecord[]),
		]);

		const exactByDef = new Map(exactRows.map((r) => [r.definitionId, r]));
		const chainByDef = new Map<string, ValueRecord[]>();
		for (const row of chainRows) {
			const list = chainByDef.get(row.definitionId) ?? [];
			list.push(row);
			chainByDef.set(row.definitionId, list);
		}
		const chainDefIds = new Set(chainDefs.map((d) => d.id));

		const missing: DefRecord[] = [];
		for (const key of uncached) {
			const def = defByKey.get(key)!;
			let row: ValueRecord | undefined;
			if (chainDefIds.has(def.id)) {
				const byRef = new Map(
					(chainByDef.get(def.id) ?? []).map((v) => [
						v.scopeRefId,
						v,
					]),
				);
				for (const ref of chain) {
					row = byRef.get(ref);
					if (row) break;
				}
			} else {
				row = exactByDef.get(def.id);
			}
			if (row) {
				result[key] = this.unwrap(def, row);
				if (asOf === undefined)
					this.cache?.set(key, scope, result[key]);
			} else {
				missing.push(def);
			}
		}

		if (missing.length > 0)
			await this.resolveMissing(
				missing,
				scope,
				uncached,
				defByKey,
				result,
				asOf,
			);

		return result;
	}

	private async resolveMissing(
		missing: DefRecord[],
		scope: Scope,
		keysInOrder: string[],
		defByKey: Map<string, DefRecord>,
		result: Record<string, Value>,
		asOf?: Date,
	): Promise<void> {
		const defaultRows = await this.storage.findValues({
			definitionIds: missing.map((d) => d.id),
			scopeKind: DEFAULT_SCOPE.kind,
			scopeRefId: DEFAULT_SCOPE.refId,
		});
		const defaultByDef = new Map(
			defaultRows.map((r) => [r.definitionId, r]),
		);
		const missingIds = new Set(missing.map((d) => d.id));

		for (const key of keysInOrder) {
			const def = defByKey.get(key)!;
			if (!missingIds.has(def.id)) continue;
			const row = defaultByDef.get(def.id);
			if (!row) {
				throw new RequiredError(def.key, scope.kind, scope.refId);
			}
			result[key] = this.unwrap(def, row);
			if (asOf === undefined) this.cache?.set(key, scope, result[key]);
		}
	}

	private async getDefs(keys: string[]): Promise<Map<string, DefRecord>> {
		const defs = await this.storage.findDefs(keys);
		const byKey = new Map(defs.map((d) => [d.key, d]));
		for (const key of keys) {
			if (!byKey.has(key)) throw new NotFoundError(key);
		}
		return byKey;
	}

	private checkScope(def: DefRecord, scope: Scope): void {
		if (scope.kind === 'default') return;
		if (!def.scopes.includes(scope.kind)) {
			throw new ScopeError(def.key, scope.kind);
		}
	}

	private unwrap(def: DefRecord, row: ValueRecord): Value {
		switch (def.type) {
			case 'BOOLEAN':
				if (row.bool === null) throw new CorruptError(row.id);
				return row.bool;
			case 'NUMERIC':
				if (row.num === null) throw new CorruptError(row.id);
				return row.num;
			case 'TEXT':
			case 'ENUM':
				if (row.text === null) throw new CorruptError(row.id);
				return row.text;
			case 'JSON':
				if (!row.jsonSet) throw new CorruptError(row.id);
				return row.json as Value;
			case 'DATE':
				if (row.date === null) throw new CorruptError(row.id);
				return row.date;
		}
	}
}
