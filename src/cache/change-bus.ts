export interface ChangeEvent {
	definitionId: string;
	key: string;
	scopeKind: string;
	scopeRefId: string | null;
}

export interface ChangeBus {
	publish(event: ChangeEvent): Promise<void>;
	subscribe(listener: (event: ChangeEvent) => void | Promise<void>): void;
}

export class LocalBus implements ChangeBus {
	private readonly listeners = new Set<
		(event: ChangeEvent) => void | Promise<void>
	>();

	async publish(event: ChangeEvent): Promise<void> {
		await Promise.all(
			[...this.listeners].map((listener) =>
				Promise.resolve(listener(event)),
			),
		);
	}

	subscribe(listener: (event: ChangeEvent) => void | Promise<void>): void {
		this.listeners.add(listener);
	}
}
