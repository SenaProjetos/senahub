/**
 * Verificação de integridade do ciclo documental (A7). PURO: classifica o que a varredura leu.
 *
 * Só a violação de I5 (controle de pasta — liberado para obra / enviado ao cliente — numa revisão que
 * não está publicada) é corrigida sozinha: revogar é seguro, e deixar a obra vendo uma revisão não
 * publicada é o pior caso. O resto só é relatado aos administradores — corrigir sozinho exigiria
 * escolher qual revisão vale, e essa decisão é de gente.
 */
import type { EstadoRevisao } from "./estados";

export type RevisaoVarrida = {
  id: string;
  documentoId: string;
  projetoId: string;
  documentoNome: string;
  numero: number;
  estado: EstadoRevisao;
  estadoEm: Date;
  /** Controles de pasta ativos (liberado_obra / enviado_cliente), com id para revogar. */
  controlesDePasta: { id: string; tipo: string }[];
  /** A revisão tem arquivo na lixeira (I6 — o arquivo de uma publicada/arquivada não devia ter ido). */
  arquivoNaLixeira: boolean;
};

export type Violacao =
  | { tipo: "duas_publicadas"; documentoId: string; projetoId: string; texto: string }
  | { tipo: "controle_fora_de_publicada"; revisaoId: string; controleId: string; projetoId: string; texto: string }
  | { tipo: "publicada_com_lixeira"; revisaoId: string; projetoId: string; texto: string }
  | { tipo: "analise_parada"; revisaoId: string; projetoId: string; dias: number; texto: string };

const DIA_MS = 24 * 60 * 60 * 1000;
const rev = (n: number) => `R${String(Math.max(0, n - 1)).padStart(2, "0")}`;

export function encontrarViolacoes(
  revisoes: readonly RevisaoVarrida[],
  opts: { agora: Date; diasAlertaPorProjeto: (projetoId: string) => number },
): Violacao[] {
  const out: Violacao[] = [];

  // I4 — o índice do banco já impede; a varredura confere mesmo assim (índice removido à mão, restore antigo).
  const publicadasPorDoc = new Map<string, RevisaoVarrida[]>();
  for (const r of revisoes.filter((r) => r.estado === "publicado")) {
    publicadasPorDoc.set(r.documentoId, [...(publicadasPorDoc.get(r.documentoId) ?? []), r]);
  }
  for (const [documentoId, lista] of publicadasPorDoc) {
    if (lista.length > 1) {
      out.push({
        tipo: "duas_publicadas",
        documentoId,
        projetoId: lista[0].projetoId,
        texto: `${lista[0].documentoNome}: ${lista.length} revisões publicadas (${lista.map((r) => rev(r.numero)).join(", ")}).`,
      });
    }
  }

  for (const r of revisoes) {
    // I5 — corrigida sozinha (o job revoga o controle).
    if (r.estado !== "publicado") {
      for (const c of r.controlesDePasta) {
        out.push({
          tipo: "controle_fora_de_publicada",
          revisaoId: r.id,
          controleId: c.id,
          projetoId: r.projetoId,
          texto: `${r.documentoNome} ${rev(r.numero)}: ${c.tipo === "liberado_obra" ? "liberada para obra" : "enviada ao cliente"} sem estar publicada.`,
        });
      }
    }
    // I6 — só relata.
    if ((r.estado === "publicado" || r.estado === "arquivado") && r.arquivoNaLixeira) {
      out.push({
        tipo: "publicada_com_lixeira",
        revisaoId: r.id,
        projetoId: r.projetoId,
        texto: `${r.documentoNome} ${rev(r.numero)} (${r.estado === "publicado" ? "publicada" : "arquivada"}) tem arquivo na lixeira.`,
      });
    }
    // Análise parada há mais de X dias (por projeto).
    if (r.estado === "compartilhado") {
      const dias = Math.floor((opts.agora.getTime() - r.estadoEm.getTime()) / DIA_MS);
      if (dias > opts.diasAlertaPorProjeto(r.projetoId)) {
        out.push({
          tipo: "analise_parada",
          revisaoId: r.id,
          projetoId: r.projetoId,
          dias,
          texto: `${r.documentoNome} ${rev(r.numero)} está em análise há ${dias} dias.`,
        });
      }
    }
  }
  return out;
}

export const MOTIVO_CORRECAO_INTEGRIDADE = "Correção automática de integridade";
