export interface ChangeEvent {
	definitionId: string;
	key: string;
	scopeKind: string;
	scopeRefId: string | null;
}

export type ChangeListener = (event: ChangeEvent) => void | Promise<void>;

export interface ChangeBus {
	publish(event: ChangeEvent): Promise<void>;
	subscribe(listener: ChangeListener): void;
	unsubscribe(listener: ChangeListener): void;
}

export class LocalBus implements ChangeBus {
	private readonly listeners = new Set<ChangeListener>();

	async publish(event: ChangeEvent): Promise<void> {
		await Promise.all(
			[...this.listeners].map((listener) =>
				Promise.resolve(listener(event)),
			),
		);
	}

	subscribe(listener: ChangeListener): void {
		this.listeners.add(listener);
	}

	unsubscribe(listener: ChangeListener): void {
		this.listeners.delete(listener);
	}
}
