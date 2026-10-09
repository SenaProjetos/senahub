import { describe, expect, it } from "vitest";

import { ESTADOS_REVISAO, type EstadoRevisao } from "./estados";
import {
  MOTIVO_BLOQUEADA,
  MOTIVO_EXIGE_MOTIVO,
  MOTIVO_FORA_DO_CICLO_ACAO,
  TRANSICOES,
  acoesPossiveis,
  motivoParaNaoAplicar,
  motivoParaNaoRemover,
  motivoParaNaoTransicionar,
  type AcaoCiclo,
} from "./transicoes";

const r = (estado: EstadoRevisao, p: { bloqueada?: boolean; participa?: boolean } = {}) => ({
  estado,
  bloqueada: p.bloqueada ?? false,
  participa: p.participa ?? true,
});

const pessoa = { ator: "pessoa" as const, motivo: "motivo" };

describe("tabela de transições", () => {
  // Matriz completa: para cada ação × estado de origem, só o que a tabela lista é permitido.
  const permitidas: Record<AcaoCiclo, EstadoRevisao[]> = {
    enviar_analise: ["em_andamento"],
    devolver: ["compartilhado"],
    publicar: ["compartilhado"],
    arquivar: ["publicado"],
    substituir: ["em_andamento", "compartilhado", "publicado"],
  };
  for (const acao of Object.keys(permitidas) as AcaoCiclo[]) {
    for (const estado of ESTADOS_REVISAO) {
      const ator = acao === "substituir" ? "sistema" : "pessoa";
      const ok = permitidas[acao].includes(estado);
      it(`${acao} a partir de ${estado}: ${ok ? "permitido" : "proibido"}`, () => {
        const motivo = motivoParaNaoTransicionar(acao, r(estado), { ator, motivo: "x" });
        if (ok) expect(motivo).toBeNull();
        else expect(motivo).not.toBeNull();
      });
    }
  }

  it("I2: publicado nunca volta (devolver, enviar e publicar de novo são recusados)", () => {
    for (const acao of ["devolver", "enviar_analise", "publicar"] as const) {
      expect(motivoParaNaoTransicionar(acao, r("publicado"), pessoa)).toMatch(/nova revisão/);
    }
  });

  it("I3: arquivado é terminal — nenhuma ação, nem do sistema", () => {
    for (const acao of Object.keys(TRANSICOES) as AcaoCiclo[]) {
      expect(motivoParaNaoTransicionar(acao, r("arquivado"), { ator: "sistema", motivo: "x" })).not.toBeNull();
    }
    expect(acoesPossiveis("arquivado")).toEqual([]);
  });

  it("I7: bloqueio ativo impede qualquer transição, inclusive a do sistema", () => {
    expect(motivoParaNaoTransicionar("publicar", r("compartilhado", { bloqueada: true }), pessoa)).toBe(MOTIVO_BLOQUEADA);
    expect(motivoParaNaoTransicionar("substituir", r("publicado", { bloqueada: true }), { ator: "sistema" })).toBe(MOTIVO_BLOQUEADA);
  });

  it("I8: devolver e arquivar à mão exigem motivo; substituir é só do sistema", () => {
    expect(motivoParaNaoTransicionar("devolver", r("compartilhado"), { ator: "pessoa", motivo: " " })).toBe(MOTIVO_EXIGE_MOTIVO);
    expect(motivoParaNaoTransicionar("arquivar", r("publicado"), { ator: "pessoa" })).toBe(MOTIVO_EXIGE_MOTIVO);
    expect(motivoParaNaoTransicionar("substituir", r("publicado"), pessoa)).toMatch(/só pelo sistema/);
  });

  it("documento fora do ciclo não transiciona", () => {
    expect(motivoParaNaoTransicionar("enviar_analise", r("em_andamento", { participa: false }), pessoa)).toBe(MOTIVO_FORA_DO_CICLO_ACAO);
  });

  it("ações oferecidas a uma pessoa por estado", () => {
    expect(acoesPossiveis("em_andamento")).toEqual(["enviar_analise"]);
    expect(acoesPossiveis("compartilhado")).toEqual(["devolver", "publicar"]);
    expect(acoesPossiveis("publicado")).toEqual(["arquivar"]);
  });
});

describe("controles", () => {
  const base = (estado: EstadoRevisao, ativos: { tipo: "liberado_obra" | "enviado_cliente" | "bloqueio" | "restricao"; origem: string | null }[] = []) => ({
    ...r(estado, { bloqueada: ativos.some((a) => a.tipo === "bloqueio") }),
    ativos,
  });

  it("I5: liberado para obra e enviado ao cliente só em revisão publicada", () => {
    for (const estado of ["em_andamento", "compartilhado"] as const) {
      expect(motivoParaNaoAplicar("liberado_obra", base(estado), { motivo: "x" })).toMatch(/publicada/);
      expect(motivoParaNaoAplicar("enviado_cliente", base(estado), { motivo: "x" })).toMatch(/publicada/);
    }
    expect(motivoParaNaoAplicar("liberado_obra", base("publicado"), { motivo: "x" })).toBeNull();
  });

  it("um de cada controle de pasta por revisão", () => {
    expect(motivoParaNaoAplicar("liberado_obra", base("publicado", [{ tipo: "liberado_obra", origem: null }]), { motivo: "x" })).toMatch(/já está/);
  });

  it("restrição ativa impede liberar para obra", () => {
    expect(motivoParaNaoAplicar("liberado_obra", base("publicado", [{ tipo: "restricao", origem: null }]), { motivo: "x" })).toMatch(/restrição/);
  });

  it("bloqueio pede escopo e motivo; nada em revisão arquivada", () => {
    expect(motivoParaNaoAplicar("bloqueio", base("publicado"), { motivo: "x", escopos: [] })).toMatch(/bloqueado/);
    expect(motivoParaNaoAplicar("bloqueio", base("publicado"), { escopos: ["download"] })).toBe(MOTIVO_EXIGE_MOTIVO);
    expect(motivoParaNaoAplicar("restricao", base("arquivado"), { motivo: "x" })).toMatch(/somente leitura/);
    expect(motivoParaNaoAplicar("bloqueio", base("em_andamento"), { motivo: "x", escopos: ["download"] })).toBeNull();
  });

  it("restrição dos apontamentos não sai à mão; remoção manual exige motivo", () => {
    expect(motivoParaNaoRemover({ tipo: "restricao", origem: "pendencias" }, { ator: "pessoa", motivo: "x" })).toMatch(/sozinha/);
    expect(motivoParaNaoRemover({ tipo: "restricao", origem: "pendencias" }, { ator: "sistema" })).toBeNull();
    expect(motivoParaNaoRemover({ tipo: "bloqueio", origem: null }, { ator: "pessoa" })).toBe(MOTIVO_EXIGE_MOTIVO);
  });
});
