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
}
