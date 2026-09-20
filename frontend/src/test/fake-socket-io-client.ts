type Listener = (...arguments_: unknown[]) => void;

export interface FakeSocketCreation {
  options: Record<string, unknown>;
  socket: FakeSocket;
  url: string;
}

export class FakeSocket {
  public active = true;
  public disconnected = false;

  private readonly listeners = new Map<string, Set<Listener>>();

  public on(event: string, listener: Listener): this {
    const eventListeners = this.listeners.get(event) ?? new Set<Listener>();
    eventListeners.add(listener);
    this.listeners.set(event, eventListeners);
    return this;
  }

  public off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  public disconnect(): this {
    this.active = false;
    this.disconnected = true;
    return this;
  }

  public emitServer(event: string, ...arguments_: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...arguments_));
  }
}

const creations: FakeSocketCreation[] = [];

export function io(url: string, options: Record<string, unknown> = {}): FakeSocket {
  const socket = new FakeSocket();
  creations.push({ options, socket, url });
  return socket;
}

export function getFakeSocketCreations(): readonly FakeSocketCreation[] {
  return creations;
}

export function resetFakeSocketIo(): void {
  creations.splice(0, creations.length);
}
