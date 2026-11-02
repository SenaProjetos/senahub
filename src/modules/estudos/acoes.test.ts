import { describe, expect, it } from "vitest";

import type { AcaoItem } from "@/components/ui/acoes";
import { ACAO_CARGA_REMOVER } from "@/modules/ferramentas/acoes-carga";

import {
  ACAO_AMBIENTE_DESCER,
  ACAO_AMBIENTE_DUPLICAR,
  ACAO_AMBIENTE_REMOVER,
  ACAO_AMBIENTE_SUBIR,
  ACAO_ESTUDO_DUPLICAR,
  ACAO_ESTUDO_EXCLUIR,
  MOTIVO_AMBIENTES_CHEIO,
  MOTIVO_COPIA_NAO_CABE,
  MOTIVO_LIMITE_ESTUDOS,
  MOTIVO_PRIMEIRO_AMBIENTE,
  MOTIVO_SALVE_ANTES,
  MOTIVO_ULTIMO_AMBIENTE,
  ambienteDoMover,
  hrefDaMemoria,
  hrefDoEstudo,
  itensDeAmbiente,
  itensDeCargaDoEstudo,
  itensDeEstudo,
} from "./acoes";
import { MAX_AMBIENTES, MAX_CARGAS_ESTUDO, MAX_ESTUDOS_POR_PROJETO } from "./conteudo";

const ids = (itens: AcaoItem[]) => itens.map((i) => i.id);
function acao(itens: AcaoItem[], id: string) {
  const item = itens.find((i) => i.id === id);
  if (!item || item.tipo !== "acao") throw new Error(`sem ação ${id}`);
  return item;
}

describe("itensDeEstudo", () => {
  const base = { projetoId: "p1", estudoId: "e1", totalEstudos: 2 };

  it("quem edita: abrir, duplicar, memórias e excluir (com confirmação)", () => {
    const itens = itensDeEstudo({ ...base, podeEditar: true });
    expect(ids(itens)).toEqual(["abrir-estudo", ACAO_ESTUDO_DUPLICAR, "sep-memoria", "memoria-pdf", "memoria-docx", "memoria-xlsx", "sep-excluir", ACAO_ESTUDO_EXCLUIR]);
    expect(acao(itens, ACAO_ESTUDO_EXCLUIR).confirmar?.titulo).toBe("Excluir este estudo?");
    expect(acao(itens, ACAO_ESTUDO_EXCLUIR).variant).toBe("destructive");
  });

  it("quem só lê: sem duplicar nem excluir (o item some), mantém abrir e memórias", () => {
    const itens = itensDeEstudo({ ...base, podeEditar: false });
    expect(ids(itens)).toEqual(["abrir-estudo", "sep-memoria", "memoria-pdf", "memoria-docx", "memoria-xlsx"]);
  });

  it("limite de estudos: duplicar fica inerte com o motivo", () => {
    const itens = itensDeEstudo({ ...base, podeEditar: true, totalEstudos: MAX_ESTUDOS_POR_PROJETO });
    expect(acao(itens, ACAO_ESTUDO_DUPLICAR).desabilitado).toBe(MOTIVO_LIMITE_ESTUDOS);
  });

  it("alterações não salvas: duplicar fica inerte com o motivo", () => {
    const itens = itensDeEstudo({ ...base, podeEditar: true, alterado: true });
    expect(acao(itens, ACAO_ESTUDO_DUPLICAR).desabilitado).toBe(MOTIVO_SALVE_ANTES);
  });

  it("os links apontam para a página do estudo e para a rota da memória", () => {
    const itens = itensDeEstudo({ ...base, podeEditar: true });
    expect(itens.find((i) => i.id === "abrir-estudo")).toMatchObject({ href: hrefDoEstudo("p1", "e1") });
    expect(itens.find((i) => i.id === "memoria-xlsx")).toMatchObject({ href: hrefDaMemoria("e1", "xlsx") });
    expect(hrefDaMemoria("e1", "pdf")).toBe("/api/estudos/e1/memoria?formato=pdf");
  });
});

