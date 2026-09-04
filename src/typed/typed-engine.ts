import type { Engine } from '../engine/engine';
import { TypedResolver } from './typed-resolver';
import { TypedWriter } from './typed-writer';
import { TypedAuditor } from './typed-auditor';
import { CategoryGuard } from './category-guard';
import type { KeysInCategory } from './registry';

export interface TypedEngine<
	Registry,
	Category extends string | undefined = undefined,
> {
	resolver: TypedResolver<Registry, Category>;
	writer: TypedWriter<Registry, Category>;
	auditor: TypedAuditor<Registry, Category>;
	category<C extends string>(
		category: C,
	): TypedEngine<KeysInCategory<Registry, C>, C>;
}

export function createTypedEngine<Registry>(
	engine: Engine,
): TypedEngine<Registry> {
	function build<R, C extends string | undefined>(
		fixedCategory?: C,
	): TypedEngine<R, C> {
		const guard = fixedCategory
			? new CategoryGuard(engine.storage, fixedCategory)
			: undefined;
		return {
			resolver: new TypedResolver<R, C>(
				engine.resolver,
				fixedCategory,
				guard,
			),
			writer: new TypedWriter<R, C>(engine.writer, guard),
			auditor: new TypedAuditor<R, C>(engine.auditor, guard),
			category: <C2 extends string>(category: C2) =>
				build<KeysInCategory<R, C2>, C2>(category),
		};
	}
	return build<Registry, undefined>();
}
