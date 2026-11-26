import { describe, expect, it } from "vitest";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { semMotivoDoCliente } from "./conteudo";

const arquivo = (id: string, emRevisao: string | null) => ({
  id,
  nome: `${id}.pdf`,
  tamanho: 1,
  ehPdf: true,
  versao: 1,
  emRevisao,
  descricaoRevisao: null,
  bloqueado: false,
  indisponivel: false,
});

const conteudo = (): ConteudoPublico => ({
  projeto: { codigo: "260001", nome: "Obra" },
  titulo: null,
  disciplinas: [],
  arts: [],
  situacoes: [
    {
      id: "liberado_obra",
      rotulo: "Liberado para obra",
      total: 2,
      disciplinas: [
        {
          id: "d",
          nome: "Estrutural",
          total: 2,
          pastas: [{ id: "f", sigla: "EX", nome: "Executivo", total: 2, extensoes: [{ id: "pdf", rotulo: "PDF", total: 2, arquivos: [arquivo("a", "Pedido do cliente: mudar a escada"), arquivo("b", null)] }] }],
        },
      ],
    },
  ],
} as unknown as ConteudoPublico);

describe("semMotivoDoCliente", () => {
  it("a obra vê a marca Em revisão, nunca o texto do pedido do cliente", () => {
    const c = semMotivoDoCliente(conteudo());
    const [a, b] = c!.situacoes[0].disciplinas[0].pastas[0].extensoes[0].arquivos;
    expect(a.emRevisao).toBe("");
    expect(b.emRevisao).toBeNull();
    expect(JSON.stringify(c)).not.toContain("mudar a escada");
  });

  it("conteúdo nulo continua nulo", () => {
    expect(semMotivoDoCliente(null)).toBeNull();
  });
});
