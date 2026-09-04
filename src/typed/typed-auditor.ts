import type { Scope } from '../core/types';
import type { Auditor } from '../engine/auditor';
import type { AuditRecord } from '../storage/storage-port';
import type { CategoryGuard } from './category-guard';
import type { SettingScopeKind } from './registry';

export class TypedAuditor<Registry> {
	constructor(
		private readonly auditor: Auditor,
		private readonly guard?: CategoryGuard,
	) {}

	async history<K extends keyof Registry & string>(
		key: K,
		scope?: Scope & { kind: SettingScopeKind<Registry, K> },
	): Promise<AuditRecord[]> {
		await this.guard?.assert(key);
		return this.auditor.history(key, scope);
	}
}
