import type { StorageAdapter } from '../src';
import { createEngine, MemoryStorageAdapter } from '../src';

interface BenchInstance {
	add(name: string, fn: () => unknown): BenchInstance;
	run(): Promise<unknown>;
	table(): unknown[];
}
interface TinybenchModule {
	Bench: new (opts?: { time?: number }) => BenchInstance;
}

function withLatency(adapter: StorageAdapter, ms: number): StorageAdapter {
	const delay = () => new Promise<void>((resolve) => setTimeout(resolve, ms));
	return {
		findDefs: async (keys) => {
			await delay();
			return adapter.findDefs(keys);
		},
		findDefsByIds: async (ids) => {
			await delay();
			return adapter.findDefsByIds(ids);
		},
		findAnyDef: async (key) => {
			await delay();
			return adapter.findAnyDef(key);
		},
		findValues: async (query) => {
			await delay();
			return adapter.findValues(query);
		},
		findChainValues: async (query) => {
			await delay();
			return adapter.findChainValues(query);
		},
		findAudit: async (query) => {
			await delay();
			return adapter.findAudit(query);
		},
		listValues: async (query) => {
			await delay();
			return adapter.listValues(query);
		},
		createDef: async (input) => {
			await delay();
			return adapter.createDef(input);
		},
		updateDefStatus: async (key, status) => {
			await delay();
			return adapter.updateDefStatus(key, status);
		},
		listDefs: async (status, category) => {
			await delay();
			return adapter.listDefs(status, category);
		},
		listCategories: async () => {
			await delay();
			return adapter.listCategories();
		},
		transact: async (fn) => {
			await delay();
			return adapter.transact(fn);
		},
	};
}

async function setup(latencyMs: number, keyCount: number) {
	const raw = new MemoryStorageAdapter();
	for (let i = 0; i < keyCount; i++) {
		await raw.createDef({
			key: `key-${i}`,
			label: `Key ${i}`,
			type: 'NUMERIC',
			scopes: ['user'],
			inherit: 'INDEPENDENT',
			required: false,
			status: 'STABLE',
		});
	}
	const storage = withLatency(raw, latencyMs);
	const { resolver, writer } = createEngine({ storage, cache: false });
	for (let i = 0; i < keyCount; i++) {
		await writer.set({
			key: `key-${i}`,
			scope: { kind: 'user', refId: 'u1' },
			value: i,
			authorId: 'bench',
		});
	}
	return resolver;
}

async function main() {
	const { Bench } = (await import('tinybench')) as unknown as TinybenchModule;

	const KEY_COUNT = 50;
	const LATENCY_MS = 2;

	const resolver = await setup(LATENCY_MS, KEY_COUNT);
	const keys = Array.from({ length: KEY_COUNT }, (_, i) => `key-${i}`);
	const scope = { kind: 'user', refId: 'u1' };

	const bench = new Bench({ time: 1000 });

	bench
		.add(`get() x ${KEY_COUNT} sequential`, async () => {
			for (const key of keys) {
				await resolver.get(key, scope);
			}
		})
		.add(`getMany() on all ${KEY_COUNT} keys at once`, async () => {
			await resolver.getMany(keys, scope);
		});

	await bench.run();
	console.log(
		`\nSimulated storage round-trip latency: ${LATENCY_MS}ms, ${KEY_COUNT} keys\n`,
	);
	console.table(bench.table());
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
