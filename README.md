# sfleg

[![Socket Badge](https://badge.socket.dev/npm/package/@nrabehar/sfleg/0.0.1)](https://badge.socket.dev/npm/package/@nrabehar/sfleg/0.0.1)

Generic hierarchical configuration engine. Arbitrary scopes, inheritance, caching, audit trail. Zero required dependencies: works standalone or with any storage/pub-sub backend.

## Install

```bash
npm install @nrabehar/sfleg
```

## Usage

```ts
import { createEngine } from '@nrabehar/sfleg';

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

### Writing an adapter

Implement `StorageAdapter`, `ScopeHierarchy`, or `ChangeBus`, all defined in `src/storage/storage-port.ts`, `src/core/types.ts`, and `src/cache/change-bus.ts`. `MemoryStorageAdapter` and `LocalScopeHierarchy` are the reference implementations.

## API

- `createEngine(options?)`: returns `{ storage, hierarchy, bus, cache, resolver, writer, auditor }`.
- `resolver.get(key, scope, asOf?)`, `resolver.getMany(keys, scope, asOf?)`, `resolver.listAt(scope, { limit?, cursor? })`
- `writer.set(params)`, `writer.setMany(paramsList)`, `writer.unset(params)`
- `auditor.history(key, scope?)`
- `storage.updateDefStatus(key, status)`

### Errors

All errors extend `SflegError` and carry a stable `code` (e.g. `'CONFLICT'`, `'NOT_FOUND'`), in addition to a specific class (`ConflictError`, `NotFoundError`, ...) and `name`.

## License

MIT
