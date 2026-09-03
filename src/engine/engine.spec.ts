import { createEngine } from './engine';
import { ConflictError, NotFoundError } from '../core/errors';

describe('createEngine (end-to-end, zero config)', () => {
	it('supports simple per-user preferences with no hierarchy at all (todo-app use case)', async () => {
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
			scope: { kind: 'default', refId: null },
			value: 'system',
			authorId: 'system',
		});

		expect(
			await resolver.get('ui.theme', { kind: 'user', refId: 'user-1' }),
		).toBe('system');

		await writer.set({
			key: 'ui.theme',
			scope: { kind: 'user', refId: 'user-1' },
			value: 'dark',
			authorId: 'user-1',
		});

		expect(
			await resolver.get('ui.theme', { kind: 'user', refId: 'user-1' }),
		).toBe('dark');
		expect(
			await resolver.get('ui.theme', { kind: 'user', refId: 'user-2' }),
		).toBe('system');
	});

	it('supports a real scope hierarchy end-to-end, including reparenting via move()', async () => {
		const { storage, hierarchy, resolver, writer } = createEngine();

		await storage.createDef({
			key: 'notifications.maxPerDay',
			label: 'Max notifications per day',
			type: 'NUMERIC',
			min: 0,
			max: 100,
			scopes: ['org', 'team', 'user'],
			inherit: 'INHERITABLE_OVERRIDABLE',
			required: true,
			status: 'STABLE',
		});

		await hierarchy.attach('org-1', null);
		await hierarchy.attach('org-2', null);
		await hierarchy.attach('team-1', 'org-1');
		await hierarchy.attach('user-1', 'team-1');

		await writer.set({
			key: 'notifications.maxPerDay',
			scope: { kind: 'org', refId: 'org-1' },
			value: 10,
			authorId: 'admin',
		});
		await writer.set({
			key: 'notifications.maxPerDay',
			scope: { kind: 'org', refId: 'org-2' },
			value: 99,
			authorId: 'admin',
		});

		expect(
			await resolver.get('notifications.maxPerDay', {
				kind: 'user',
				refId: 'user-1',
			}),
		).toBe(10);

		await hierarchy.move('team-1', 'org-2');
		expect(
			await resolver.get('notifications.maxPerDay', {
				kind: 'user',
				refId: 'user-1',
			}),
		).toBe(99);
	});

	it('resolves JSON and DATE settings end-to-end', async () => {
		const { storage, resolver, writer } = createEngine();

		await storage.createDef({
			key: 'notif.settings',
			label: 'Notification settings',
			type: 'JSON',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
		await storage.createDef({
			key: 'trial.endsAt',
			label: 'Trial end date',
			type: 'DATE',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});

		await writer.set({
			key: 'notif.settings',
			scope: { kind: 'user', refId: 'u1' },
			value: { email: true, sms: false, channels: ['push', 'email'] },
			authorId: 'u1',
		});
		const endsAt = new Date('2026-06-01T00:00:00.000Z');
		await writer.set({
			key: 'trial.endsAt',
			scope: { kind: 'user', refId: 'u1' },
			value: endsAt,
			authorId: 'u1',
		});

		expect(
			await resolver.get('notif.settings', { kind: 'user', refId: 'u1' }),
		).toEqual({
			email: true,
			sms: false,
			channels: ['push', 'email'],
		});
		expect(
			await resolver.get('trial.endsAt', { kind: 'user', refId: 'u1' }),
		).toEqual(endsAt);
	});

	it('serves cached reads and invalidates precisely on write, end-to-end', async () => {
		const { storage, resolver, writer } = createEngine();

		await storage.createDef({
			key: 'ui.pageSize',
			label: 'Page size',
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
		await writer.set({
			key: 'ui.pageSize',
			scope: { kind: 'user', refId: 'u1' },
			value: 20,
			authorId: 'u1',
		});

		expect(
			await resolver.get('ui.pageSize', { kind: 'user', refId: 'u1' }),
		).toBe(20);

		const originalFindValues = storage.findValues.bind(storage);
		storage.findValues = () => {
			throw new Error(
				'should not hit storage: cache should have served this read',
			);
		};
		expect(
			await resolver.get('ui.pageSize', { kind: 'user', refId: 'u1' }),
		).toBe(20);
		storage.findValues = originalFindValues;

		await writer.set({
			key: 'ui.pageSize',
			scope: { kind: 'user', refId: 'u1' },
			value: 50,
			expectedVersion: 1,
			authorId: 'u1',
		});
		expect(
			await resolver.get('ui.pageSize', { kind: 'user', refId: 'u1' }),
		).toBe(50);
	});

	it('never leaks a secret value into the audit trail, end-to-end', async () => {
		const { storage, writer } = createEngine();

		await storage.createDef({
			key: 'api.key',
			label: 'API key',
			type: 'TEXT',
			scopes: ['tenant'],
			inherit: 'INDEPENDENT',
			required: false,
			secret: true,
			status: 'STABLE',
		});

		await writer.set({
			key: 'api.key',
			scope: { kind: 'tenant', refId: 't1' },
			value: 'sk-super-secret',
			authorId: 'admin',
		});

		const resolver = createEngine({ storage }).resolver;
		expect(
			await resolver.get('api.key', { kind: 'tenant', refId: 't1' }),
		).toBe('sk-super-secret');
	});

	it('resolves many keys at once via getMany, batched', async () => {
		const { storage, resolver, writer } = createEngine();

		await storage.createDef({
			key: 'a',
			label: 'A',
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
		await storage.createDef({
			key: 'b',
			label: 'B',
			type: 'TEXT',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
		await writer.set({
			key: 'a',
			scope: { kind: 'user', refId: 'u1' },
			value: 1,
			authorId: 'u1',
		});
		await writer.set({
			key: 'b',
			scope: { kind: 'user', refId: 'u1' },
			value: 'hello',
			authorId: 'u1',
		});

		const values = await resolver.getMany(['a', 'b'], {
			kind: 'user',
			refId: 'u1',
		});
		expect(values).toEqual({ a: 1, b: 'hello' });
	});

	it('optimistic concurrency: two racing writers against the same expectedVersion, only one wins', async () => {
		const { storage, writer } = createEngine();

		await storage.createDef({
			key: 'ui.pageSize',
			label: 'Page size',
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
		await writer.set({
			key: 'ui.pageSize',
			scope: { kind: 'user', refId: 'u1' },
			value: 20,
			authorId: 'u1',
		});

		const results = await Promise.allSettled([
			writer.set({
				key: 'ui.pageSize',
				scope: { kind: 'user', refId: 'u1' },
				value: 50,
				expectedVersion: 1,
				authorId: 'a',
			}),
			writer.set({
				key: 'ui.pageSize',
				scope: { kind: 'user', refId: 'u1' },
				value: 75,
				expectedVersion: 1,
				authorId: 'b',
			}),
		]);

		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r) => r.status === 'rejected');
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0].reason).toBeInstanceOf(ConflictError);
	});

	it('unset() reverts to the inherited/default value and records it in the audit trail', async () => {
		const { storage, hierarchy, resolver, writer, auditor } =
			createEngine();

		await storage.createDef({
			key: 'ui.theme',
			label: 'Theme',
			type: 'ENUM',
			options: ['light', 'dark'],
			scopes: ['org', 'user'],
			inherit: 'INHERITABLE_OVERRIDABLE',
			required: false,
			status: 'STABLE',
		});
		await hierarchy.attach('org-1', null);
		await hierarchy.attach('user-1', 'org-1');

		await writer.set({
			key: 'ui.theme',
			scope: { kind: 'org', refId: 'org-1' },
			value: 'dark',
			authorId: 'admin',
		});
		await writer.set({
			key: 'ui.theme',
			scope: { kind: 'user', refId: 'user-1' },
			value: 'light',
			authorId: 'user-1',
		});

		expect(
			await resolver.get('ui.theme', { kind: 'user', refId: 'user-1' }),
		).toBe('light');

		await writer.unset({
			key: 'ui.theme',
			scope: { kind: 'user', refId: 'user-1' },
			expectedVersion: 1,
			authorId: 'user-1',
		});

		expect(
			await resolver.get('ui.theme', { kind: 'user', refId: 'user-1' }),
		).toBe('dark');

		const history = await auditor.history('ui.theme', {
			kind: 'user',
			refId: 'user-1',
		});
		expect(history.map((h) => h.action)).toEqual(['created', 'unset']);
	});

	it('resolver.listAt() lists every setting explicitly set at a scope', async () => {
		const { storage, resolver, writer } = createEngine();

		await storage.createDef({
			key: 'ui.theme',
			label: 'Theme',
			type: 'ENUM',
			options: ['light', 'dark'],
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
		await storage.createDef({
			key: 'ui.pageSize',
			label: 'Page size',
			type: 'NUMERIC',
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
		await writer.set({
			key: 'ui.pageSize',
			scope: { kind: 'user', refId: 'u1' },
			value: 20,
			authorId: 'u1',
		});
		await writer.set({
			key: 'ui.theme',
			scope: { kind: 'user', refId: 'u2' },
			value: 'light',
			authorId: 'u2',
		});

		const { entries } = await resolver.listAt({
			kind: 'user',
			refId: 'u1',
		});

		expect(entries).toEqual({ 'ui.theme': 'dark', 'ui.pageSize': 20 });
	});

	it('retiring a definition removes it from reads and writes but keeps its audit history', async () => {
		const { storage, writer, auditor } = createEngine();

		await storage.createDef({
			key: 'legacy.flag',
			label: 'Legacy flag',
			type: 'BOOLEAN',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
		await writer.set({
			key: 'legacy.flag',
			scope: { kind: 'user', refId: 'u1' },
			value: true,
			authorId: 'u1',
		});

		await storage.updateDefStatus('legacy.flag', 'RETIRED');

		await expect(
			writer.set({
				key: 'legacy.flag',
				scope: { kind: 'user', refId: 'u1' },
				value: false,
				expectedVersion: 1,
				authorId: 'u1',
			}),
		).rejects.toThrow(NotFoundError);

		const history = await auditor.history('legacy.flag');
		expect(history).toHaveLength(1);
	});
});
