import { describe, expect, it } from "vitest";
import {
  ACAO_ABRIR,
  ACAO_ATUALIZAR,
  ACAO_AVANCAR,
  ACAO_EXCLUIR,
  ACAO_GERAR_CARD,
  ACAO_INSERIR_ACIMA,
  ACAO_RECUAR,
  MOTIVO_SEM_CARD_EM_RASCUNHO,
  itensDeLinhaEap,
  type LinhaParaAcoes,
} from "./acoes-eap";
import { MOTIVO_IRMA_E_MARCO, MOTIVO_NIVEL_MAIS_ALTO, MOTIVO_SEM_IRMA_ACIMA } from "./arvore-eap";

const linha: LinhaParaAcoes = { nome: "Fôrmas", ehResumo: false, temIrmaAcima: true, irmaAcimaEMarco: false, nivel: 2, subtarefas: 0 };
const admin = { podeGerir: true, podeExecutado: true, cronogramaAprovado: true };
const ids = (l: LinhaParaAcoes, ctx = admin) => itensDeLinhaEap(l, ctx).flatMap((i) => (i.tipo === "acao" ? [i.id] : []));
const item = (l: LinhaParaAcoes, id: string, ctx = admin) => itensDeLinhaEap(l, ctx).find((i) => i.id === id);

describe("itensDeLinhaEap", () => {
  it("quem monta e acompanha vê tudo", () => {
    expect(ids(linha)).toEqual([ACAO_ABRIR, ACAO_INSERIR_ACIMA, ACAO_RECUAR, ACAO_AVANCAR, ACAO_ATUALIZAR, ACAO_GERAR_CARD, ACAO_EXCLUIR]);
  });

  it("perfil só de acompanhamento vê só 'atualizar' — e uma ação só não vira menu", () => {
    const so = itensDeLinhaEap(linha, { podeGerir: false, podeExecutado: true, cronogramaAprovado: true });
    expect(so.map((i) => i.id)).toEqual([ACAO_ATUALIZAR]);
  });

  it("perfil sem nenhuma permissão não tem ação (o menu nativo do navegador volta)", () => {
    expect(itensDeLinhaEap(linha, { podeGerir: false, podeExecutado: false, cronogramaAprovado: true })).toEqual([]);
  });

  it("nunca sobra separador no início, no fim ou em dupla", () => {
    for (const ctx of [admin, { ...admin, podeExecutado: false }, { ...admin, podeGerir: false }]) {
      const it = itensDeLinhaEap(linha, ctx);
      if (it.length === 0) continue;
      expect(it[0].tipo).not.toBe("separador");
      expect(it[it.length - 1].tipo).not.toBe("separador");
      for (let i = 1; i < it.length; i++) expect(it[i].tipo === "separador" && it[i - 1].tipo === "separador").toBe(false);
    }
  });

  it("recuar desabilitado diz o motivo — o mesmo texto do servidor", () => {
    expect(item({ ...linha, temIrmaAcima: false }, ACAO_RECUAR)).toMatchObject({ desabilitado: MOTIVO_SEM_IRMA_ACIMA });
    expect(item({ ...linha, irmaAcimaEMarco: true }, ACAO_RECUAR)).toMatchObject({ desabilitado: MOTIVO_IRMA_E_MARCO });
    expect(item(linha, ACAO_RECUAR)).not.toHaveProperty("desabilitado", expect.any(String));
  });

  it("avançar no nível mais alto diz o motivo", () => {
    expect(item({ ...linha, nivel: 1 }, ACAO_AVANCAR)).toMatchObject({ desabilitado: MOTIVO_NIVEL_MAIS_ALTO });
    expect(item({ ...linha, nivel: 2 }, ACAO_AVANCAR)?.tipo).toBe("acao");
  });

  it("gerar card em rascunho fica desabilitado com o motivo", () => {
    expect(item(linha, ACAO_GERAR_CARD, { ...admin, cronogramaAprovado: false })).toMatchObject({ desabilitado: MOTIVO_SEM_CARD_EM_RASCUNHO });
    expect(item(linha, ACAO_GERAR_CARD)).not.toHaveProperty("desabilitado", expect.any(String));
  });

  it("agrupamento não atualiza datas reais nem gera card", () => {
    expect(ids({ ...linha, ehResumo: true, subtarefas: 3 })).toEqual([ACAO_ABRIR, ACAO_INSERIR_ACIMA, ACAO_RECUAR, ACAO_AVANCAR, ACAO_EXCLUIR]);
  });

  it("excluir é destrutivo e pede confirmação, dizendo quantas subtarefas vão junto", () => {
    const ex = item({ ...linha, ehResumo: true, subtarefas: 3 }, ACAO_EXCLUIR);
    expect(ex).toMatchObject({ variant: "destructive" });
    expect(ex && ex.tipo === "acao" && ex.confirmar?.titulo).toBe('Excluir "Fôrmas"?');
    expect(ex && ex.tipo === "acao" && ex.confirmar?.descricao).toMatch(/3 subtarefas, que também serão excluídas/);
    const um = item({ ...linha, ehResumo: true, subtarefas: 1 }, ACAO_EXCLUIR);
    expect(um && um.tipo === "acao" && um.confirmar?.descricao).toMatch(/1 subtarefa, que também será excluída/);
    const folha = item(linha, ACAO_EXCLUIR);
    expect(folha && folha.tipo === "acao" && folha.confirmar?.descricao).not.toMatch(/subtarefa/);
  });
});