describe("itensDeAmbiente", () => {
  const meio = { indice: 1, total: 3, cargas: 2, totalCargas: 10 };

  it("ambiente do meio: tudo habilitado", () => {
    const itens = itensDeAmbiente(meio);
    for (const id of [ACAO_AMBIENTE_DUPLICAR, ACAO_AMBIENTE_SUBIR, ACAO_AMBIENTE_DESCER, ACAO_AMBIENTE_REMOVER]) {
      expect(acao(itens, id).desabilitado).toBeUndefined();
    }
  });

  it("primeiro não sobe, último não desce — com o motivo", () => {
    expect(acao(itensDeAmbiente({ ...meio, indice: 0 }), ACAO_AMBIENTE_SUBIR).desabilitado).toBe(MOTIVO_PRIMEIRO_AMBIENTE);
    expect(acao(itensDeAmbiente({ ...meio, indice: 2 }), ACAO_AMBIENTE_DESCER).desabilitado).toBe(MOTIVO_ULTIMO_AMBIENTE);
  });

  it("não duplica com o máximo de ambientes nem quando a cópia estoura o máximo de cargas", () => {
    expect(acao(itensDeAmbiente({ ...meio, total: MAX_AMBIENTES }), ACAO_AMBIENTE_DUPLICAR).desabilitado).toBe(MOTIVO_AMBIENTES_CHEIO);
    expect(acao(itensDeAmbiente({ ...meio, cargas: 5, totalCargas: MAX_CARGAS_ESTUDO - 4 }), ACAO_AMBIENTE_DUPLICAR).desabilitado).toBe(MOTIVO_COPIA_NAO_CABE);
  });

  it("remover pede confirmação e cita quantas cargas saem", () => {
    const remover = acao(itensDeAmbiente(meio), ACAO_AMBIENTE_REMOVER);
    expect(remover.variant).toBe("destructive");
    expect(remover.confirmar?.descricao).toContain("2 cargas");
    expect(acao(itensDeAmbiente({ ...meio, cargas: 1 }), ACAO_AMBIENTE_REMOVER).confirmar?.descricao).toContain("1 carga.");
    expect(acao(itensDeAmbiente({ ...meio, cargas: 0 }), ACAO_AMBIENTE_REMOVER).confirmar?.descricao).not.toContain("carga");
  });
});

describe("itensDeCargaDoEstudo", () => {
  const ambientes = [
    { id: "a1", nome: "Sala" },
    { id: "a2", nome: "Cozinha" },
    { id: "a3", nome: "Garagem" },
  ];

  it("oferece 'Mover para o ambiente' só com os OUTROS ambientes, antes do separador de remover", () => {
    const itens = itensDeCargaDoEstudo({ indice: 0, total: 2, totalGeral: 5, ambientes, ambienteAtualId: "a1" });
    const mover = itens.find((i) => i.id === "mover-carga");
    expect(mover?.tipo).toBe("sub");
    if (mover?.tipo !== "sub") return;
    expect(mover.itens.map((i) => (i.tipo === "acao" ? i.rotulo : i.id))).toEqual(["Cozinha", "Garagem"]);
    expect(ids(itens).indexOf("mover-carga")).toBeLessThan(ids(itens).indexOf("sep-remover"));
  });

  it("com um ambiente só não há submenu de mover", () => {
    const itens = itensDeCargaDoEstudo({ indice: 0, total: 1, totalGeral: 1, ambientes: [ambientes[0]], ambienteAtualId: "a1" });
    expect(ids(itens)).not.toContain("mover-carga");
  });

  it("a única carga do ambiente pode ser removida (ambiente vazio é permitido)", () => {
    const itens = itensDeCargaDoEstudo({ indice: 0, total: 1, totalGeral: 4, ambientes, ambienteAtualId: "a1" });
    expect(acao(itens, ACAO_CARGA_REMOVER).desabilitado).toBeUndefined();
  });

  it("ambienteDoMover lê o id do destino", () => {
    expect(ambienteDoMover("mover-para:a2")).toBe("a2");
    expect(ambienteDoMover("duplicar")).toBeNull();
  });
});
