import { withHierarchyInvalidation } from './hierarchy-cache-sync';
import { Cache } from '../cache/cache';
import { LocalBus } from '../cache/change-bus';
import { LocalScopeHierarchy } from '../hierarchy/scope-hierarchy';

describe('withHierarchyInvalidation', () => {
	function setup() {
		const bus = new LocalBus();
		const raw = new LocalScopeHierarchy();
		const cache = new Cache(bus, {}, raw);
		const hierarchy = withHierarchyInvalidation(raw, cache);
		return { cache, hierarchy };
	}

	it('move() drops cache only for the moved subtree, leaving unrelated scopes untouched', async () => {
		const { cache, hierarchy } = setup();
		await hierarchy.attach('org-1', null);
		await hierarchy.attach('org-2', null);
		await hierarchy.attach('team-1', 'org-1');
		await hierarchy.attach('user-1', 'team-1');

		cache.set('k', { kind: 'org', refId: 'org-1' }, 'org1-value');
		cache.set('k', { kind: 'org', refId: 'org-2' }, 'org2-value');
		cache.set('k', { kind: 'team', refId: 'team-1' }, 'team1-value');
		cache.set('k', { kind: 'user', refId: 'user-1' }, 'user1-value');

		await hierarchy.move('team-1', 'org-2');

		expect(
			cache.get('k', { kind: 'team', refId: 'team-1' }),
		).toBeUndefined();
		expect(
			cache.get('k', { kind: 'user', refId: 'user-1' }),
		).toBeUndefined();
		expect(cache.get('k', { kind: 'org', refId: 'org-1' })).toBe(
			'org1-value',
		);
		expect(cache.get('k', { kind: 'org', refId: 'org-2' })).toBe(
			'org2-value',
		);
	});

	it('detach() drops cache for the detached node and its former descendants', async () => {
		const { cache, hierarchy } = setup();
		await hierarchy.attach('org-1', null);
		await hierarchy.attach('team-1', 'org-1');
		await hierarchy.attach('user-1', 'team-1');
		await hierarchy.attach('team-2', 'org-1');

		cache.set('k', { kind: 'org', refId: 'org-1' }, 'org1-value');
		cache.set('k', { kind: 'team', refId: 'team-1' }, 'team1-value');
		cache.set('k', { kind: 'user', refId: 'user-1' }, 'user1-value');
		cache.set('k', { kind: 'team', refId: 'team-2' }, 'team2-value');

		await hierarchy.detach('team-1');

		expect(
			cache.get('k', { kind: 'team', refId: 'team-1' }),
		).toBeUndefined();
		expect(
			cache.get('k', { kind: 'user', refId: 'user-1' }),
		).toBeUndefined();
		expect(cache.get('k', { kind: 'org', refId: 'org-1' })).toBe(
			'org1-value',
		);
		expect(cache.get('k', { kind: 'team', refId: 'team-2' })).toBe(
			'team2-value',
		);
	});

	it('attach() drops any stale cache for the newly attached node', async () => {
		const { cache, hierarchy } = setup();
		await hierarchy.attach('org-1', null);

		cache.set('k', { kind: 'org', refId: 'org-1' }, 'org1-value');
		cache.set('k', { kind: 'team', refId: 'team-1' }, 'stale-value');

		await hierarchy.attach('team-1', 'org-1');

		expect(
			cache.get('k', { kind: 'team', refId: 'team-1' }),
		).toBeUndefined();
		expect(cache.get('k', { kind: 'org', refId: 'org-1' })).toBe(
			'org1-value',
		);
	});
});
