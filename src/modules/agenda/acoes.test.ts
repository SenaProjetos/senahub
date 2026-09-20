import { describe, expect, it } from "vitest";

import {
  ACAO_DUPLICAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_NOVO_NO_DIA,
  ACAO_VER_DIA,
  itensDeCompromisso,
  itensDeDia,
} from "./acoes";
import {
  DURACAO_PADRAO_MIN,
  duracaoDoRascunho,
  paraLocalDT,
  rascunhoDeDia,
  rascunhoDeDuplicata,
  somarMinutosDT,
} from "./rascunho";

const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);

describe("itensDeCompromisso", () => {
  const meu = { criadorId: "eu" };
  const alheio = { criadorId: "outro" };

  it("criador vê editar, duplicar e excluir", () => {
    const itens = itensDeCompromisso(meu, { meId: "eu", ehAdmin: false });
    expect(achar(itens, ACAO_EDITAR)).toBeDefined();
    expect(achar(itens, ACAO_DUPLICAR)).toBeDefined();
    expect(achar(itens, ACAO_EXCLUIR)).toBeDefined();
  });

  it("admin gere o compromisso de qualquer um", () => {
    expect(itensDeCompromisso(alheio, { meId: "eu", ehAdmin: true }).length).toBeGreaterThan(1);
  });

  // Regra 4: só sobraria "Duplicar" — linha de ação única não ganha menu.
  it("quem não é criador nem admin fica sem menu", () => {
    expect(itensDeCompromisso(alheio, { meId: "eu", ehAdmin: false })).toEqual([]);
  });

  it("excluir é destrutivo e pede confirmação (regra 4 da ADR-0002)", () => {
    const e = achar(itensDeCompromisso(meu, { meId: "eu", ehAdmin: false }), ACAO_EXCLUIR);
    expect(e).toMatchObject({ variant: "destructive" });
    expect((e as { confirmar?: { titulo: string } }).confirmar?.titulo).toBeTruthy();
  });
});

describe("itensDeDia", () => {
  it("oferece criar no dia e ir para a vista dele", () => {
    expect(achar(itensDeDia(), ACAO_NOVO_NO_DIA)).toBeDefined();
    expect(achar(itensDeDia(), ACAO_VER_DIA)).toBeDefined();
  });
});

describe("rascunhos", () => {
  it("um dia começa às 9h e dura 1 h", () => {
    const r = rascunhoDeDia(new Date(2026, 8, 20, 15, 30));
    expect(r.inicio).toBe("2026-09-20T09:00");
    expect(r.fim).toBe("2026-09-20T10:00");
  });

  it("duplicata mantém título, local e horário e tira o próprio usuário dos convidados", () => {
    const ini = new Date(2026, 8, 21, 14, 0);
    const fim = new Date(2026, 8, 21, 15, 30);
    const r = rascunhoDeDuplicata(
      {
        titulo: "Reunião",
        local: null,
        inicio: ini.toISOString(),
        fim: fim.toISOString(),
        participantesIds: ["eu", "ana"],
      },
      "eu",
    );
    expect(r).toEqual({
      titulo: "Reunião",
      local: "",
      inicio: "2026-09-21T14:00",
      fim: "2026-09-21T15:30",
      participantesIds: ["ana"],
    });
    expect(duracaoDoRascunho(r)).toBe(90);
  });

  it("sem fim válido, a duração cai para a padrão", () => {
    expect(duracaoDoRascunho({ inicio: "2026-09-21T14:00", fim: "" })).toBe(DURACAO_PADRAO_MIN);
    expect(duracaoDoRascunho({ inicio: "2026-09-21T14:00", fim: "2026-09-21T13:00" })).toBe(DURACAO_PADRAO_MIN);
  });

  it("paraLocalDT e somarMinutosDT atravessam a virada de dia", () => {
    expect(paraLocalDT(new Date(2026, 0, 5, 7, 4))).toBe("2026-01-05T07:04");
    expect(somarMinutosDT("2026-01-31T23:30", 60)).toBe("2026-02-01T00:30");
    expect(somarMinutosDT("", 60)).toBe("");
  });
});
