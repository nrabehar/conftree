export type ErrorCode =
	| 'NOT_FOUND'
	| 'SCOPE'
	| 'REQUIRED'
	| 'VALUE'
	| 'CONFLICT'
	| 'CORRUPT'
	| 'CYCLE'
	| 'CATEGORY';

export class ConfTreeError extends Error {
	constructor(
		message: string,
		public readonly code: ErrorCode,
	) {
		super(message);
		this.name = new.target.name;
		Error.captureStackTrace?.(this, new.target);
	}
}

export class NotFoundError extends ConfTreeError {
	constructor(key: string) {
		super(`Unknown setting definition: "${key}"`, 'NOT_FOUND');
	}
}

export class ScopeError extends ConfTreeError {
	constructor(key: string, scopeKind: string) {
		super(
			`Setting "${key}" cannot be set or read at scope kind "${scopeKind}"`,
			'SCOPE',
		);
	}
}

export class RequiredError extends ConfTreeError {
	constructor(key: string, scopeKind: string, scopeRefId: string | null) {
		super(
			`Required setting "${key}" has no resolvable value for scope ${scopeKind}:${scopeRefId ?? 'null'} ` +
				`and no default is defined`,
			'REQUIRED',
		);
	}
}

export class ValueError extends ConfTreeError {
	constructor(message: string) {
		super(message, 'VALUE');
	}
}

export class ConflictError extends ConfTreeError {
	constructor(key: string, scopeKind: string, scopeRefId: string | null) {
		super(
			`Setting "${key}" at scope ${scopeKind}:${scopeRefId ?? 'null'} was modified concurrently. ` +
				`Reload the current value and retry.`,
			'CONFLICT',
		);
	}
}

export class CorruptError extends ConfTreeError {
	constructor(valueId: string) {
		super(
			`setting value row ${valueId} has no typed value set: data corruption`,
			'CORRUPT',
		);
	}
}

export class CycleError extends ConfTreeError {
	constructor(id: string, newParentId: string) {
		super(
			`Cannot attach/move scope "${id}" under "${newParentId}": would create a cycle`,
			'CYCLE',
		);
	}
}

export class CategoryError extends ConfTreeError {
	constructor(
		key: string,
		expectedCategory: string | null,
		actualCategory: string | null,
	) {
		super(
			`Setting "${key}" has category "${actualCategory ?? 'none'}", which does not match "${expectedCategory ?? 'none'}"`,
			'CATEGORY',
		);
	}
}
