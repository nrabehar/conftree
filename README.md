# conftree

[![Socket Badge](https://badge.socket.dev/npm/package/conftree/0.1.0)](https://badge.socket.dev/npm/package/conftree/0.1.0)

Generic hierarchical configuration engine. Arbitrary scopes, inheritance, caching, audit trail. Zero required dependencies: works standalone or with any storage/pub-sub backend.

## Install

```bash
npm install conftree
```

## Usage

```ts
import { createEngine } from 'conftree';

const { storage, resolver, writer } = createEngine();

await storage.createDef({
	key: 'ui.theme',
	label: 'Theme',
	type: 'ENUM',
	options: ['light', 'dark', 'system'],
	scopes: ['user'],
	inherit: 'INDEPENDENT',
	required: false,
	status: 'STABLE',
});

await writer.set({
	key: 'ui.theme',
	scope: { kind: 'user', refId: 'u1' },
	value: 'dark',
	authorId: 'u1',
});
await resolver.get('ui.theme', { kind: 'user', refId: 'u1' }); // 'dark'
```

Revert a scope back to its inherited or default value:

```ts
await writer.unset({
	key: 'ui.theme',
	scope: { kind: 'user', refId: 'u1' },
	authorId: 'u1',
});
```

Inspect the audit trail for a setting:

```ts
const { auditor } = createEngine();
await auditor.history('ui.theme', { kind: 'user', refId: 'u1' });
// [{ action: 'created', authorId: 'u1', after: {...}, at: ... }, ...]
```

List every setting explicitly set at a scope (paginated):

```ts
const { entries, nextCursor } = await resolver.listAt({
	kind: 'user',
	refId: 'u1',
});
// { entries: { 'ui.theme': 'dark', 'ui.pageSize': 20 }, nextCursor: null }
```

Deprecate or retire a definition (retired definitions stop being readable and writable, but keep their audit history):

```ts
await storage.updateDefStatus('ui.theme', 'RETIRED');
```

Bring your own storage or pub/sub backend:

```ts
const { resolver, writer } = createEngine({
	storage: new MyPostgresAdapter(pool),
	hierarchy: new MyClosureTableHierarchy(pool),
	bus: new MyRedisBus(redisClient),
});
```

If you create engines repeatedly against a shared, long-lived bus (e.g. a Redis-backed one in a server process), call `cache.dispose()` when an engine is no longer needed — otherwise its cache stays subscribed to the bus forever:

```ts
const { cache } = createEngine({ bus: sharedRedisBus });
// ...later, e.g. on module teardown:
cache.dispose();
```

### Value types

`BOOLEAN`, `NUMERIC`, `TEXT`, `ENUM`, `JSON`, `DATE`.

### Hierarchy

```ts
const { hierarchy } = createEngine();
await hierarchy.attach('org-1', null);
await hierarchy.attach('org-2', null);
await hierarchy.attach('team-1', 'org-1');
await hierarchy.move('team-1', 'org-2');
await hierarchy.detach('team-1');
```

### Typed settings registry

Get autocomplete and compile-time checking on keys, scopes, and value types by declaring your settings once and wrapping the engine:

```ts
import { createEngine, createTypedEngine } from 'conftree';

interface Registry {
	'ui.theme': { value: 'light' | 'dark' | 'system'; scope: 'user' };
	'chama.contributionAmount': { value: number; scope: 'group' | 'member' };
}

const { resolver, writer } = createTypedEngine<Registry>(createEngine());

await writer.set({
	key: 'ui.theme',
	scope: { kind: 'user', refId: 'u1' },
	value: 'dark', // only 'light' | 'dark' | 'system' is accepted
	authorId: 'u1',
});
await resolver.get('ui.theme', { kind: 'user', refId: 'u1' }); // typed 'light' | 'dark' | 'system'
```

`Registry` must be a plain interface/type (not `extends` anything with an index signature) for key-level narrowing to work — see `src/typed/registry.ts` for the `SettingValue`/`SettingScopeKind` helpers this is built on.

#### Scoping to a category

Tag registry entries with `category` (matching the `category` you pass to `storage.createDef`) to derive a fully-typed sub-engine for just that subset of keys — `get`/`set`/`unset` are narrowed at compile time, and `listAt` is filtered server-side (correct pagination, not a client-side `Array.filter`):

```ts
interface Registry {
	'ui.theme': { value: 'light' | 'dark' | 'system'; scope: 'user' };
	'chama.contributionAmount': {
		value: number;
		scope: 'group' | 'member';
		category: 'chama';
	};
	'chama.currency': {
		value: string;
		scope: 'group' | 'member';
		category: 'chama';
	};
}

const engine = createTypedEngine<Registry>(createEngine());
const chama = engine.category('chama');

await chama.writer.set({
	key: 'chama.contributionAmount', // 'ui.theme' would be a compile error here
	scope: { kind: 'group', refId: 'g1' },
	value: 5000,
	authorId: 'admin',
});

await chama.resolver.listAt({ kind: 'group', refId: 'g1' });
// { entries: { 'chama.contributionAmount': 5000, 'chama.currency': 'KES' }, nextCursor: null }
// — only chama.* keys, even if other categories are also set at that scope
```

A key with no `category` in the registry (like `ui.theme` above) simply never shows up in any `category(...)` view.

`get`/`set`/`unset`/`history` on a `category(...)` accessor are narrowed at compile time — but if a caller bypasses that with `as any`, a runtime check still catches it and throws `CategoryError` (code `'CATEGORY'`) rather than silently touching a setting from another category.

### Writing an adapter

Implement `StorageAdapter`, `ScopeHierarchy`, or `ChangeBus`, all defined in `src/storage/storage-port.ts`, `src/core/types.ts`, and `src/cache/change-bus.ts`. `MemoryStorageAdapter` and `LocalScopeHierarchy` are the reference implementations.

## API

- `createEngine(options?)`: returns `{ storage, hierarchy, bus, cache, resolver, writer, auditor }`.
- `resolver.get(key, scope, asOf?)`, `resolver.getMany(keys, scope, asOf?)`, `resolver.listAt(scope, { limit?, cursor?, category? })`
- `writer.set(params)`, `writer.setMany(paramsList)`, `writer.unset(params)`
- `auditor.history(key, scope?)`
- `storage.updateDefStatus(key, status)`
- `storage.listDefs(status?, category?)`, `storage.listCategories()`
- `createTypedEngine<Registry>(engine)`: returns `{ resolver, writer, auditor, category(name) }` typed against your own key/value/scope/category registry. `category(name)` returns the same shape, narrowed to that category's keys.

### Errors

All errors extend `ConfTreeError` and carry a stable `code` (e.g. `'CONFLICT'`, `'NOT_FOUND'`, `'CATEGORY'`), in addition to a specific class (`ConflictError`, `NotFoundError`, `CategoryError`, ...) and `name`.

## License

MIT
