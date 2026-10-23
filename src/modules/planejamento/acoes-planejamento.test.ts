import { describe, expect, it } from "vitest";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_APAGAR_EAP,
  ACAO_APLICAR,
  ACAO_GERAR_DISCIPLINAS,
  ACAO_HERDAR,
  ACAO_NOVAS_TAREFAS,
  ACAO_REAGENDAR,
  ACAO_SALVAR_MODELO,
  MOTIVO_DISCIPLINAS_COM_EAP,
  MOTIVO_EAP_VAZIA,
  itensDoPlanejamento,
} from "./acoes-planejamento";
import { MOTIVO_PLANO_TRAVADO } from "./trava-plano";

const base = {
  projetoId: "p1",
  podeGerir: true,
  verDatas: true,
  temTarefas: true,
  temDisciplinas: true,
  disciplinasSemEap: 2,
  planoTravado: false,
  impedimentoApagar: null as string | null,
};
const ids = (itens: AcaoItem[]) => itens.map((i) => (i.tipo === "separador" ? "—" : i.id));
const acao = (itens: AcaoItem[], id: string) => itens.find((i): i is AcaoItemAcao => i.tipo === "acao" && i.id === id)!;

describe("itensDoPlanejamento", () => {
  it("quem monta a EAP: tudo na ordem do mock, com Apagar EAP separado no fim", () => {
    expect(ids(itensDoPlanejamento(base))).toEqual([
      ACAO_NOVAS_TAREFAS,
      "—",
      "planejamento-exportar-excel",
      "planejamento-exportar-pdf",
      "—",
      ACAO_GERAR_DISCIPLINAS,
      ACAO_REAGENDAR,
      ACAO_HERDAR,
      ACAO_APLICAR,
      ACAO_SALVAR_MODELO,
      "—",
      ACAO_APAGAR_EAP,
    ]);
    expect(acao(itensDoPlanejamento(base), ACAO_APAGAR_EAP).variant).toBe("destructive");
  });

  it("exportar são links para as rotas do projeto", () => {
    const itens = itensDoPlanejamento(base);
    const hrefs = itens.flatMap((i) => (i.tipo === "link" ? [i.href] : []));
    expect(hrefs).toEqual(["/api/planejamento/p1/eap-export", "/api/planejamento/p1/pdf"]);
  });

  it("quem só consulta vê só os exportar; sem datas, nada", () => {
    expect(ids(itensDoPlanejamento({ ...base, podeGerir: false }))).toEqual(["planejamento-exportar-excel", "planejamento-exportar-pdf"]);
    expect(itensDoPlanejamento({ ...base, podeGerir: false, verDatas: false })).toEqual([]);
  });

  it("plano travado desabilita o que muda a estrutura, com a frase da trava; o resto segue", () => {
    const itens = itensDoPlanejamento({ ...base, planoTravado: true });
    expect(acao(itens, ACAO_NOVAS_TAREFAS).desabilitado).toBe(MOTIVO_PLANO_TRAVADO);
    expect(acao(itens, ACAO_GERAR_DISCIPLINAS).desabilitado).toBe(MOTIVO_PLANO_TRAVADO);
    expect(acao(itens, ACAO_REAGENDAR).desabilitado).toBeUndefined();
    expect(acao(itens, ACAO_SALVAR_MODELO).desabilitado).toBeUndefined();
  });

  it("EAP vazia: sem exportar, sem salvar modelo nem apagar; reagendar/herdar/aplicar dizem por quê", () => {
    const itens = itensDoPlanejamento({ ...base, temTarefas: false });
    expect(ids(itens)).toEqual([ACAO_NOVAS_TAREFAS, "—", ACAO_GERAR_DISCIPLINAS, ACAO_REAGENDAR, ACAO_HERDAR, ACAO_APLICAR]);
    for (const id of [ACAO_REAGENDAR, ACAO_HERDAR, ACAO_APLICAR]) expect(acao(itens, id).desabilitado).toBe(MOTIVO_EAP_VAZIA);
  });

  it("sem disciplinas não há Gerar EAP das disciplinas; apagar barrado mostra o motivo do servidor", () => {
    expect(ids(itensDoPlanejamento({ ...base, temDisciplinas: false }))).not.toContain(ACAO_GERAR_DISCIPLINAS);
    expect(acao(itensDoPlanejamento({ ...base, disciplinasSemEap: 0 }), ACAO_GERAR_DISCIPLINAS).desabilitado).toBe(MOTIVO_DISCIPLINAS_COM_EAP);
    const itens = itensDoPlanejamento({ ...base, impedimentoApagar: "Cronograma aprovado não se apaga." });
    expect(acao(itens, ACAO_APAGAR_EAP).desabilitado).toBe("Cronograma aprovado não se apaga.");
  });
});
