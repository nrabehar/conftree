import type { Engine } from '../engine/engine';
import { TypedResolver } from './typed-resolver';
import { TypedWriter } from './typed-writer';
import { TypedAuditor } from './typed-auditor';

export interface TypedEngine<Registry> {
	resolver: TypedResolver<Registry>;
	writer: TypedWriter<Registry>;
	auditor: TypedAuditor<Registry>;
}

export function createTypedEngine<Registry>(
	engine: Engine,
): TypedEngine<Registry> {
	return {
		resolver: new TypedResolver<Registry>(engine.resolver),
		writer: new TypedWriter<Registry>(engine.writer),
		auditor: new TypedAuditor<Registry>(engine.auditor),
	};
}
