/**
 * Mapeamento dos dados existentes para o ciclo documental (Etapa 2, aprovado pelo dono em 2026-10-08).
 * PURO: decide, por documento, o estado de cada revisão e os controles a criar. Quem grava é
 * `scripts/migrar-ciclo-documental.ts` (modo leitura por padrão).
 *
 * Regras, nesta ordem:
 *  1. Documento fora do ciclo (N3) → nada muda.
 *  2. Status final (Obsoleto/Arquivado) → todas as revisões arquivadas.
 *  3. A revisão PUBLICADA é a que estava numa pasta do cliente: "Liberado para obra" (ganha o controle
 *     liberado_obra) ou "Compartilhado" (ganha enviado_cliente — D1-c). Sem pasta, o status "Aprovado"
 *     ou "Aprovado com ressalvas" publica a vigente, mas só se todos os arquivos dela estão validados
 *     (D2-a); ressalvas viram RESTRIÇÃO.
 *  4. A vigente (maior revisão com arquivo fora da lixeira), quando não é a publicada: "Em análise" →
 *     em análise; qualquer outro status → em andamento.
 *  5. Toda outra revisão é arquivada ("substituída pela revisão N"); sem arquivo ativo, arquivada também.
 *
 * Cada revisão existente fica com uma versão só (V3): a separação versão × revisão vale daqui pra frente.
 */
import { rotuloRevisao } from "@/lib/utils";
import { CHAVE_STATUS } from "../status-documento";
import { participaDoCiclo } from "./escopo";
import type { EstadoRevisao, TipoControle } from "./estados";

export type ArquivoParaMigrar = { ext: string; validado: boolean; naLixeira: boolean };
export type RevisaoParaMigrar = { id: string; numero: number; arquivos: ArquivoParaMigrar[] };

export type DocumentoParaMigrar = {
  id: string;
  chave: string;
  nome: string;
  statusChave: string | null;
  statusNome: string | null;
  statusFinal: boolean;
  revisaoCompartilhadaId: string | null;
  revisaoLiberadaObraId: string | null;
  revisoes: RevisaoParaMigrar[];
};

export type RevisaoPlanejada = { revisaoId: string; numero: number; estado: EstadoRevisao; motivo: string };
export type ControlePlanejado = { revisaoId: string; tipo: TipoControle; motivo: string };
export type TipoAvisoMigracao =
  | "pastas_em_revisoes_diferentes"
  | "aprovado_sem_validacao"
  | "status_do_escritorio"
  | "pasta_em_revisao_sem_arquivo";
export type AvisoMigracao = { tipo: TipoAvisoMigracao; texto: string };

export type PlanoDocumento = {
  documentoId: string;
  participa: boolean;
  revisoes: RevisaoPlanejada[];
  controles: ControlePlanejado[];
  avisos: AvisoMigracao[];
};

export const MOTIVO_ESTADO_INICIAL = "Migração: estado inicial atribuído";

const ativos = (r: RevisaoParaMigrar) => r.arquivos.filter((a) => !a.naLixeira);
const temArquivoAtivo = (r: RevisaoParaMigrar) => ativos(r).length > 0;
const todosValidados = (r: RevisaoParaMigrar) => temArquivoAtivo(r) && ativos(r).every((a) => a.validado);

