import type { Scope, ValueRecord } from '../core/types';
import type { SetParams, Writer } from '../engine/writer';
import type { CategoryGuard } from './category-guard';
import type {
	AcceptedKey,
	FullKeyFor,
	SettingScopeKind,
	SettingValue,
} from './registry';

export interface TypedSetParams<
	Registry,
	Category extends string | undefined,
	K extends AcceptedKey<Registry, Category>,
> {
	key: K;
	scope: Scope & {
		kind: SettingScopeKind<
			Registry,
			FullKeyFor<Registry, Category, K> & keyof Registry
		>;
	};
	value: SettingValue<
		Registry,
		FullKeyFor<Registry, Category, K> & keyof Registry
	>;
	expectedVersion?: number;
	authorId: string;
	reason?: string;
}

export type AnyTypedSetParams<Registry, Category extends string | undefined> = {
	[K in AcceptedKey<Registry, Category>]: TypedSetParams<
		Registry,
		Category,
		K
	>;
}[AcceptedKey<Registry, Category>];

export interface TypedUnsetParams<
	Registry,
	Category extends string | undefined,
	K extends AcceptedKey<Registry, Category>,
> {
	key: K;
	scope: Scope & {
		kind: SettingScopeKind<
			Registry,
			FullKeyFor<Registry, Category, K> & keyof Registry
		>;
	};
	expectedVersion?: number;
	authorId: string;
	reason?: string;
}

export class TypedWriter<
	Registry,
	Category extends string | undefined = undefined,
> {
	constructor(
		private readonly writer: Writer,
		private readonly guard?: CategoryGuard,
	) {}

	async set<K extends AcceptedKey<Registry, Category>>(
		params: TypedSetParams<Registry, Category, K>,
	): Promise<ValueRecord> {
		const resolvedKey =
			(await this.guard?.resolveKey(params.key)) ?? params.key;
		return this.writer.set({
			...params,
			key: resolvedKey,
		} as unknown as SetParams);
	}

	async setMany(
		paramsList: AnyTypedSetParams<Registry, Category>[],
	): Promise<ValueRecord[]> {
		const resolved = this.guard
			? await Promise.all(
					paramsList.map(async (params) => ({
						...params,
						key: await this.guard!.resolveKey(params.key),
					})),
				)
			: paramsList;
		return this.writer.setMany(resolved as unknown as SetParams[]);
	}

	async unset<K extends AcceptedKey<Registry, Category>>(
		params: TypedUnsetParams<Registry, Category, K>,
	): Promise<void> {
		const resolvedKey =
			(await this.guard?.resolveKey(params.key)) ?? params.key;
		return this.writer.unset({ ...params, key: resolvedKey });
	}
}
