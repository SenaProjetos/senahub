/**
 * Contrato cobrado POR ENTREGA (F7.3 — D15) e a previsão de recebimento que o cronograma gera
 * dele (F7.2 — D9/D25). Regras puras, sem I/O; a sincronização fica em `previsao-service.ts`.
 *
 * Cada parcela é um percentual do valor do contrato, ligado a um marco da EAP. Enquanto a parcela
 * não é faturada, o financeiro a vê como PREVISÃO (`Lancamento.status = previsao`), com a data do
 * marco no cronograma aprovado — ela anda quando o marco anda. Faturar converte a MESMA linha em
 * conta a receber (`previsto`); daí em diante a sincronização não toca mais nela. Assim previsão e
 * cobrança nunca somam juntas.
 *
 * Parcela SEM marco ("30% na assinatura") também nasce como previsão, com a data da assinatura —
 * todo recebível do contrato por entrega passa pelo mesmo caminho: previsão → faturar (D9, "a
 * cobrança continua nascendo no financeiro").
 *
 * Três recusas, nunca correções silenciosas:
 *  - percentuais que não fecham 100% (mesma regra da proposta composta — `calcularParcelas`, que é
 *    reusada aqui para o dinheiro sair no mesmo centavo);
 *  - contrato sem valor;
 *  - cronograma em rascunho: previsão de data que ninguém combinou não entra no fluxo de caixa (D14)
 *    — vale para as parcelas de MARCO; a da assinatura tem data sem precisar do cronograma.
 */
import { calcularParcelas } from "@/modules/comercial/proposta-composta/parcelas";

type Dia = string;

export type ParcelaEntregaEstado = {
  id: string;
  descricao: string;
  percentual: number;
  ordem: number;
  marcoId: string | null;
  /** Linha dela no financeiro. Só a de status `previsao` é da sincronização. */
  lancamento: { id: string; status: string; valor: number; vencimento: Dia | null; descricao: string } | null;
};

export type ContratoParaPrevisao = {
  titulo: string;
  formaCobranca: "por_data" | "por_entrega";
  statusContrato: string | null;
  valor: number | null;
  /** Dia em que ficou assinado — a data da parcela sem marco. */
  assinadoEm: Dia | null;
};

export type PrevisaoDesejada = { parcelaId: string; valor: number; vencimento: Dia; descricao: string };

export type PlanoPrevisoes = {
  criar: PrevisaoDesejada[];
  atualizar: (PrevisaoDesejada & { lancamentoId: string })[];
  remover: { parcelaId: string; lancamentoId: string }[];
  /** Por que o contrato não tem (ou não tem todas as) previsões — a tela mostra. */
  motivo: string | null;
};

/** Contrato que ainda gera recebível: assinado, ou vencido (a vigência acabou, o dinheiro não). */
const VIGENTES = new Set(["assinado", "vencido"]);

const centavos = (v: number) => Math.round(v * 100);

export function ordenarParcelas<T extends { ordem: number; id: string }>(parcelas: readonly T[]): T[] {
  return [...parcelas].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
}

/** "Contrato X — parcela 2/4 (Entrega do básico)". */
export function descricaoParcelaEntrega(titulo: string, numero: number, total: number, descricao: string): string {
  return `${titulo} — parcela ${numero}/${total} (${descricao})`;
}

/**
 * Valor de cada parcela: `calcularParcelas` da proposta composta (meio para cima, a última
 * absorve o centavo, recusa soma ≠ 100 e percentual ≤ 0). Devolve na ordem das parcelas.
 */
export function valoresDasParcelas(
  valorContrato: number | null,
  parcelas: readonly { descricao: string; percentual: number }[],
): { ok: true; valores: number[] } | { ok: false; motivo: string } {
  if (valorContrato == null || !(valorContrato > 0)) return { ok: false, motivo: "Contrato sem valor." };
  const r = calcularParcelas(valorContrato, parcelas);
  if (!r.ok) return { ok: false, motivo: r.mensagem };
  return { ok: true, valores: r.parcelas.map((p) => p.valor) };
}

/**
 * O que a sincronização tem de fazer com as previsões de UM contrato.
 *
 * Previsão existe quando: contrato por entrega, vigente, com valor, plano fechando 100%, parcela
 * ainda não faturada, e uma data — a do marco no cronograma APROVADO, ou a da assinatura para a
 * parcela sem marco. Fora disso, a previsão que houver é removida: data velha não fica no caixa.
 */
export function planejarPrevisoes(p: {
  contrato: ContratoParaPrevisao;
  cronogramaAprovado: boolean;
  parcelas: readonly ParcelaEntregaEstado[];
  /** marcoId → dia do marco no plano (motor). Marco fora do mapa = sem data. */
  dataDoMarco: ReadonlyMap<string, Dia>;
}): PlanoPrevisoes {
  const ordenadas = ordenarParcelas(p.parcelas);
  const desejadas = new Map<string, PrevisaoDesejada>();
  let motivo: string | null = null;

  if (p.contrato.formaCobranca !== "por_entrega") motivo = "Contrato cobrado por data — sem previsão pelo cronograma.";
  else if (!VIGENTES.has(p.contrato.statusContrato ?? "")) motivo = "A previsão nasce quando o contrato é assinado.";
  else {
    const v = valoresDasParcelas(p.contrato.valor, ordenadas);
    if (!v.ok) motivo = v.motivo;
    else {
      let semData = 0;
      let esperandoAprovacao = 0;
      ordenadas.forEach((parcela, i) => {
        if (parcela.lancamento && parcela.lancamento.status !== "previsao") return; // já faturada
        let dia: Dia | null | undefined;
        if (parcela.marcoId == null) dia = p.contrato.assinadoEm;
        else if (!p.cronogramaAprovado) {
          esperandoAprovacao++;
          return;
        } else dia = p.dataDoMarco.get(parcela.marcoId);
        if (!dia) {
          semData++;
          return;
        }
        desejadas.set(parcela.id, {
          parcelaId: parcela.id,
          valor: v.valores[i],
          vencimento: dia,
          descricao: descricaoParcelaEntrega(p.contrato.titulo, i + 1, ordenadas.length, parcela.descricao),
        });
      });
      if (esperandoAprovacao > 0) {
        motivo = "Cronograma do projeto em rascunho — as parcelas de marco ganham previsão quando ele for aprovado.";
      } else if (semData > 0) motivo = `${semData} parcela(s) com marco que não está no cronograma.`;
    }
  }

  const plano: PlanoPrevisoes = { criar: [], atualizar: [], remover: [], motivo };
  for (const parcela of ordenadas) {
    const d = desejadas.get(parcela.id);
    const l = parcela.lancamento;
    if (d && !l) plano.criar.push(d);
    else if (d && l?.status === "previsao") {
      if (centavos(l.valor) !== centavos(d.valor) || l.vencimento !== d.vencimento || l.descricao !== d.descricao) {
        plano.atualizar.push({ ...d, lancamentoId: l.id });
      }
    } else if (!d && l?.status === "previsao") plano.remover.push({ parcelaId: parcela.id, lancamentoId: l.id });
  }
  return plano;
}

/** Pode faturar? A linha é a previsão (converte) ou não existe (cria). Já faturada = recusa. */
export function motivoNaoFatura(parcela: { lancamento: { status: string } | null }): string | null {
  if (!parcela.lancamento || parcela.lancamento.status === "previsao") return null;
  if (parcela.lancamento.status === "cancelado") return null;
  return "Esta parcela já foi faturada — ajuste o lançamento no financeiro.";
}
