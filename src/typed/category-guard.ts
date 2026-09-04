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
		await Promise.all([...keys].map((key) => this.assert(key)));
	}

	async resolveKey(key: string): Promise<string> {
		const direct = await this.storage.findAnyDef(key);
		if (direct) {
			if (direct.category !== this.category) {
				throw new CategoryError(key, this.category, direct.category);
			}
			return key;
		}

		const prefixed = `${this.category}.${key}`;
		const viaPrefix = await this.storage.findAnyDef(prefixed);
		if (viaPrefix && viaPrefix.category !== this.category) {
			throw new CategoryError(
				prefixed,
				this.category,
				viaPrefix.category,
			);
		}
		return prefixed;
	}

	async resolveKeys(keys: Iterable<string>): Promise<string[]> {
		return Promise.all([...keys].map((key) => this.resolveKey(key)));
	}
}
