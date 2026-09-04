import type { Scope } from '../core/types';
import type { Resolver } from '../engine/resolver';
import type { CategoryGuard } from './category-guard';
import type {
	AcceptedKey,
	FullKeyFor,
	SettingScopeKind,
	SettingValue,
} from './registry';

export class TypedResolver<
	Registry,
	Category extends string | undefined = undefined,
> {
	constructor(
		private readonly resolver: Resolver,
		private readonly fixedCategory?: Category,
		private readonly guard?: CategoryGuard,
	) {}

	async get<K extends AcceptedKey<Registry, Category>>(
		key: K,
		scope: Scope & {
			kind: SettingScopeKind<
				Registry,
				FullKeyFor<Registry, Category, K> & keyof Registry
			>;
		},
		asOf?: Date,
	): Promise<
		SettingValue<
			Registry,
			FullKeyFor<Registry, Category, K> & keyof Registry
		>
	> {
		const resolvedKey = (await this.guard?.resolveKey(key)) ?? key;
		return this.resolver.get(resolvedKey, scope, asOf) as Promise<
			SettingValue<
				Registry,
				FullKeyFor<Registry, Category, K> & keyof Registry
			>
		>;
	}

	async getMany<K extends readonly AcceptedKey<Registry, Category>[]>(
		keys: K,
		scope: Scope,
		asOf?: Date,
	): Promise<{
		[P in K[number]]: SettingValue<
			Registry,
			FullKeyFor<Registry, Category, P> & keyof Registry
		>;
	}> {
		const resolvedKeys = this.guard
			? await this.guard.resolveKeys(keys)
			: [...keys];
		const result = await this.resolver.getMany(resolvedKeys, scope, asOf);
		const remapped: Record<string, unknown> = {};
		keys.forEach((key, i) => {
			remapped[key] = result[resolvedKeys[i]];
		});
		return remapped as {
			[P in K[number]]: SettingValue<
				Registry,
				FullKeyFor<Registry, Category, P> & keyof Registry
			>;
		};
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
