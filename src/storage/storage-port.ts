import type {
	DefRecord,
	Inherit,
	Status,
	Value,
	ValueRecord,
	ValueType,
} from '../core/types';

export interface FindValuesQuery {
	definitionIds: string[];
	scopeKind: string;
	scopeRefId: string | null;
	asOf?: Date;
}

export interface FindChainQuery {
	definitionIds: string[];
	chain: string[];
	asOf?: Date;
}

export interface CreateDefInput {
	key: string;
	label: string;
	description?: string | null;
	type: ValueType;
	options?: string[];
	min?: number | null;
	max?: number | null;
	scopes: string[];
	inherit: Inherit;
	required: boolean;
	secret?: boolean;
	category?: string | null;
	status?: Status;
}

export interface CreateValueInput {
	definitionId: string;
	scopeKind: string;
	scopeRefId: string | null;
	version: number;
	authorId: string;
	reason?: string;
	type: ValueType;
	value: Value;
}

export type AuditAction = 'created' | 'superseded' | 'unset';

export interface CreateAuditInput {
	valueId: string;
	definitionId: string;
	scopeKind: string;
	scopeRefId: string | null;
	action: AuditAction;
	authorId: string;
	before?: unknown;
	after?: unknown;
	reason?: string;
}

export interface AuditRecord extends CreateAuditInput {
	id: string;
	at: Date;
}

export interface FindAuditQuery {
	definitionId: string;
	scopeKind?: string;
	scopeRefId?: string | null;
}

export interface ListValuesQuery {
	scopeKind: string;
	scopeRefId: string | null;
	category?: string;
	limit?: number;
	cursor?: string;
}

export interface ListValuesResult {
	values: ValueRecord[];
	nextCursor: string | null;
}

export interface StorageReader {
	findDefs(keys: string[]): Promise<DefRecord[]>;
	findDefsByIds(ids: string[]): Promise<DefRecord[]>;
	findAnyDef(key: string): Promise<DefRecord | null>;
	findValues(query: FindValuesQuery): Promise<ValueRecord[]>;
	findChainValues(query: FindChainQuery): Promise<ValueRecord[]>;
	findAudit(query: FindAuditQuery): Promise<AuditRecord[]>;
	listValues(query: ListValuesQuery): Promise<ListValuesResult>;
}

export interface StorageTx {
	findDef(key: string): Promise<DefRecord | null>;
	findValue(
		definitionId: string,
		scopeKind: string,
		scopeRefId: string | null,
	): Promise<ValueRecord | null>;
	closeValue(id: string): Promise<void>;
	createValue(input: CreateValueInput): Promise<ValueRecord>;
	createAudit(input: CreateAuditInput): Promise<void>;
}

export interface StorageWriter {
	createDef(input: CreateDefInput): Promise<DefRecord>;
	updateDefStatus(key: string, status: Status): Promise<DefRecord>;
	listDefs(status?: Status): Promise<DefRecord[]>;
	transact<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T>;
}

export interface StorageAdapter extends StorageReader, StorageWriter {}
