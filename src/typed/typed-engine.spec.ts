import { createEngine } from '../engine/engine';
import { createTypedEngine } from './typed-engine';
import { CategoryError } from '../core/errors';

interface Registry {
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
	'chama.limits.maxContribution': {
		value: number;
		scope: 'group' | 'member';
		category: 'chama';
	};
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
			category: 'chama',
		});
		await engine.storage.createDef({
			key: 'chama.currency',
			label: 'Currency',
			type: 'TEXT',
			scopes: ['group', 'member'],
			inherit: 'INHERITABLE_OVERRIDABLE',
			required: false,
			status: 'STABLE',
			category: 'chama',
		});
		await engine.storage.createDef({
			key: 'chama.limits.maxContribution',
			label: 'Max contribution',
			type: 'NUMERIC',
			scopes: ['group', 'member'],
			inherit: 'INHERITABLE_OVERRIDABLE',
			required: false,
			status: 'STABLE',
			category: 'chama',
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

	describe('category()', () => {
		it('scopes get()/set() to only the keys in that category, at the type level, with unchanged runtime behavior', async () => {
			const { category } = await setup();
			const chama = category('chama');

			await chama.writer.set({
				key: 'chama.contributionAmount',
				scope: { kind: 'group', refId: 'g1' },
				value: 7500,
				authorId: 'admin',
			});

			const value = await chama.resolver.get('chama.contributionAmount', {
				kind: 'group',
				refId: 'g1',
			});
			expect(value).toBe(7500);
		});

		it('listAt() is filtered server-side to only that category, even when other categories are set at the same scope', async () => {
			const { category, writer } = await setup();
			const chama = category('chama');

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

			const { entries } = await chama.resolver.listAt({
				kind: 'group',
				refId: 'g1',
			});

			expect(entries).toEqual({
				'chama.contributionAmount': 5000,
				'chama.currency': 'KES',
			});
		});

		it('a key with no category declared in the registry is excluded from every category view', async () => {
			const { category, writer } = await setup();

			await writer.set({
				key: 'ui.theme',
				scope: { kind: 'user', refId: 'u1' },
				value: 'dark',
				authorId: 'u1',
			});

			const { entries } = await category('chama').resolver.listAt({
				kind: 'user',
				refId: 'u1',
			});

			expect(entries).toEqual({});
		});

		it('throws CategoryError at runtime if a type-unsafe caller bypasses narrowing with a key from another category', async () => {
			const { category } = await setup();
			const chama = category('chama') as unknown as {
				resolver: {
					get: (key: string, scope: unknown) => Promise<unknown>;
				};
				writer: { set: (params: unknown) => Promise<unknown> };
				auditor: { history: (key: string) => Promise<unknown> };
			};

			await expect(
				chama.resolver.get('ui.theme', { kind: 'user', refId: 'u1' }),
			).rejects.toThrow(CategoryError);

			await expect(
				chama.writer.set({
					key: 'ui.theme',
					scope: { kind: 'user', refId: 'u1' },
					value: 'dark',
					authorId: 'u1',
				}),
			).rejects.toThrow(CategoryError);

			await expect(chama.auditor.history('ui.theme')).rejects.toThrow(
				CategoryError,
			);
		});

		it('does not throw for a key that legitimately has no category yet is accessed through the unscoped engine', async () => {
			const { resolver, writer } = await setup();
			await writer.set({
				key: 'ui.theme',
				scope: { kind: 'user', refId: 'u1' },
				value: 'dark',
				authorId: 'u1',
			});

			await expect(
				resolver.get('ui.theme', { kind: 'user', refId: 'u1' }),
			).resolves.toBe('dark');
		});
	});

	describe('short keys on a category() accessor', () => {
		it('set()/get() accept the key with the category prefix stripped', async () => {
			const { category } = await setup();
			const chama = category('chama');

			await chama.writer.set({
				key: 'currency',
				scope: { kind: 'group', refId: 'g1' },
				value: 'KES',
				authorId: 'admin',
			});

			const value = await chama.resolver.get('currency', {
				kind: 'group',
				refId: 'g1',
			});
			expect(value).toBe('KES');
		});

		it('strips only the leading `category.` prefix, keeping the rest of a multi-segment key intact', async () => {
			const { category } = await setup();
			const chama = category('chama');

			await chama.writer.set({
				key: 'limits.maxContribution',
				scope: { kind: 'group', refId: 'g1' },
				value: 10000,
				authorId: 'admin',
			});

			const value = await chama.resolver.get('limits.maxContribution', {
				kind: 'group',
				refId: 'g1',
			});
			expect(value).toBe(10000);
		});

		it('still accepts the full key on a category() accessor, unchanged (backward compatible)', async () => {
			const { category } = await setup();
			const chama = category('chama');

			await chama.writer.set({
				key: 'chama.currency',
				scope: { kind: 'group', refId: 'g1' },
				value: 'KES',
				authorId: 'admin',
			});

			const value = await chama.resolver.get('chama.currency', {
				kind: 'group',
				refId: 'g1',
			});
			expect(value).toBe('KES');
		});

		it('short and full key forms address the exact same underlying setting', async () => {
			const { category } = await setup();
			const chama = category('chama');

			await chama.writer.set({
				key: 'currency',
				scope: { kind: 'group', refId: 'g1' },
				value: 'KES',
				authorId: 'admin',
			});

			await expect(
				chama.resolver.get('chama.currency', {
					kind: 'group',
					refId: 'g1',
				}),
			).resolves.toBe('KES');

			await expect(
				chama.writer.set({
					key: 'chama.currency',
					scope: { kind: 'group', refId: 'g1' },
					value: 'UGX',
					expectedVersion: 1,
					authorId: 'admin',
				}),
			).resolves.toMatchObject({ version: 2 });
		});

		it('getMany() accepts a mix of short and full keys and keys the result the same way it was called', async () => {
			const { category, writer } = await setup();
			const chama = category('chama');

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

			const values = await chama.resolver.getMany(
				['contributionAmount', 'chama.currency'] as const,
				{ kind: 'group', refId: 'g1' },
			);

			expect(values).toEqual({
				contributionAmount: 5000,
				'chama.currency': 'KES',
			});
		});

		it('unset() and auditor.history() also accept the short key', async () => {
			const { category } = await setup();
			const chama = category('chama');

			await chama.writer.set({
				key: 'currency',
				scope: { kind: 'group', refId: 'g1' },
				value: 'KES',
				authorId: 'admin',
			});
			await chama.writer.unset({
				key: 'currency',
				scope: { kind: 'group', refId: 'g1' },
				expectedVersion: 1,
				authorId: 'admin',
			});

			await expect(
				chama.resolver.get('currency', {
					kind: 'group',
					refId: 'g1',
				}),
			).rejects.toThrow();

			const history = await chama.auditor.history('currency');
			expect(history.map((h) => h.action)).toEqual(['created', 'unset']);
		});

		it('a short key that happens to collide with a real key from another category is rejected, not silently misread', async () => {
			const { category, writer } = await setup();
			await writer.set({
				key: 'ui.theme',
				scope: { kind: 'user', refId: 'u1' },
				value: 'dark',
				authorId: 'u1',
			});
			const chama = category('chama') as unknown as {
				resolver: {
					get: (key: string, scope: unknown) => Promise<unknown>;
				};
			};

			// 'ui.theme' is a real, existing key belonging to a different category —
			// it must be rejected as a cross-category access, not reinterpreted as
			// the (nonsensical) short key "ui.theme" prefixed into "chama.ui.theme".
			await expect(
				chama.resolver.get('ui.theme', { kind: 'user', refId: 'u1' }),
			).rejects.toThrow(CategoryError);
		});
	});
});
