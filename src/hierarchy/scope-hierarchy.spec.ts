import { LocalScopeHierarchy } from './scope-hierarchy';
import { CycleError } from '../core/errors';

describe('LocalScopeHierarchy', () => {
	let hierarchy: LocalScopeHierarchy;

	beforeEach(() => {
		hierarchy = new LocalScopeHierarchy();
	});

	async function buildTree() {
		await hierarchy.attach('org-1', null);
		await hierarchy.attach('team-1', 'org-1');
		await hierarchy.attach('team-2', 'org-1');
		await hierarchy.attach('user-1', 'team-1');
		await hierarchy.attach('user-2', 'team-1');
	}

	it('chain() returns self then ancestors, closest first', async () => {
		await buildTree();
		expect(await hierarchy.chain('user-1')).toEqual([
			'user-1',
			'team-1',
			'org-1',
		]);
		expect(await hierarchy.chain('org-1')).toEqual(['org-1']);
	});

	it('descendants() returns self and every node below, in any order', async () => {
		await buildTree();
		const desc = await hierarchy.descendants('team-1');
		expect(new Set(desc)).toEqual(new Set(['team-1', 'user-1', 'user-2']));

		const orgDesc = await hierarchy.descendants('org-1');
		expect(new Set(orgDesc)).toEqual(
			new Set(['org-1', 'team-1', 'team-2', 'user-1', 'user-2']),
		);
	});

	it('children() returns only direct children', async () => {
		await buildTree();
		expect(new Set(await hierarchy.children('org-1'))).toEqual(
			new Set(['team-1', 'team-2']),
		);
		expect(await hierarchy.children('user-1')).toEqual([]);
	});

	it('parent() returns the direct parent, or null for a root/unknown scope', async () => {
		await buildTree();
		expect(await hierarchy.parent('user-1')).toBe('team-1');
		expect(await hierarchy.parent('org-1')).toBeNull();
		expect(await hierarchy.parent('never-attached')).toBeNull();
	});

	it('attach() rejects a scope attached under itself', async () => {
		await hierarchy.attach('a', null);
		await expect(hierarchy.attach('a', 'a')).rejects.toThrow(CycleError);
	});

	it('attach() rejects a cycle formed via a descendant', async () => {
		await buildTree();
		await expect(hierarchy.attach('org-1', 'team-1')).rejects.toThrow(
			CycleError,
		);
	});

	it('move() reparents a subtree and updates chain()/children() accordingly', async () => {
		await buildTree();
		await hierarchy.move('team-1', 'team-2');

		expect(await hierarchy.chain('user-1')).toEqual([
			'user-1',
			'team-1',
			'team-2',
			'org-1',
		]);
		expect(await hierarchy.children('org-1')).toEqual(['team-2']);
		expect(await hierarchy.children('team-2')).toEqual(['team-1']);
	});

	it('move() rejects a move that would create a cycle', async () => {
		await buildTree();
		await expect(hierarchy.move('org-1', 'user-1')).rejects.toThrow(
			CycleError,
		);
	});

	it("detach() promotes direct children to the removed scope's own parent (no orphans, no cascade)", async () => {
		await buildTree();
		await hierarchy.detach('team-1');

		expect(await hierarchy.parent('user-1')).toBe('org-1');
		expect(await hierarchy.parent('user-2')).toBe('org-1');
		expect(new Set(await hierarchy.children('org-1'))).toEqual(
			new Set(['team-2', 'user-1', 'user-2']),
		);
		expect(await hierarchy.chain('team-1')).toEqual(['team-1']);
	});

	it('detach() on a root scope leaves its children as new roots', async () => {
		await buildTree();
		await hierarchy.detach('org-1');

		expect(await hierarchy.parent('team-1')).toBeNull();
		expect(await hierarchy.parent('team-2')).toBeNull();
		expect(await hierarchy.chain('user-1')).toEqual(['user-1', 'team-1']);
	});
});
