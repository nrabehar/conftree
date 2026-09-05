import { CategoryError } from '../core/errors';
import type { StorageReader } from '../storage/storage-port';

export class CategoryGuard {
	constructor(
		private readonly storage: StorageReader,
		private readonly category: string,
	) {}

	async assert(key: string): Promise<void> {
		const def = await this.storage.findAnyDef(key);
		if (def && def.category !== this.category) {
			throw new CategoryError(key, this.category, def.category);
		}
	}

	async assertAll(keys: Iterable<string>): Promise<void> {
		const keyList = [...new Set(keys)];
		if (keyList.length === 0) return;
		const defs = await this.storage.findAnyDefs(keyList);
		const byKey = new Map(defs.map((d) => [d.key, d]));
		for (const key of keyList) {
			const def = byKey.get(key);
			if (def && def.category !== this.category) {
				throw new CategoryError(key, this.category, def.category);
			}
		}
	}

	async resolveKey(key: string): Promise<string> {
		const [resolved] = await this.resolveKeys([key]);
		return resolved;
	}

	async resolveKeys(keys: Iterable<string>): Promise<string[]> {
		const keyList = [...keys];
		if (keyList.length === 0) return [];
		const prefixed = keyList.map((key) => `${this.category}.${key}`);
		const candidates = [...new Set([...keyList, ...prefixed])];
		const defs = await this.storage.findAnyDefs(candidates);
		const byKey = new Map(defs.map((d) => [d.key, d]));

		return keyList.map((key, i) => {
			const direct = byKey.get(key);
			if (direct) {
				if (direct.category !== this.category) {
					throw new CategoryError(
						key,
						this.category,
						direct.category,
					);
				}
				return key;
			}

			const prefixedKey = prefixed[i];
			const viaPrefix = byKey.get(prefixedKey);
			if (viaPrefix && viaPrefix.category !== this.category) {
				throw new CategoryError(
					prefixedKey,
					this.category,
					viaPrefix.category,
				);
			}
			return prefixedKey;
		});
	}
}
