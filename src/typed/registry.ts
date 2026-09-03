export interface SettingEntry<
	Value = unknown,
	ScopeKind extends string = string,
> {
	value: Value;
	scope: ScopeKind;
}

export type SettingValue<Registry, K extends keyof Registry> =
	Registry[K] extends SettingEntry<infer V, string> ? V : never;

export type SettingScopeKind<Registry, K extends keyof Registry> =
	Registry[K] extends SettingEntry<unknown, infer S> ? S : never;
