export type Listener<T> = (state: T, previous: T) => void;

/** A tiny observable store. The application renders from state, never the reverse. */
export class Store<T> {
  private listeners = new Set<Listener<T>>();

  constructor(private state: T) {}

  getState(): T {
    return this.state;
  }

  setState(next: T): void {
    if (Object.is(next, this.state)) return;
    const previous = this.state;
    this.state = next;
    for (const listener of this.listeners) listener(this.state, previous);
  }

  update(recipe: (state: T) => T): void {
    this.setState(recipe(this.state));
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
