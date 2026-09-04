import type { Scope, ValueRecord } from '../core/types';
import type { SetParams, Writer } from '../engine/writer';
import type { CategoryGuard } from './category-guard';
import type { SettingScopeKind, SettingValue } from './registry';

export interface TypedSetParams<Registry, K extends keyof Registry & string> {
	key: K;
	scope: Scope & { kind: SettingScopeKind<Registry, K> };
	value: SettingValue<Registry, K>;
	expectedVersion?: number;
	authorId: string;
	reason?: string;
}

export interface TypedUnsetParams<Registry, K extends keyof Registry & string> {
	key: K;
	scope: Scope & { kind: SettingScopeKind<Registry, K> };
	expectedVersion?: number;
	authorId: string;
	reason?: string;
}

export class TypedWriter<Registry> {
	constructor(
		private readonly writer: Writer,
		private readonly guard?: CategoryGuard,
	) {}

	async set<K extends keyof Registry & string>(
		params: TypedSetParams<Registry, K>,
	): Promise<ValueRecord> {
		await this.guard?.assert(params.key);
		return this.writer.set(params as unknown as SetParams);
	}

	async setMany(
		paramsList: {
			[K in keyof Registry & string]: TypedSetParams<Registry, K>;
		}[keyof Registry & string][],
	): Promise<ValueRecord[]> {
		await this.guard?.assertAll(paramsList.map((p) => p.key));
		return this.writer.setMany(paramsList as unknown as SetParams[]);
	}

	async unset<K extends keyof Registry & string>(
		params: TypedUnsetParams<Registry, K>,
	): Promise<void> {
		await this.guard?.assert(params.key);
		return this.writer.unset(params);
	}
}
