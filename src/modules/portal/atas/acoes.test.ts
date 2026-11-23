import { describe, expect, it } from "vitest";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_ABRIR_RASCUNHO,
  ACAO_BAIXAR_ARQUIVO,
  ACAO_CONFERIR,
  ACAO_CORRIGIR,
  ACAO_REABRIR,
  ACAO_RETIRAR,
  itensDaPendencia,
  itensDaReuniao,
} from "./acoes";
import type { ReuniaoDTO, VersaoDTO } from "./queries";

const versao = (estado: VersaoDTO["estado"]): VersaoDTO => ({
  id: `v-${estado}`,
  numero: 1,
  estado,
  texto: "",
  itens: [],
  publicadaEm: null,
  publicadaPorNome: null,
  resposta: null,
  observacao: null,
  respondidaPorNome: null,
  respondidaEm: null,
});
const reuniao = (extra: Partial<ReuniaoDTO>): ReuniaoDTO => ({
  id: "r1",
  titulo: "Reunião",
  data: "2026-11-04",
  retirada: null,
  vigente: null,
  rascunho: null,
  anteriores: [],
  arquivos: [],
  ...extra,
});
const ids = (itens: AcaoItem[]) => itens.map((i) => i.id);

describe("atas — ações da equipe", () => {
  it("retirada não tem ações", () => {
    expect(itensDaReuniao(reuniao({ vigente: versao("publicada"), retirada: { em: "x", motivo: "m", por: "p" } }))).toEqual([]);
  });

  it("vigente sem rascunho oferece corrigir e retirar", () => {
    const itens = itensDaReuniao(reuniao({ vigente: versao("publicada") }));
    expect(ids(itens)).toEqual([ACAO_CORRIGIR, ACAO_RETIRAR]);
    expect((itens.find((i) => i.id === ACAO_RETIRAR) as AcaoItemAcao).variant).toBe("destructive");
  });

  it("com rascunho oferece abrir o rascunho, não corrigir", () => {
    const itens = itensDaReuniao(reuniao({ vigente: versao("publicada"), rascunho: versao("rascunho") }));
    expect(ids(itens)).toEqual([ACAO_ABRIR_RASCUNHO, ACAO_RETIRAR]);
    expect(itensDaReuniao(reuniao({ rascunho: versao("rascunho") })).map((i) => i.id)).toEqual([ACAO_ABRIR_RASCUNHO]);
  });

  it("arquivos viram links de download", () => {
    const itens = itensDaReuniao(reuniao({ vigente: versao("publicada"), arquivos: [{ id: "a1", tipo: "anotacoes", nome: "ata.docx" }] }));
    const link = itens.find((i) => i.id === `${ACAO_BAIXAR_ARQUIVO}:a1`);
    expect(link).toMatchObject({ tipo: "link", href: "/api/portal/atas/arquivos/a1" });
  });

  it("pendência só aguardando conferência tem conferir e reabrir", () => {
    expect(ids(itensDaPendencia({ situacao: "aguardando_conferencia" }))).toEqual([ACAO_CONFERIR, ACAO_REABRIR]);
    for (const s of ["aberta", "reaberta", "conferida", "cancelada"] as const) expect(itensDaPendencia({ situacao: s })).toEqual([]);
  });
});
