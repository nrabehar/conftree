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
await hierarchy.attach('team-1', 'org-1');
await hierarchy.move('team-1', 'org-2');
await hierarchy.detach('team-1');
```

### Writing an adapter

Implement `StorageAdapter`, `ScopeHierarchy`, or `ChangeBus`, all defined in `src/storage/storage-port.ts`, `src/core/types.ts`, and `src/cache/change-bus.ts`. `MemoryStorageAdapter` and `LocalScopeHierarchy` are the reference implementations.

## API

- `createEngine(options?)`: returns `{ storage, hierarchy, bus, cache, resolver, writer }`.
- `resolver.get(key, scope, asOf?)`, `resolver.getMany(keys, scope, asOf?)`
- `writer.set(params)`, `writer.setMany(paramsList)`

## License

MIT
