/**
 * A jump history inside one document, like a browser's Back and Forward: before every jump
 * (to a file, a change, a heading) the app records where it was; Alt+← goes back there,
 * Alt+→ forward again. No DOM in here; a position is whatever the app needs (a scroll offset).
 */
export class JumpHistory<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(
    private readonly same: (a: T, b: T) => boolean = (a, b) => a === b,
    private readonly limit = 100,
  ) {}

  /** Before a jump: where the view is now. A new jump drops what lay ahead. */
  record(at: T) {
    const last = this.past[this.past.length - 1];
    if (last === undefined || !this.same(last, at)) this.past.push(at);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** Where to go back to from `at`, or undefined at the start. */
  back(at: T): T | undefined {
    return this.step(this.past, this.future, at);
  }

  /** Where to go forward to from `at`, or undefined at the end. */
  forward(at: T): T | undefined {
    return this.step(this.future, this.past, at);
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  private step(from: T[], to: T[], at: T): T | undefined {
    let target = from.pop();
    // Going back to where the view already is would look like nothing happened.
    while (target !== undefined && this.same(target, at)) target = from.pop();
    if (target === undefined) return undefined;
    to.push(at);
    return target;
  }
}
