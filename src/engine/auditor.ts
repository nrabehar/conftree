import type { Scope } from '../core/types';
import { NotFoundError } from '../core/errors';
import type { AuditRecord, StorageReader } from '../storage/storage-port';

export class Auditor {
	constructor(private readonly storage: StorageReader) {}

	async history(key: string, scope?: Scope): Promise<AuditRecord[]> {
		const def = await this.storage.findAnyDef(key);
		if (!def) throw new NotFoundError(key);

		return this.storage.findAudit({
			definitionId: def.id,
			scopeKind: scope?.kind,
			scopeRefId: scope?.refId,
		});
	}
}
