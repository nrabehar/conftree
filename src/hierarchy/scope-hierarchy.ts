import { CycleError } from '../core/errors';
import type { ScopeHierarchy } from '../core/types';

export class LocalScopeHierarchy implements ScopeHierarchy {
	private readonly parentOf = new Map<string, string | null>();
	private readonly childrenOf = new Map<string, Set<string>>();

	async chain(id: string): Promise<string[]> {
		const result: string[] = [];
		const seen = new Set<string>();
		let current: string | null = id;
		while (current !== null) {
			if (seen.has(current)) break;
			seen.add(current);
			result.push(current);
			current = this.parentOf.get(current) ?? null;
		}
		return result;
	}

	async descendants(id: string): Promise<string[]> {
		const result: string[] = [];
		const stack = [id];
		const seen = new Set<string>();
		while (stack.length > 0) {
			const current = stack.pop()!;
			if (seen.has(current)) continue;
			seen.add(current);
			result.push(current);
			const kids = this.childrenOf.get(current);
			if (kids) stack.push(...kids);
		}
		return result;
	}

	async children(id: string): Promise<string[]> {
		return [...(this.childrenOf.get(id) ?? [])];
	}

	async parent(id: string): Promise<string | null> {
		return this.parentOf.get(id) ?? null;
	}

	async attach(id: string, parentId: string | null): Promise<void> {
		if (parentId !== null) await this.assertNoCycle(id, parentId);
		const oldParent = this.parentOf.get(id) ?? null;
		if (oldParent !== null) this.childrenOf.get(oldParent)?.delete(id);
		this.parentOf.set(id, parentId);
		if (parentId !== null) this.addChild(parentId, id);
		if (!this.childrenOf.has(id)) this.childrenOf.set(id, new Set());
	}

	async move(id: string, newParentId: string | null): Promise<void> {
		if (newParentId !== null) await this.assertNoCycle(id, newParentId);
		const oldParent = this.parentOf.get(id) ?? null;
		if (oldParent !== null) this.childrenOf.get(oldParent)?.delete(id);
		this.parentOf.set(id, newParentId);
		if (newParentId !== null) this.addChild(newParentId, id);
	}

	async detach(id: string): Promise<void> {
		const parentId = this.parentOf.get(id) ?? null;
		const kids = [...(this.childrenOf.get(id) ?? [])];
		for (const kid of kids) {
			await this.move(kid, parentId);
		}
		if (parentId !== null) this.childrenOf.get(parentId)?.delete(id);
		this.parentOf.delete(id);
		this.childrenOf.delete(id);
	}

	private addChild(parentId: string, id: string): void {
		if (!this.childrenOf.has(parentId))
			this.childrenOf.set(parentId, new Set());
		this.childrenOf.get(parentId)!.add(id);
	}

	private async assertNoCycle(
		id: string,
		newParentId: string,
	): Promise<void> {
		if (
			id === newParentId ||
			(await this.chain(newParentId)).includes(id)
		) {
			throw new CycleError(id, newParentId);
		}
	}
}
