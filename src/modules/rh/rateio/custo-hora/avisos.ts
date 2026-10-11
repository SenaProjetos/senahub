/**
 * Avisos do cálculo do custo do mês, para quem fecha o rateio saber o que entrou por aproximação.
 * PURO. Uma frase por motivo, com os nomes; PJ e autônomo não têm custo de hora e não geram aviso.
 */
import type { Contratacao } from "@/generated/prisma/enums";

export type SituacaoDoCusto = {
  nome: string;
  contratacao: Contratacao | null;
  temCusto: boolean;
  semTabela: boolean;
  tabelaPosterior: boolean;
  origemBase: "holerite" | "historico" | "vinculo" | null;
};

const COM_CUSTO: readonly (Contratacao | null)[] = ["clt", "estagio", "pro_labore"];

export function avisosDoCusto(pessoas: SituacaoDoCusto[]): string[] {
  const relevantes = pessoas.filter((p) => COM_CUSTO.includes(p.contratacao));
  const grupo = (texto: string, filtro: (p: SituacaoDoCusto) => boolean) => {
    const nomes = relevantes.filter(filtro).map((p) => p.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return nomes.length > 0 ? `${texto}: ${nomes.join(", ")}.` : null;
  };
  return [
    grupo("Sem salário cadastrado, custo zero", (p) => !p.temCusto),
    grupo("Sem tabela de encargos para a contratação, custo só do salário", (p) => p.temCusto && p.semTabela),
    grupo("Tabela de encargos de um mês posterior usada no cálculo", (p) => p.temCusto && p.tabelaPosterior),
    // Sócio é sempre pelo cadastro (decisão 6): só CLT e estágio sem holerite merecem aviso.
    grupo("Sem holerite do mês, custo pelo cadastro", (p) => p.temCusto && p.contratacao !== "pro_labore" && p.origemBase !== "holerite"),
  ].filter((x): x is string => x !== null);
}
