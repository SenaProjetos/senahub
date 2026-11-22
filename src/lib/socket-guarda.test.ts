import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de regressão do Socket.io: a conta externa (cliente do portal) conecta, então TODO evento de entrada novo em
 * `socket.ts` precisa recusá-la antes de fazer qualquer coisa — a primeira instrução do handler é
 * `if (!aceitaEvento(externo, "<evento>")) return;`. Só `disconnect` fica fora (é do próprio socket, não um pedido).
 * E o handshake recusa sessão de conta desativada (`conexaoAceita`).
 */

const SOCKET = path.resolve(__dirname, "socket.ts");
const SEM_PORTA = new Set(["disconnect"]);

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Cada `socket.on("<evento>", … => {`: o evento e a primeira instrução do corpo do handler. */
function handlers(src: string): { evento: string; linha: number; primeira: string }[] {
  const limpo = semComentarios(src);
  const re = /\bsocket\.on\(\s*["']([^"']+)["']\s*,/g;
  const achados: { evento: string; linha: number; primeira: string }[] = [];
  for (let m = re.exec(limpo); m; m = re.exec(limpo)) {
    const seta = limpo.indexOf("=>", m.index);
    const abre = seta === -1 ? -1 : limpo.indexOf("{", seta);
    const corpo = abre === -1 ? "" : limpo.slice(abre + 1);
    const fim = corpo.indexOf(";");
    achados.push({
      evento: m[1],
      linha: limpo.slice(0, m.index).split("\n").length,
      primeira: (fim === -1 ? corpo : corpo.slice(0, fim + 1)).replace(/\s+/g, " ").trim(),
    });
  }
  return achados;
}

function semPorta(src: string): string[] {
  return handlers(src)
    .filter((h) => !SEM_PORTA.has(h.evento))
    .filter((h) => h.primeira !== `if (!aceitaEvento(externo, "${h.evento}")) return;`)
    .map((h) => `socket.ts:${h.linha} "${h.evento}"`);
}

describe("handlers do Socket.io recusam a conta externa", () => {
  it("o detector acha o handler sem porta e aceita o com porta", () => {
    const bom = `socket.on("x", async (id: string) => {
      // comentário antes
      if (!aceitaEvento(externo, "x")) return;
      fazer();
    });
    socket.on("disconnect", () => { limpar(); });`;
    const ruim = `socket.on("y", (id: string) => {
      fazer();
      if (!aceitaEvento(externo, "y")) return;
    });
    socket.on("z", () => {
      if (!aceitaEvento(externo, "outro")) return;
    });`;
    expect(semPorta(bom)).toEqual([]);
    expect(semPorta(ruim)).toEqual(['socket.ts:1 "y"', 'socket.ts:5 "z"']);
  });

  it("todo socket.on de socket.ts (menos disconnect) começa por aceitaEvento", () => {
    const src = readFileSync(SOCKET, "utf8");
    expect(handlers(src).length).toBeGreaterThan(1);
    expect(semPorta(src)).toEqual([]);
  });

  it("o handshake recusa conta desativada (conexaoAceita)", () => {
    const src = semComentarios(readFileSync(SOCKET, "utf8"));
    expect(src).toMatch(/if\s*\(\s*!conexaoAceita\(/);
  });
});
