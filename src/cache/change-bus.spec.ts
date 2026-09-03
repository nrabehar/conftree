import { LocalBus } from './change-bus';

describe('LocalBus', () => {
	it('delivers a published event to every subscribed listener', async () => {
		const bus = new LocalBus();
		const received: string[] = [];
		bus.subscribe((event) => {
			received.push(event.key);
		});

		await bus.publish({
			definitionId: 'd1',
			key: 'k',
			scopeKind: 'user',
			scopeRefId: 'u1',
		});

		expect(received).toEqual(['k']);
	});

	it('unsubscribe() stops that listener from receiving further events, without affecting others', async () => {
		const bus = new LocalBus();
		const a: string[] = [];
		const b: string[] = [];
		const listenerA = (event: { key: string }) => {
			a.push(event.key);
		};
		bus.subscribe(listenerA);
		bus.subscribe((event) => {
			b.push(event.key);
		});

		bus.unsubscribe(listenerA);
		await bus.publish({
			definitionId: 'd1',
			key: 'k',
			scopeKind: 'user',
			scopeRefId: 'u1',
		});

		expect(a).toEqual([]);
		expect(b).toEqual(['k']);
	});

	it('unsubscribing a listener that was never subscribed is a no-op', () => {
		const bus = new LocalBus();
		expect(() => bus.unsubscribe(() => {})).not.toThrow();
	});
});
