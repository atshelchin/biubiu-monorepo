export interface Interrupt {
    type: string;
    data?: unknown;
}

/**
 * Bridges async event callbacks to generator yield points.
 *
 * Event callbacks push interrupts into the queue.
 * The generator polls via next() and yields to the user when an interrupt arrives.
 */
export class InterruptQueue<T extends Interrupt = Interrupt> {
    private queue: T[] = [];
    private waiting: ((value: T | null) => void) | null = null;
    private timeoutId: ReturnType<typeof setTimeout> | null = null;

    push(item: T): void {
        if (this.waiting) {
            const resolve = this.waiting;
            this.waiting = null;
            this.clearTimeout();
            resolve(item);
        } else {
            this.queue.push(item);
        }
    }

    /**
     * Wait for the next interrupt, or return null after timeoutMs.
     */
    next(timeoutMs: number): Promise<T | null> {
        if (this.queue.length > 0) {
            return Promise.resolve(this.queue.shift()!);
        }

        return new Promise((resolve) => {
            this.waiting = resolve;
            this.timeoutId = setTimeout(() => {
                if (this.waiting === resolve) {
                    this.waiting = null;
                    this.timeoutId = null;
                    resolve(null);
                }
            }, timeoutMs);
        });
    }

    dispose(): void {
        this.clearTimeout();
        if (this.waiting) {
            this.waiting(null);
            this.waiting = null;
        }
        this.queue.length = 0;
    }

    private clearTimeout(): void {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }
}
