import type { Scope, ScopeHierarchy, Value } from '../core/types';
import type { ChangeBus, ChangeEvent, ChangeListener } from './change-bus';

export interface CacheOptions {
	enabled?: boolean;
	ttlMs?: number;
	maxEntries?: number;
}

interface Entry {
	key: string;
	scopeKind: string;
	scopeRefId: string | null;
	value: Value;
	expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 50_000;

export class Cache {
	private readonly store = new Map<string, Entry>();
	private readonly listener: ChangeListener = (event) => this.onChange(event);

	constructor(
		private readonly bus: ChangeBus,
		private readonly options: CacheOptions = {},
		private readonly hierarchy?: ScopeHierarchy,
	) {
		this.bus.subscribe(this.listener);
	}

	dispose(): void {
		this.bus.unsubscribe(this.listener);
	}

	get(key: string, scope: Scope): Value | undefined {
		if (this.options.enabled === false) return undefined;
		const cacheKey = this.keyFor(key, scope);
		const entry = this.store.get(cacheKey);
		if (!entry) return undefined;
		if (entry.expiresAt <= Date.now()) {
			this.store.delete(cacheKey);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, scope: Scope, value: Value): void {
		if (this.options.enabled === false) return;
		const cacheKey = this.keyFor(key, scope);
		if (
			!this.store.has(cacheKey) &&
			this.store.size >= (this.options.maxEntries ?? DEFAULT_MAX_ENTRIES)
		) {
			const oldest = this.store.keys().next().value;
			if (oldest !== undefined) this.store.delete(oldest);
		}
		const ttlMs = this.options.ttlMs ?? DEFAULT_TTL_MS;
		this.store.set(cacheKey, {
			key,
			scopeKind: scope.kind,
			scopeRefId: scope.refId,
			value,
			expiresAt: Date.now() + ttlMs,
		});
	}

	drop(key: string): void {
		for (const [cacheKey, entry] of this.store) {
			if (entry.key === key) this.store.delete(cacheKey);
		}
	}

	dropAll(): void {
		this.store.clear();
	}

	dropForScopes(scopeRefIds: Iterable<string>): void {
		const targets = new Set(scopeRefIds);
		if (targets.size === 0) return;
		for (const [cacheKey, entry] of this.store) {
			if (entry.scopeRefId !== null && targets.has(entry.scopeRefId)) {
				this.store.delete(cacheKey);
			}
		}
	}

	private dropScoped(key: string, scopeRefIds: Iterable<string>): void {
		const targets = new Set(scopeRefIds);
		for (const [cacheKey, entry] of this.store) {
			if (
				entry.key === key &&
				entry.scopeRefId !== null &&
				targets.has(entry.scopeRefId)
			) {
				this.store.delete(cacheKey);
			}
		}
	}

	private async onChange(event: ChangeEvent): Promise<void> {
		if (this.hierarchy && event.scopeRefId !== null) {
			const descendants = await this.hierarchy
				.descendants(event.scopeRefId)
				.catch(() => null);
			if (descendants !== null) {
				this.dropScoped(event.key, descendants);
				return;
			}
		}
		this.drop(event.key);
	}

	private keyFor(key: string, scope: Scope): string {
		return JSON.stringify([key, scope.kind, scope.refId]);
	}
}
