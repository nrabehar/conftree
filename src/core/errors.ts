export class NotFoundError extends Error {
	constructor(key: string) {
		super(`Unknown setting definition: "${key}"`);
		this.name = 'NotFoundError';
	}
}

export class ScopeError extends Error {
	constructor(key: string, scopeKind: string) {
		super(
			`Setting "${key}" cannot be set or read at scope kind "${scopeKind}"`,
		);
		this.name = 'ScopeError';
	}
}

export class RequiredError extends Error {
	constructor(key: string, scopeKind: string, scopeRefId: string | null) {
		super(
			`Required setting "${key}" has no resolvable value for scope ${scopeKind}:${scopeRefId ?? 'null'} ` +
				`and no default is defined`,
		);
		this.name = 'RequiredError';
	}
}

export class ValueError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValueError';
	}
}

export class ConflictError extends Error {
	constructor(key: string, scopeKind: string, scopeRefId: string | null) {
		super(
			`Setting "${key}" at scope ${scopeKind}:${scopeRefId ?? 'null'} was modified concurrently. ` +
				`Reload the current value and retry.`,
		);
		this.name = 'ConflictError';
	}
}

export class CorruptError extends Error {
	constructor(valueId: string) {
		super(
			`setting value row ${valueId} has no typed value set: data corruption`,
		);
		this.name = 'CorruptError';
	}
}

export class CycleError extends Error {
	constructor(id: string, newParentId: string) {
		super(
			`Cannot attach/move scope "${id}" under "${newParentId}": would create a cycle`,
		);
		this.name = 'CycleError';
	}
}
