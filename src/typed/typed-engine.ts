import type { Engine } from '../engine/engine';
import { TypedResolver } from './typed-resolver';
import { TypedWriter } from './typed-writer';
import { TypedAuditor } from './typed-auditor';
import type { KeysInCategory } from './registry';

export interface TypedEngine<Registry> {
	resolver: TypedResolver<Registry>;
	writer: TypedWriter<Registry>;
	auditor: TypedAuditor<Registry>;
	category<C extends string>(
		category: C,
	): TypedEngine<KeysInCategory<Registry, C>>;
}

export function createTypedEngine<Registry>(
	engine: Engine,
): TypedEngine<Registry> {
	function build<R>(fixedCategory?: string): TypedEngine<R> {
		return {
			resolver: new TypedResolver<R>(engine.resolver, fixedCategory),
			writer: new TypedWriter<R>(engine.writer),
			auditor: new TypedAuditor<R>(engine.auditor),
			category: <C extends string>(category: C) =>
				build<KeysInCategory<R, C>>(category),
		};
	}
	return build<Registry>();
}
