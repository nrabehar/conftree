import type { ChangeBus } from '../cache/change-bus';
import { LocalBus } from '../cache/change-bus';
import type { CacheOptions } from '../cache/cache';
import { Cache } from '../cache/cache';
import { withHierarchyInvalidation } from './hierarchy-cache-sync';
import { MemoryStorageAdapter } from '../storage/memory-storage';
import { Resolver } from './resolver';
import { LocalScopeHierarchy } from '../hierarchy/scope-hierarchy';
import type { StorageAdapter } from '../storage/storage-port';
import type { ScopeHierarchy } from '../core/types';
import { Writer } from './writer';
import { Auditor } from './auditor';

export interface EngineOptions {
	storage?: StorageAdapter;
	hierarchy?: ScopeHierarchy;
	bus?: ChangeBus;
	cache?: CacheOptions | false;
}

export interface Engine {
	storage: StorageAdapter;
	hierarchy: ScopeHierarchy;
	bus: ChangeBus;
	cache: Cache;
	resolver: Resolver;
	writer: Writer;
	auditor: Auditor;
}

export function createEngine(options: EngineOptions = {}): Engine {
	const storage = options.storage ?? new MemoryStorageAdapter();
	const rawHierarchy = options.hierarchy ?? new LocalScopeHierarchy();
	const bus = options.bus ?? new LocalBus();
	const cacheOptions =
		options.cache === false ? { enabled: false } : (options.cache ?? {});
	const cache = new Cache(bus, cacheOptions, rawHierarchy);
	const hierarchy = withHierarchyInvalidation(rawHierarchy, cache);
	const resolver = new Resolver(storage, hierarchy, cache);
	const writer = new Writer(storage, bus);
	const auditor = new Auditor(storage);
	return { storage, hierarchy, bus, cache, resolver, writer, auditor };
}
