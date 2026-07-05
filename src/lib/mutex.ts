export class Mutex {
  private queue: Array<() => void> = [];
  private locked: boolean = false;

  async lock(): Promise<() => void> {
    return new Promise(resolve => {
      const acquire = () => {
        this.locked = true;
        resolve(() => this.unlock());
      };

      if (!this.locked) {
        acquire();
      } else {
        this.queue.push(acquire);
      }
    });
  }

  private unlock() {
    this.locked = false;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

export const globalMutex = new Mutex();
