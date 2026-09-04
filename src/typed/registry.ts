export interface SettingEntry<
	Value = unknown,
	ScopeKind extends string = string,
	Category extends string = string,
> {
	value: Value;
	scope: ScopeKind;
	category?: Category;
}

export type SettingValue<Registry, K extends keyof Registry> =
	Registry[K] extends SettingEntry<infer V, string, string> ? V : never;

export type SettingScopeKind<Registry, K extends keyof Registry> =
	Registry[K] extends SettingEntry<unknown, infer S, string> ? S : never;

export type SettingCategory<Registry, K extends keyof Registry> =
	Registry[K] extends SettingEntry<unknown, string, infer C> ? C : never;

export type KeysInCategory<Registry, C extends string> = {
	[
		K in keyof Registry & string as SettingCategory<Registry, K> extends C
			? K
			: never
	]: Registry[K];
};

export type StripCategoryPrefix<
	K extends string,
	Category extends string,
> = K extends `${Category}.${infer Rest}` ? Rest : never;

export type ShortKeys<Registry, Category extends string> = {
	[
		K in keyof Registry & string as StripCategoryPrefix<K, Category>
	]: Registry[K];
};

export type AcceptedKey<
	Registry,
	Category extends string | undefined,
> = Category extends string
	? (keyof Registry & string) | (keyof ShortKeys<Registry, Category> & string)
	: keyof Registry & string;

export type FullKeyFor<
	Registry,
	Category extends string | undefined,
	K extends string,
> = K extends keyof Registry
	? K
	: Category extends string
		? `${Category}.${K}`
		: never;
