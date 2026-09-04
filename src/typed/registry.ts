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
