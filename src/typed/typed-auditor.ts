import type { Scope } from '../core/types';
import type { Auditor } from '../engine/auditor';
import type { AuditRecord } from '../storage/storage-port';
import type { CategoryGuard } from './category-guard';
import type { AcceptedKey, FullKeyFor, SettingScopeKind } from './registry';

export class TypedAuditor<
	Registry,
	Category extends string | undefined = undefined,
> {
	constructor(
		private readonly auditor: Auditor,
		private readonly guard?: CategoryGuard,
	) {}

	async history<K extends AcceptedKey<Registry, Category>>(
		key: K,
		scope?: Scope & {
			kind: SettingScopeKind<
				Registry,
				FullKeyFor<Registry, Category, K> & keyof Registry
			>;
		},
	): Promise<AuditRecord[]> {
		const resolvedKey = (await this.guard?.resolveKey(key)) ?? key;
		return this.auditor.history(resolvedKey, scope);
	}
}
