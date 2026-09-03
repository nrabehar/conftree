export type ErrorCode =
	| 'NOT_FOUND'
	| 'SCOPE'
	| 'REQUIRED'
	| 'VALUE'
	| 'CONFLICT'
	| 'CORRUPT'
	| 'CYCLE';

export class SflegError extends Error {
	constructor(
		message: string,
		public readonly code: ErrorCode,
	) {
		super(message);
		this.name = new.target.name;
		Error.captureStackTrace?.(this, new.target);
	}
}

export class NotFoundError extends SflegError {
	constructor(key: string) {
		super(`Unknown setting definition: "${key}"`, 'NOT_FOUND');
	}
}

export class ScopeError extends SflegError {
	constructor(key: string, scopeKind: string) {
		super(
			`Setting "${key}" cannot be set or read at scope kind "${scopeKind}"`,
			'SCOPE',
		);
	}
}

export class RequiredError extends SflegError {
	constructor(key: string, scopeKind: string, scopeRefId: string | null) {
		super(
			`Required setting "${key}" has no resolvable value for scope ${scopeKind}:${scopeRefId ?? 'null'} ` +
				`and no default is defined`,
			'REQUIRED',
		);
	}
}

export class ValueError extends SflegError {
	constructor(message: string) {
		super(message, 'VALUE');
	}
}

export class ConflictError extends SflegError {
	constructor(key: string, scopeKind: string, scopeRefId: string | null) {
		super(
			`Setting "${key}" at scope ${scopeKind}:${scopeRefId ?? 'null'} was modified concurrently. ` +
				`Reload the current value and retry.`,
			'CONFLICT',
		);
	}
}

export class CorruptError extends SflegError {
	constructor(valueId: string) {
		super(
			`setting value row ${valueId} has no typed value set: data corruption`,
			'CORRUPT',
		);
	}
}

export class CycleError extends SflegError {
	constructor(id: string, newParentId: string) {
		super(
			`Cannot attach/move scope "${id}" under "${newParentId}": would create a cycle`,
			'CYCLE',
		);
	}
}
