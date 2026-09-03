import {
	ConflictError,
	CorruptError,
	CycleError,
	NotFoundError,
	RequiredError,
	ScopeError,
	SflegError,
	ValueError,
} from './errors';

describe('error codes', () => {
	it.each([
		[new NotFoundError('k'), 'NOT_FOUND', 'NotFoundError'],
		[new ScopeError('k', 'user'), 'SCOPE', 'ScopeError'],
		[new RequiredError('k', 'user', 'u1'), 'REQUIRED', 'RequiredError'],
		[new ValueError('bad value'), 'VALUE', 'ValueError'],
		[new ConflictError('k', 'user', 'u1'), 'CONFLICT', 'ConflictError'],
		[new CorruptError('v1'), 'CORRUPT', 'CorruptError'],
		[new CycleError('a', 'b'), 'CYCLE', 'CycleError'],
	])('%p carries code %s and name %s', (error, code, name) => {
		expect(error).toBeInstanceOf(SflegError);
		expect(error).toBeInstanceOf(Error);
		expect(error.code).toBe(code);
		expect(error.name).toBe(name);
	});
});
