import { describe, expect, it } from "vitest";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_DISCIPLINA,
  itensDaPaginaDisciplinas,
  itensDeDisciplina,
  itensDeStatus,
  MOTIVO_EXCLUIR_APROVADA,
  type ContextoAcoesDisciplina,
  type DisciplinaParaAcoes,
} from "./acoes-disciplina";

const ids = (itens: AcaoItem[]) => itens.map((i) => i.id);
const achar = (itens: AcaoItem[], id: string) => itens.find((i) => i.id === id) as AcaoItemAcao | undefined;

function disc(p: Partial<DisciplinaParaAcoes> = {}): DisciplinaParaAcoes {
  return {
    status: "entregue",
    usaPastas: false,
    qtdArquivos: 7,
    qtdRevisoes: 0,
    aguardandoConfirmacao: false,
    podeSolicitar: false,
    passo: { tom: "aviso", texto: "Para aprovar, falta enviar: Backup do modelo.", acao: "enviar" },
    ...p,
  };
}
const GESTOR: ContextoAcoesDisciplina = {
  podeGerir: true,
  podeMexerStatus: true,
  podeEnviar: true,
  podeDiario: true,
  podeAprovar: true,
  qtdTarefas: 2,
  hrefArquivos: "/projetos/p/arquivos?disciplinaId=d",
  hrefEnviar: "/projetos/p/arquivos?disciplinaId=d&enviar=1",
  hrefChat: "/chat?c=c1",
};
const LEITOR: ContextoAcoesDisciplina = {
  podeGerir: false,
  podeMexerStatus: false,
  podeEnviar: false,
  podeDiario: false,
  podeAprovar: false,
  qtdTarefas: null,
  hrefArquivos: "/projetos/p/arquivos?disciplinaId=d",
  hrefEnviar: "",
  hrefChat: null,
};

describe("itensDeDisciplina", () => {
  it("gestor: navegar, fluxo, gerir e excluir, nessa ordem", () => {
    expect(ids(itensDeDisciplina(disc(), GESTOR))).toEqual([
      "arquivos",
      "enviar",
      "entrega",
      "revisoes",
      "tarefas",
      "diario",
      "chat",
      "sep-fluxo",
      "status",
      "aprovar",
      "sep-gerir",
      "responsaveis",
      "etapas",
      "editar",
      "copiar-link",
      "sep-excluir",
      "excluir",
    ]);
  });

  it("quem só lê não vê o que o perfil não permite (e não sobra separador)", () => {
    expect(ids(itensDeDisciplina(disc(), LEITOR))).toEqual(["arquivos", "entrega", "revisoes", "sep-fluxo", "copiar-link"]);
  });

  it("aprovar entrega: desabilitado com o MESMO motivo do aviso do card; habilitado quando pronta", () => {
    expect(achar(itensDeDisciplina(disc(), GESTOR), ACAO_DISCIPLINA.aprovar)?.desabilitado).toBe(
      "Para aprovar, falta enviar: Backup do modelo.",
    );
    const pronta = disc({ passo: { tom: "pronto", texto: "2 arquivos validados — pronta para aprovação.", acao: "aprovar" } });
    expect(achar(itensDeDisciplina(pronta, GESTOR), ACAO_DISCIPLINA.aprovar)?.desabilitado).toBeUndefined();
  });

  it("aprovada: sem mudar status nem aprovar; reabrir no lugar; excluir inerte com o motivo", () => {
    const itens = itensDeDisciplina(disc({ status: "aprovado", passo: null }), GESTOR);
    expect(ids(itens)).not.toContain("status");
    expect(ids(itens)).not.toContain("aprovar");
    expect(ids(itens)).toContain("reabrir");
    expect(achar(itens, ACAO_DISCIPLINA.excluir)?.desabilitado).toBe(MOTIVO_EXCLUIR_APROVADA);
  });

  it("aprovação/laudo: confirmar e recusar para o gestor; marcar aprovado para o responsável", () => {
    expect(ids(itensDeDisciplina(disc({ usaPastas: true, aguardandoConfirmacao: true }), GESTOR))).toEqual(
      expect.arrayContaining(["confirmar", "recusar"]),
    );
    const doResponsavel = itensDeDisciplina(disc({ usaPastas: true, podeSolicitar: true }), { ...LEITOR, podeMexerStatus: true });
    expect(ids(doResponsavel)).toContain("solicitar");
  });

  it("Arquivos leva à aba Arquivos na pasta da disciplina", () => {
    expect(itensDeDisciplina(disc(), GESTOR).find((i) => i.id === "arquivos")).toMatchObject({
      tipo: "link",
      href: "/projetos/p/arquivos?disciplinaId=d",
    });
  });

  it("contagem no rótulo só quando há algo", () => {
    const itens = itensDeDisciplina(disc({ qtdArquivos: 0, qtdRevisoes: 3 }), GESTOR);
    expect(achar(itens, "arquivos")?.rotulo).toBe("Arquivos");
    expect(achar(itens, "revisoes")?.rotulo).toBe("Revisões (3)");
  });
});

describe("itensDeStatus", () => {
  it("só as transições permitidas, na ordem do fluxo; o atual marcado; Aprovado inerte", () => {
    const itens = itensDeStatus("entregue");
    expect(itens.map((i) => [i.rotulo, !!i.marcado, i.desabilitado ?? null])).toEqual([
      ["Entregue", true, null],
      ["Em revisão", false, null],
      ["Aprovado", false, "Só aprovando a entrega."],
    ]);
    expect(itensDeStatus("aguardando").map((i) => i.rotulo)).toEqual(["Aguardando", "Em andamento", "Aprovado"]);
  });
});

describe("itensDaPaginaDisciplinas", () => {
  const contagem = { aguardando: 1, em_revisao: 0, em_andamento: 2, entregue: 1, aprovado: 1 };

  it("gestor adiciona; todos filtram, com a contagem e o filtro atual marcado", () => {
    const itens = itensDaPaginaDisciplinas({ podeGerir: true, temCatalogo: true, filtro: "entregue", contagem, total: 5 });
    expect(ids(itens)).toEqual(["adicionar", "catalogo", "sep-mostrar", "mostrar"]);
    const mostrar = itens.find((i) => i.id === "mostrar");
    const sub = mostrar && mostrar.tipo === "sub" ? mostrar.itens : [];
    expect(sub.map((i) => (i.tipo === "acao" ? [i.rotulo, !!i.marcado] : null))).toEqual([
      ["Todas (5)", false],
      ["Aguardando (1)", false],
      ["Em revisão (0)", false],
      ["Em andamento (2)", false],
      ["Entregue (1)", true],
      ["Aprovado (1)", false],
    ]);
  });

  it("quem não gere só filtra", () => {
    expect(ids(itensDaPaginaDisciplinas({ podeGerir: false, temCatalogo: true, filtro: null, contagem, total: 5 }))).toEqual(["mostrar"]);
  });
});
