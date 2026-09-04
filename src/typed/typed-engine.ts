import type { Engine } from '../engine/engine';
import { TypedResolver } from './typed-resolver';
import { TypedWriter } from './typed-writer';
import { TypedAuditor } from './typed-auditor';
import { CategoryGuard } from './category-guard';
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
		const guard = fixedCategory
			? new CategoryGuard(engine.storage, fixedCategory)
			: undefined;
		return {
			resolver: new TypedResolver<R>(
				engine.resolver,
				fixedCategory,
				guard,
			),
			writer: new TypedWriter<R>(engine.writer, guard),
			auditor: new TypedAuditor<R>(engine.auditor, guard),
			category: <C extends string>(category: C) =>
				build<KeysInCategory<R, C>>(category),
		};
	}
	return build<Registry>();
}
