# Changelog

All notable changes to `conftree` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This package was previously published as `@nrabehar/sfleg`; `conftree` starts its own version history at 0.1.0.

## [Unreleased]

### Added

- Category-based filtering: `storage.listValues({ category })` and `resolver.listAt(scope, { category })`, filtered server-side (correct pagination, not a client-side filter).
- `TypedEngine.category(name)`: a fully-typed sub-engine (`resolver`/`writer`/`auditor`) narrowed at compile time to the keys declared with that `category` in the registry. A runtime check (`CategoryError`, code `'CATEGORY'`) catches any access to a key from another category if a caller bypasses the type narrowing (e.g. via `as any`).
- `storage.listDefs(status?, category?)`: added a `category` filter alongside the existing `status` filter.
- `storage.listCategories()`: lists every distinct category currently in use, across the latest version of each definition.

### Fixed

- `listDefs()` returned every version of a key instead of only the latest one when a definition had been redefined more than once.

## [0.2.0] - 2026-09-03

### Added

- `ChangeBus.unsubscribe()` and `Cache.dispose()`, so a `Cache` bound to a shared, long-lived bus (e.g. Redis-backed, in a server process) can stop listening instead of leaking a subscription forever.

## [0.1.1] - 2026-09-03

### Fixed

- `MemoryStorageAdapter.transact()` did not roll back partial writes on failure — a failing `setMany()` could leave earlier writes in the batch committed.
- A `ChangeBus` publish failure (e.g. a broken cache-invalidation listener) made `writer.set()`/`setMany()`/`unset()` reject even though the underlying write had already succeeded.
- `LocalScopeHierarchy.attach()` left a stale parent→child reference behind when re-attaching an already-attached scope without going through `move()`/`detach()` first, corrupting `children()`/`descendants()`.
- Historical reads (`asOf`) ignored the timestamp when falling back to the `default` scope, returning the current default instead of the one in effect at that date.
- Setting a `JSON` value to `undefined` was silently accepted as valid (`JSON.stringify(undefined)` doesn't throw), corrupting the stored record.
- `storage.updateDefStatus()` mutated the `DefRecord` in place, retroactively changing any reference obtained before the call (e.g. from `findDefs()`).
- `closeValue()` had the same retroactive-mutation issue on `ValueRecord`.

## [0.1.0] - 2026-09-03

Initial release under the `conftree` name.

### Added

- `writer.unset()`: revert a scope back to its inherited or default value.
- `auditor.history(key, scope?)`: read the audit trail for a setting.
- `resolver.listAt(scope, { limit?, cursor? })`: paginated listing of every setting explicitly set at a scope.
- `storage.updateDefStatus(key, status)`: deprecate or retire a definition (retired definitions stop being readable/writable but keep their audit history).
- Typed settings registry: `createTypedEngine<Registry>(engine)` for compile-time-checked keys, scopes, and value types.
- All errors now extend `ConfTreeError` and carry a stable `code` (e.g. `'CONFLICT'`, `'NOT_FOUND'`).
