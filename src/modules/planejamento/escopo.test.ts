import { beforeEach, describe, expect, it, vi } from "vitest";

const visivel = vi.fn();
vi.mock("./queries", () => ({ projetoVisivel: (...a: unknown[]) => visivel(...a) }));

import { noEscopoDoProjeto } from "./escopo";
import type { ActionContext } from "@/lib/with-action";

const ctx = { user: { id: "u1" } } as unknown as ActionContext;

describe("noEscopoDoProjeto", () => {
  beforeEach(() => visivel.mockReset());

  it("projeto fora do escopo: recusa como 'não encontrado' e não roda o handler", async () => {
    visivel.mockResolvedValue(null);
    const handler = vi.fn(async () => "ok");
    await expect(noEscopoDoProjeto((i: { projetoId: string }) => i.projetoId, handler)({ projetoId: "p1" }, ctx)).rejects.toThrow(
      "Projeto não encontrado.",
    );
    expect(handler).not.toHaveBeenCalled();
    expect(visivel).toHaveBeenCalledWith(ctx.user, "p1");
  });

  it("projeto visível: roda o handler", async () => {
    visivel.mockResolvedValue({ id: "p1" });
    const r = await noEscopoDoProjeto((i: { projetoId: string }) => i.projetoId, async () => "ok")({ projetoId: "p1" }, ctx);
    expect(r).toBe("ok");
  });

  it("projeto que não se resolve (linha inexistente): o handler responde o erro dele", async () => {
    const handler = vi.fn(async () => "resposta do handler");
    const r = await noEscopoDoProjeto(async () => {
      throw new Error("Tarefa não encontrada.");
    }, handler)({}, ctx);
    expect(r).toBe("resposta do handler");
    expect(visivel).not.toHaveBeenCalled();
  });
});

describe("guarda: em arquivo 'use server', o projetoDe é async", () => {
  // O compilador do Next recusa função síncrona solta como argumento num arquivo "use server" ("Server Actions must be
  // async functions") — e tsc, lint e os testes não pegam: só a página quebra em runtime.
  it("toda chamada de noEscopoDoProjeto em src/ passa uma função async", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raiz = join(__dirname, "..", "..");
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) varrer(p);
        else if (/\.tsx?$/.test(nome) && !nome.endsWith(".test.ts")) arquivos.push(p);
      }
    };
    varrer(raiz);
    const sincronas = arquivos.flatMap((p) =>
      [...readFileSync(p, "utf8").matchAll(/noEscopoDoProjeto\((?!async\b)/g)].map(() => p),
    );
    expect(sincronas.filter((p) => !p.endsWith("escopo.ts"))).toEqual([]);
  });
});
