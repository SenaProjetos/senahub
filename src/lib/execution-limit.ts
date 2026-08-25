import "server-only";

export class ExecutionCapacityError extends Error {
  constructor() {
    super("Capacidade de execução temporariamente esgotada.");
    this.name = "ExecutionCapacityError";
  }
}

export type ExecutionLimit = {
  name: string;
  maximum: number;
  maximumQueue: number;
  queueTimeoutMs?: number;
};

type Waiter = { resolve: () => void; reject: (error: Error) => void; timeout?: ReturnType<typeof setTimeout> };
type Pool = { active: number; queue: Waiter[] };
type Limiter = (limit: ExecutionLimit) => Promise<() => void>;
type GlobalWithExecutionLimiter = typeof globalThis & { __senahubExecutionLimiter?: Limiter };

/** Cria um semáforo com fila finita. A função devolvida libera exatamente uma vaga. */
export function createExecutionLimiter(): Limiter {
  const pools = new Map<string, Pool>();

  return async ({ name, maximum, maximumQueue, queueTimeoutMs }) => {
    let pool = pools.get(name);
    if (!pool) {
      pool = { active: 0, queue: [] };
      pools.set(name, pool);
    }

    if (pool.active < maximum) {
      pool.active += 1;
    } else {
      if (pool.queue.length >= maximumQueue) throw new ExecutionCapacityError();
      await new Promise<void>((resolve, reject) => {
        const waiter: Waiter = { resolve, reject };
        if (queueTimeoutMs) {
          waiter.timeout = setTimeout(() => {
            const index = pool.queue.indexOf(waiter);
            if (index >= 0) pool.queue.splice(index, 1);
            reject(new ExecutionCapacityError());
          }, queueTimeoutMs);
        }
        pool.queue.push(waiter);
      });
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = pool.queue.shift();
      if (next) {
        if (next.timeout) clearTimeout(next.timeout);
        next.resolve();
      }
      else pool.active -= 1;
    };
  };
}

function globalLimiter(): Limiter {
  const global = globalThis as GlobalWithExecutionLimiter;
  global.__senahubExecutionLimiter ??= createExecutionLimiter();
  return global.__senahubExecutionLimiter;
}

/**
 * Reserva uma vaga global no processo. Assim como socket/pg-boss, globalThis evita
 * que bundles diferentes do Next mantenham semáforos independentes no mesmo servidor.
 */
export function acquireExecutionSlot(limit: ExecutionLimit): Promise<() => void> {
  return globalLimiter()(limit);
}
