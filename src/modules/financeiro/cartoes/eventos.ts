/**
 * Fatura no planejador de caixa (M3, spec §6). Puro.
 *
 * As compras do cartão já são eventos pendentes do motor — o caixa delas sai todo no mesmo dia, o do
 * vencimento da fatura. Para a agenda não mostrar seis saídas soltas na mesma data, as compras da
 * MESMA fatura viram UM evento `fatura:<id>`. O total projetado não muda: é a soma delas.
 */
import type { EventoCaixa } from "@/modules/financeiro/liquidez/tipos";
import { rotuloDoEventoDaFatura, type Competencia } from "@/modules/financeiro/cartoes/ciclo";

export type FaturaDoEvento = {
  faturaId: string;
  competencia: Competencia;
  cartaoNome: string;
  tipoCartao: "empresa" | "pessoal";
  socioNome: string | null;
};

export const MOTIVO_DATA_DA_FATURA =
  "A data é o vencimento da fatura do cartão: mude o dia de vencimento no cadastro do cartão.";

const ORDEM_PRIORIDADE = ["p1", "p2", "p3", "p4"] as const;

/** A mais urgente entre as compras manda na fatura (P1 vence P3). */
function prioridadeDaFatura(eventos: readonly EventoCaixa[]): EventoCaixa["prioridade"] {
  for (const p of ORDEM_PRIORIDADE) if (eventos.some((e) => e.prioridade === p)) return p;
  return null;
}

/**
 * Troca as compras de cartão pelos eventos de fatura. Eventos sem fatura passam intactos, na ordem
 * original; cada fatura entra onde a primeira compra dela estava.
 */
export function agregarFaturas(
  eventos: readonly EventoCaixa[],
  faturaPorLancamento: ReadonlyMap<string, FaturaDoEvento>,
): EventoCaixa[] {
  const saida: EventoCaixa[] = [];
  const grupos = new Map<string, EventoCaixa[]>();
  const ordem: string[] = [];

  for (const e of eventos) {
    const f = e.origem === "lancamento" ? faturaPorLancamento.get(e.id) : undefined;
    if (!f) {
      saida.push(e);
      continue;
    }
    // Natureza entra na chave: uma compra fora do resultado nunca se soma a uma de resultado.
    const chave = `${f.faturaId}|${e.natureza}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, []);
      ordem.push(chave);
      saida.push({ ...e, id: `placeholder:${chave}` });
    }
    grupos.get(chave)!.push(e);
  }

  const agregados = new Map<string, EventoCaixa>();
  for (const chave of ordem) {
    const itens = grupos.get(chave)!;
    const [faturaId, natureza] = chave.split("|");
    const f = faturaPorLancamento.get(itens[0].id)!;
    const primeiro = itens[0];
    agregados.set(chave, {
      ...primeiro,
      // A natureza entra no id só quando não é a comum, para o id da fatura normal ficar legível.
      id: natureza === "resultado" ? `fatura:${faturaId}` : `fatura:${faturaId}:${natureza}`,
      origem: "fatura",
      valor: itens.reduce((s, e) => s + e.valor, 0),
      descricao: rotuloDoEventoDaFatura({ nome: f.cartaoNome, tipo: f.tipoCartao, nomeDoSocio: f.socioNome }, f.competencia),
      favorecido: f.tipoCartao === "pessoal" ? f.socioNome : f.cartaoNome,
      projeto: null,
      categoriaNome: itens.length === 1 ? primeiro.categoriaNome : `${itens.length} compras`,
      prioridade: prioridadeDaFatura(itens),
      confianca: null,
      caixinhaId: null,
      naoProgramavel: MOTIVO_DATA_DA_FATURA,
      transferencia: null,
      observado: undefined,
    });
  }

  return saida.map((e) => (e.id.startsWith("placeholder:") ? agregados.get(e.id.slice("placeholder:".length))! : e));
}
