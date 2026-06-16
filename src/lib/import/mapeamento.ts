/**
 * Auto-detecção de mapeamento de colunas da planilha → campos do SenaHub.
 * Sinônimos PT-BR com os cabeçalhos LITERAIS do export "Meu Dinheiro" em 1º lugar,
 * seguidos de variações genéricas. `autoMapear` casa por igualdade de chave e,
 * em fallback, por inclusão.
 */
import { chaveMatch } from "@/lib/import/valores";

export type CampoSenaHub =
  | "data"
  | "descricao"
  | "valor"
  | "valorEfetivo"
  | "tipo"
  | "status"
  | "vencimento"
  | "dataConfirmacao"
  | "categoria"
  | "subcategoria"
  | "conta"
  | "contaTransferencia"
  | "contato"
  | "documento"
  | "forma"
  | "centro"
  | "observacao"
  | "tags"
  | "idUnico";

export type CampoDef = {
  campo: CampoSenaHub;
  label: string;
  obrigatorio: boolean;
  sinonimos: string[];
};

/** Campos mínimos para uma importação válida (linhas sem eles viram erro). */
export const CAMPOS_OBRIGATORIOS: CampoSenaHub[] = ["data", "descricao", "valor", "categoria"];

export const CAMPOS: CampoDef[] = [
  {
    campo: "data",
    label: "Data (competência)",
    obrigatorio: true,
    sinonimos: ["data competencia", "data prevista", "data", "data lancamento", "competencia", "emissao"],
  },
  {
    campo: "descricao",
    label: "Descrição",
    obrigatorio: true,
    sinonimos: ["descricao", "historico", "memo", "nome", "lancamento", "titulo"],
  },
  {
    campo: "valor",
    label: "Valor (previsto)",
    obrigatorio: true,
    sinonimos: ["valor previsto", "valor", "montante", "quantia", "valor total", "total"],
  },
  {
    campo: "valorEfetivo",
    label: "Valor efetivo",
    obrigatorio: false,
    sinonimos: ["valor efetivo", "valor realizado", "valor pago", "valor recebido"],
  },
  {
    campo: "tipo",
    label: "Tipo (receita/despesa/transferência)",
    obrigatorio: false,
    sinonimos: ["tipo", "natureza", "movimento", "tipo de lancamento"],
  },
  {
    campo: "status",
    label: "Situação/Status",
    obrigatorio: false,
    sinonimos: ["status", "situacao", "pago", "liquidado", "realizado", "conciliado"],
  },
  {
    campo: "vencimento",
    label: "Vencimento",
    obrigatorio: false,
    sinonimos: ["venc. fatura", "venc fatura", "vencimento", "data vencimento", "data de vencimento", "venc", "prazo"],
  },
  {
    campo: "dataConfirmacao",
    label: "Data de pagamento/recebimento (efetiva)",
    obrigatorio: false,
    sinonimos: ["data efetiva", "data pagamento", "data de pagamento", "data recebimento", "data baixa", "pago em", "liquidacao"],
  },
  {
    campo: "categoria",
    label: "Categoria",
    obrigatorio: true,
    sinonimos: ["categoria", "plano de contas", "conta contabil", "classificacao", "grupo"],
  },
  {
    campo: "subcategoria",
    label: "Subcategoria",
    obrigatorio: false,
    sinonimos: ["subcategoria", "sub categoria", "sub-categoria", "subconta"],
  },
  {
    campo: "conta",
    label: "Conta bancária",
    obrigatorio: false,
    sinonimos: ["conta", "conta bancaria", "banco", "carteira", "caixa"],
  },
  {
    campo: "contaTransferencia",
    label: "Conta destino (transferência)",
    obrigatorio: false,
    sinonimos: ["conta transferencia", "conta destino", "conta de destino", "transferencia"],
  },
  {
    campo: "contato",
    label: "Contato (cliente/fornecedor)",
    obrigatorio: false,
    sinonimos: ["razao social", "contato", "cliente", "fornecedor", "favorecido", "pagador", "beneficiario"],
  },
  {
    campo: "documento",
    label: "CPF/CNPJ do contato",
    obrigatorio: false,
    sinonimos: ["cpf/cnpj", "cpf", "cnpj", "documento", "cpf cnpj"],
  },
  {
    campo: "forma",
    label: "Forma de pagamento",
    obrigatorio: false,
    sinonimos: ["forma", "forma de pagamento", "forma pagamento", "meio de pagamento", "pagamento"],
  },
  {
    campo: "centro",
    label: "Centro de custo",
    obrigatorio: false,
    sinonimos: ["centro", "centro de custo", "centro custo"],
  },
  {
    campo: "observacao",
    label: "Observação",
    obrigatorio: false,
    sinonimos: ["observacoes", "observacao", "obs", "nota", "detalhes", "comentario"],
  },
  {
    campo: "tags",
    label: "Tags / Etiquetas",
    obrigatorio: false,
    sinonimos: ["tags", "etiquetas", "marcadores", "rotulos"],
  },
  {
    campo: "idUnico",
    label: "ID Único (origem)",
    obrigatorio: false,
    sinonimos: ["id unico", "id", "identificador", "codigo", "id lancamento"],
  },
];

/**
 * Mapeia cada campo do SenaHub ao índice da coluna na planilha.
 * Casa por chave exata; se nenhum bater, tenta por inclusão. Cada coluna é usada
 * no máximo uma vez (na ordem de declaração de CAMPOS).
 */
export function autoMapear(headers: string[]): Partial<Record<CampoSenaHub, number>> {
  const chaves = headers.map((h) => chaveMatch(h ?? ""));
  const usados = new Set<number>();
  const out: Partial<Record<CampoSenaHub, number>> = {};

  // 1ª passada: igualdade exata (prioriza o 1º sinônimo que existir)
  for (const def of CAMPOS) {
    let achou = -1;
    for (const sin of def.sinonimos) {
      const idx = chaves.findIndex((h, i) => !usados.has(i) && h === sin);
      if (idx >= 0) {
        achou = idx;
        break;
      }
    }
    if (achou >= 0) {
      out[def.campo] = achou;
      usados.add(achou);
    }
  }
  // 2ª passada: inclusão (fallback)
  for (const def of CAMPOS) {
    if (out[def.campo] != null) continue;
    const idx = chaves.findIndex(
      (h, i) => !usados.has(i) && h !== "" && def.sinonimos.some((s) => h.includes(s) || s.includes(h)),
    );
    if (idx >= 0) {
      out[def.campo] = idx;
      usados.add(idx);
    }
  }
  return out;
}
