import type { Scope } from '../core/types';
import type { Auditor } from '../engine/auditor';
import type { AuditRecord } from '../storage/storage-port';
import type { SettingScopeKind } from './registry';

export class TypedAuditor<Registry> {
	constructor(private readonly auditor: Auditor) {}

	history<K extends keyof Registry & string>(
		key: K,
		scope?: Scope & { kind: SettingScopeKind<Registry, K> },
	): Promise<AuditRecord[]> {
		return this.auditor.history(key, scope);
	}
}
