import { createEngine } from '../engine/engine';
import { createTypedEngine } from './typed-engine';

interface Registry {
	'chama.contributionAmount': { value: number; scope: 'group' | 'member' };
	'chama.currency': { value: string; scope: 'group' | 'member' };
	'ui.theme': { value: 'light' | 'dark' | 'system'; scope: 'user' };
}

describe('createTypedEngine', () => {
	async function setup() {
		const engine = createEngine();
		await engine.storage.createDef({
			key: 'chama.contributionAmount',
			label: 'Contribution amount',
			type: 'NUMERIC',
			scopes: ['group', 'member'],
			inherit: 'INHERITABLE_OVERRIDABLE',
			required: false,
			status: 'STABLE',
		});
		await engine.storage.createDef({
			key: 'chama.currency',
			label: 'Currency',
			type: 'TEXT',
			scopes: ['group', 'member'],
			inherit: 'INHERITABLE_OVERRIDABLE',
			required: false,
			status: 'STABLE',
		});
		await engine.storage.createDef({
			key: 'ui.theme',
			label: 'Theme',
			type: 'ENUM',
			options: ['light', 'dark', 'system'],
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
		return createTypedEngine<Registry>(engine);
	}

	it('set()/get() round-trip through the typed wrapper and infer the value type', async () => {
		const { resolver, writer } = await setup();

		await writer.set({
			key: 'chama.contributionAmount',
			scope: { kind: 'group', refId: 'g1' },
			value: 5000,
			authorId: 'admin',
		});

		const value = await resolver.get('chama.contributionAmount', {
			kind: 'group',
			refId: 'g1',
		});
		expect(value).toBe(5000);
	});

	it('getMany() returns a record keyed by the requested keys', async () => {
		const { resolver, writer } = await setup();

		await writer.set({
			key: 'chama.contributionAmount',
			scope: { kind: 'group', refId: 'g1' },
			value: 5000,
			authorId: 'admin',
		});
		await writer.set({
			key: 'chama.currency',
			scope: { kind: 'group', refId: 'g1' },
			value: 'KES',
			authorId: 'admin',
		});

		const values = await resolver.getMany(
			['chama.contributionAmount', 'chama.currency'] as const,
			{ kind: 'group', refId: 'g1' },
		);
		expect(values).toEqual({
			'chama.contributionAmount': 5000,
			'chama.currency': 'KES',
		});
	});

	it('unset() and auditor.history() stay wired to the underlying engine', async () => {
		const { writer, resolver, auditor } = await setup();

		await writer.set({
			key: 'ui.theme',
			scope: { kind: 'user', refId: 'u1' },
			value: 'dark',
			authorId: 'u1',
		});
		await writer.unset({
			key: 'ui.theme',
			scope: { kind: 'user', refId: 'u1' },
			expectedVersion: 1,
			authorId: 'u1',
		});

		await expect(
			resolver.get('ui.theme', { kind: 'user', refId: 'u1' }),
		).rejects.toThrow();

		const history = await auditor.history('ui.theme', {
			kind: 'user',
			refId: 'u1',
		});
		expect(history.map((h) => h.action)).toEqual(['created', 'unset']);
	});

	it('listAt() surfaces registry keys explicitly set at a scope', async () => {
		const { resolver, writer } = await setup();

		await writer.set({
			key: 'ui.theme',
			scope: { kind: 'user', refId: 'u1' },
			value: 'light',
			authorId: 'u1',
		});

		const { entries } = await resolver.listAt({
			kind: 'user',
			refId: 'u1',
		});
		expect(entries['ui.theme']).toBe('light');
	});
});