export function planejarMigracao(doc: DocumentoParaMigrar): PlanoDocumento {
  const extensoes = doc.revisoes.flatMap((r) => ativos(r).map((a) => a.ext));
  const plano: PlanoDocumento = { documentoId: doc.id, participa: false, revisoes: [], controles: [], avisos: [] };
  if (!participaDoCiclo({ chave: doc.chave, extensoes })) return plano;
  plano.participa = true;

  const ordenadas = [...doc.revisoes].sort((a, b) => a.numero - b.numero);
  const porId = new Map(ordenadas.map((r) => [r.id, r]));
  const arquivar = (r: RevisaoParaMigrar, motivo: string) =>
    plano.revisoes.push({ revisaoId: r.id, numero: r.numero, estado: "arquivado", motivo });

  if (doc.statusFinal) {
    for (const r of ordenadas) arquivar(r, `Migração: documento com status final "${doc.statusNome ?? "final"}"`);
    return plano;
  }

  // 3. Publicada: pasta do cliente primeiro (obra antes de análise — perder a obra é o pior caso).
  const liberada = doc.revisaoLiberadaObraId ? porId.get(doc.revisaoLiberadaObraId) ?? null : null;
  const compartilhada = doc.revisaoCompartilhadaId ? porId.get(doc.revisaoCompartilhadaId) ?? null : null;
  let publicada: RevisaoParaMigrar | null = null;
  let motivoPublicada = "";
  if (liberada) {
    publicada = liberada;
    motivoPublicada = "Migração: estava liberada para obra";
    plano.controles.push({ revisaoId: liberada.id, tipo: "liberado_obra", motivo: "Migração: estava na pasta Liberado para obra" });
    if (compartilhada) {
      plano.controles.push({ revisaoId: liberada.id, tipo: "enviado_cliente", motivo: "Migração: estava na pasta Compartilhado do cliente" });
      if (compartilhada.id !== liberada.id) {
        plano.avisos.push({
          tipo: "pastas_em_revisoes_diferentes",
          texto: `${doc.nome}: Compartilhado na ${rotuloRevisao(compartilhada.numero)} e Liberado para obra na ${rotuloRevisao(liberada.numero)}. Publicada a ${rotuloRevisao(liberada.numero)} (a da obra), e o cliente passa a ver ela nas duas pastas.`,
        });
      }
    }
  } else if (compartilhada) {
    publicada = compartilhada;
    motivoPublicada = "Migração: estava na pasta Compartilhado do cliente";
    plano.controles.push({ revisaoId: compartilhada.id, tipo: "enviado_cliente", motivo: motivoPublicada });
  }
  if (publicada && !temArquivoAtivo(publicada)) {
    plano.avisos.push({
      tipo: "pasta_em_revisao_sem_arquivo",
      texto: `${doc.nome}: a ${rotuloRevisao(publicada.numero)} estava numa pasta do cliente mas não tem arquivo fora da lixeira.`,
    });
  }

  const vigente = ordenadas.filter(temArquivoAtivo).at(-1) ?? null;
  const aprovado = doc.statusChave === CHAVE_STATUS.aprovado || doc.statusChave === CHAVE_STATUS.aprovadoRessalvas;
  if (!publicada && aprovado && vigente) {
    if (todosValidados(vigente)) {
      publicada = vigente;
      motivoPublicada = `Migração: status "${doc.statusNome}" com arquivos validados`;
      if (doc.statusChave === CHAVE_STATUS.aprovadoRessalvas) {
        plano.controles.push({ revisaoId: vigente.id, tipo: "restricao", motivo: "Aprovado com ressalvas (migração)" });
      }
    } else {
      plano.avisos.push({
        tipo: "aprovado_sem_validacao",
        texto: `${doc.nome}: status "${doc.statusNome}" mas a ${rotuloRevisao(vigente.numero)} tem arquivo sem validação — fica em andamento.`,
      });
    }
  }
  if (doc.statusChave === null && doc.statusNome !== null) {
    plano.avisos.push({
      tipo: "status_do_escritorio",
      texto: `${doc.nome}: status "${doc.statusNome}" (criado pelo escritório) não tem equivalente — tratado como em andamento.`,
    });
  }

  // 4. Vigente que não é a publicada.
  const vigenteAberta = vigente && vigente.id !== publicada?.id && (!publicada || vigente.numero > publicada.numero) ? vigente : null;

  for (const r of ordenadas) {
    if (r.id === publicada?.id) {
      plano.revisoes.push({ revisaoId: r.id, numero: r.numero, estado: "publicado", motivo: motivoPublicada });
    } else if (r.id === vigenteAberta?.id) {
      const emAnalise = doc.statusChave === CHAVE_STATUS.emAnalise;
      plano.revisoes.push({
        revisaoId: r.id,
        numero: r.numero,
        estado: emAnalise ? "compartilhado" : "em_andamento",
        motivo: emAnalise ? 'Migração: status "Em análise"' : MOTIVO_ESTADO_INICIAL,
      });
    } else if (!temArquivoAtivo(r)) {
      arquivar(r, "Migração: revisão sem arquivo fora da lixeira");
    } else {
      const seguinte = ordenadas.find((o) => o.numero > r.numero);
      arquivar(r, seguinte ? `Migração: substituída pela revisão ${rotuloRevisao(seguinte.numero)}` : "Migração: substituída");
    }
  }
  return plano;
}
