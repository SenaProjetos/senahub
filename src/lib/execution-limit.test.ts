import { describe, expect, it } from "vitest";
import { ExecutionCapacityError, createExecutionLimiter } from "@/lib/execution-limit";

describe("createExecutionLimiter", () => {
  it("enfileira até o máximo e libera a próxima execução", async () => {
    const acquire = createExecutionLimiter();
    const limit = { name: "pdf", maximum: 1, maximumQueue: 1 };
    const releaseFirst = await acquire(limit);
    let secondStarted = false;
    const second = acquire(limit).then((release) => {
      secondStarted = true;
      return release;
    });

    await expect(acquire(limit)).rejects.toBeInstanceOf(ExecutionCapacityError);
    expect(secondStarted).toBe(false);

    releaseFirst();
    const releaseSecond = await second;
    expect(secondStarted).toBe(true);
    releaseSecond();
  });

  it("não libera duas vagas quando a mesma reserva é encerrada duas vezes", async () => {
    const acquire = createExecutionLimiter();
    const limit = { name: "pdf", maximum: 1, maximumQueue: 0 };
    const release = await acquire(limit);
    release();
    release();

    const next = await acquire(limit);
    next();
  });

  it("recusa uma espera que ultrapassa o prazo da fila", async () => {
    const acquire = createExecutionLimiter();
    const limit = { name: "pdf", maximum: 1, maximumQueue: 1, queueTimeoutMs: 5 };
    const release = await acquire(limit);

    await expect(acquire(limit)).rejects.toBeInstanceOf(ExecutionCapacityError);
    release();
  });
});
