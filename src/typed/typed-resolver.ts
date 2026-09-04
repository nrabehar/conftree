import type { Scope } from '../core/types';
import type { Resolver } from '../engine/resolver';
import type { CategoryGuard } from './category-guard';
import type { SettingScopeKind, SettingValue } from './registry';

export class TypedResolver<Registry> {
	constructor(
		private readonly resolver: Resolver,
		private readonly fixedCategory?: string,
		private readonly guard?: CategoryGuard,
	) {}

	async get<K extends keyof Registry & string>(
		key: K,
		scope: Scope & { kind: SettingScopeKind<Registry, K> },
		asOf?: Date,
	): Promise<SettingValue<Registry, K>> {
		await this.guard?.assert(key);
		return this.resolver.get(key, scope, asOf) as Promise<
			SettingValue<Registry, K>
		>;
	}

	async getMany<K extends readonly (keyof Registry & string)[]>(
		keys: K,
		scope: Scope,
		asOf?: Date,
	): Promise<{ [P in K[number]]: SettingValue<Registry, P> }> {
		await this.guard?.assertAll(keys);
		const result = await this.resolver.getMany([...keys], scope, asOf);
		return result as { [P in K[number]]: SettingValue<Registry, P> };
	}

	async listAt(
		scope: Scope,
		opts: { limit?: number; cursor?: string } = {},
	): Promise<{
		entries: Partial<{
			[K in keyof Registry & string]: SettingValue<Registry, K>;
		}>;
		nextCursor: string | null;
	}> {
		const page = await this.resolver.listAt(scope, {
			...opts,
			category: this.fixedCategory,
		});
		return page as {
			entries: Partial<{
				[K in keyof Registry & string]: SettingValue<Registry, K>;
			}>;
			nextCursor: string | null;
		};
	}
}
