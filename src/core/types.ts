export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export type Value = Date | JsonValue;

export interface Scope {
	kind: string;
	refId: string | null;
}

export const DEFAULT_SCOPE: Scope = { kind: 'default', refId: null };

export type ValueType =
	'BOOLEAN' | 'NUMERIC' | 'TEXT' | 'ENUM' | 'JSON' | 'DATE';

export type Inherit = 'LOCKED' | 'INHERITABLE_OVERRIDABLE' | 'INDEPENDENT';

export type Status = 'DRAFT' | 'STABLE' | 'DEPRECATED' | 'RETIRED';

export interface DefRecord {
	id: string;
	key: string;
	version: number;
	label: string;
	description: string | null;
	type: ValueType;
	options: string[];
	min: number | null;
	max: number | null;
	scopes: string[];
	inherit: Inherit;
	required: boolean;
	secret: boolean;
	status: Status;
	category: string | null;
}

export interface ValueRecord {
	id: string;
	definitionId: string;
	scopeKind: string;
	scopeRefId: string | null;
	bool: boolean | null;
	num: number | null;
	text: string | null;
	json: unknown;
	jsonSet: boolean;
	date: Date | null;
	version: number;
}

export interface ScopeHierarchy {
	chain(scopeRefId: string): Promise<string[]>;
	descendants(scopeRefId: string): Promise<string[]>;
	children(scopeRefId: string): Promise<string[]>;
	parent(scopeRefId: string): Promise<string | null>;
	attach(id: string, parentId: string | null): Promise<void>;
	move(id: string, newParentId: string | null): Promise<void>;
	detach(id: string): Promise<void>;
}
