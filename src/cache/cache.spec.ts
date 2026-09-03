import { Cache } from './cache';
import { LocalBus } from './change-bus';
import { LocalScopeHierarchy } from '../hierarchy/scope-hierarchy';

describe('Cache', () => {
	it('serves a value until it expires (TTL)', () => {
		jest.useFakeTimers();
		const bus = new LocalBus();
		const cache = new Cache(bus, { ttlMs: 1000 });
		const scope = { kind: 'user', refId: 'u1' };

		cache.set('k', scope, 'v1');
		expect(cache.get('k', scope)).toBe('v1');

		jest.advanceTimersByTime(1001);
		expect(cache.get('k', scope)).toBeUndefined();
		jest.useRealTimers();
	});

	it('respects maxEntries with FIFO eviction', () => {
		const bus = new LocalBus();
		const cache = new Cache(bus, { maxEntries: 2 });

		cache.set('a', { kind: 'user', refId: '1' }, 'va');
		cache.set('b', { kind: 'user', refId: '1' }, 'vb');
		cache.set('c', { kind: 'user', refId: '1' }, 'vc');

		expect(cache.get('a', { kind: 'user', refId: '1' })).toBeUndefined();
		expect(cache.get('b', { kind: 'user', refId: '1' })).toBe('vb');
		expect(cache.get('c', { kind: 'user', refId: '1' })).toBe('vc');
	});

	it('without a hierarchy, a write invalidates the key across ALL scopes (blanket fallback)', async () => {
		const bus = new LocalBus();
		const cache = new Cache(bus);

		cache.set('k', { kind: 'user', refId: 'alice' }, 'a');
		cache.set('k', { kind: 'user', refId: 'bob' }, 'b');

		await bus.publish({
			definitionId: 'd1',
			key: 'k',
			scopeKind: 'user',
			scopeRefId: 'alice',
		});

		expect(
			cache.get('k', { kind: 'user', refId: 'alice' }),
		).toBeUndefined();
		expect(cache.get('k', { kind: 'user', refId: 'bob' })).toBeUndefined();
	});

	it('with a hierarchy, a write invalidates only the changed scope and its descendants', async () => {
		const bus = new LocalBus();
		const hierarchy = new LocalScopeHierarchy();
		await hierarchy.attach('org-1', null);
		await hierarchy.attach('team-1', 'org-1');
		await hierarchy.attach('team-2', 'org-1');
		const cache = new Cache(bus, {}, hierarchy);

		cache.set('k', { kind: 'org', refId: 'org-1' }, 'org-value');
		cache.set('k', { kind: 'team', refId: 'team-1' }, 'team1-value');
		cache.set('k', { kind: 'team', refId: 'team-2' }, 'team2-value');

		await bus.publish({
			definitionId: 'd1',
			key: 'k',
			scopeKind: 'team',
			scopeRefId: 'team-1',
		});

		expect(
			cache.get('k', { kind: 'team', refId: 'team-1' }),
		).toBeUndefined();
		expect(cache.get('k', { kind: 'team', refId: 'team-2' })).toBe(
			'team2-value',
		);
		expect(cache.get('k', { kind: 'org', refId: 'org-1' })).toBe(
			'org-value',
		);
	});

	it('dropForScopes() clears every key at the given scope refIds, leaving other scopes untouched', () => {
		const bus = new LocalBus();
		const cache = new Cache(bus);

		cache.set('a', { kind: 'team', refId: 'team-1' }, 'a-team1');
		cache.set('b', { kind: 'team', refId: 'team-1' }, 'b-team1');
		cache.set('a', { kind: 'team', refId: 'team-2' }, 'a-team2');

		cache.dropForScopes(['team-1']);

		expect(
			cache.get('a', { kind: 'team', refId: 'team-1' }),
		).toBeUndefined();
		expect(
			cache.get('b', { kind: 'team', refId: 'team-1' }),
		).toBeUndefined();
		expect(cache.get('a', { kind: 'team', refId: 'team-2' })).toBe(
			'a-team2',
		);
	});

	it('with a hierarchy, invalidating an ancestor also invalidates its descendants', async () => {
		const bus = new LocalBus();
		const hierarchy = new LocalScopeHierarchy();
		await hierarchy.attach('org-1', null);
		await hierarchy.attach('team-1', 'org-1');
		const cache = new Cache(bus, {}, hierarchy);

		cache.set('k', { kind: 'org', refId: 'org-1' }, 'org-value');
		cache.set('k', { kind: 'team', refId: 'team-1' }, 'team-value');

		await bus.publish({
			definitionId: 'd1',
			key: 'k',
			scopeKind: 'org',
			scopeRefId: 'org-1',
		});

		expect(cache.get('k', { kind: 'org', refId: 'org-1' })).toBeUndefined();
		expect(
			cache.get('k', { kind: 'team', refId: 'team-1' }),
		).toBeUndefined();
	});

	it('dispose() stops the cache from reacting to further bus events, without affecting other subscribers', async () => {
		const bus = new LocalBus();
		const cache = new Cache(bus);
		const scope = { kind: 'user', refId: 'u1' };
		cache.set('k', scope, 'v1');

		cache.dispose();

		await bus.publish({
			definitionId: 'd1',
			key: 'k',
			scopeKind: 'user',
			scopeRefId: 'u1',
		});

		expect(cache.get('k', scope)).toBe('v1');
	});
});
