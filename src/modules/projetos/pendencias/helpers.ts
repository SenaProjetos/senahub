/**
 * Regras puras de pendências (sem I/O, testáveis). O rótulo do item de checklist e o
 * cálculo do próximo número são a "cola" entre pendência e tarefa — mantê-los puros
 * garante o mapeamento pendência↔item estável e o número sequencial por prancha.
 */

import { extrairMencoes } from "@/modules/chat/mencoes";

export type PendenciaBase = { numero: number; pagina: number; texto: string };

/** Rótulo do item de checklist gerado a partir de um apontamento. */
export function rotuloItemPendencia(p: PendenciaBase): string {
  return `#${p.numero} (pág. ${p.pagina}) — ${p.texto}`;
}

/** Próximo número sequencial por prancha (maior número existente + 1). */
export function proximoNumero(numerosExistentes: readonly number[]): number {
  return numerosExistentes.reduce((m, n) => (n > m ? n : m), 0) + 1;
}

export const STATUS_PENDENCIA = [
  "aberta",
  "em_correcao",
  "resolvida",
  "fechada",
  "descartada",
  "adiado",
] as const;
export type StatusPendencia = (typeof STATUS_PENDENCIA)[number];

/**
 * Rótulos da máquina de estados aprovada (item 22).
 *
 * `descartada` é o valor GRAVADO do estado que o usuário lê como "Não procede" — manter o nome
 * antigo no banco preserva a verdade do `AuditLog` já escrito e deixa a migração aditiva. É o
 * mesmo estado, não um novo. `resolvida` já cumpre o papel de "aguardando verificação" (a
 * própria ficha diz isso): o rótulo deixa isso explícito em vez de inventar estado.
 */
export const STATUS_LABEL: Record<StatusPendencia, string> = {
  aberta: "Aberta",
  em_correcao: "Em correção",
  resolvida: "Resolvida (aguardando verificação)",
  fechada: "Fechada",
  descartada: "Não procede",
  adiado: "Adiado",
};

/**
 * Estados que ainda DEMANDAM TRABALHO. É o que "em aberto" tem que significar em toda
 * contagem, badge e gate de validação — incluir `em_correcao` aqui é o que impede um
 * apontamento que alguém está corrigindo de parar de bloquear a validação em silêncio.
 *
 * `adiado` fica de fora de propósito: adiar É tirar da fila (por decisão de cargo superior);
 * se continuasse contando, adiar não teria efeito nenhum.
 */
export const STATUS_ABERTOS: readonly StatusPendencia[] = ["aberta", "em_correcao"];

/** Estados sem saída: o apontamento acabou. */
export const STATUS_TERMINAIS: readonly StatusPendencia[] = ["fechada", "descartada"];

export function estaAberta(status: string | null | undefined): boolean {
  return STATUS_ABERTOS.includes(status as StatusPendencia);
}

/**
 * Rascunho (item 31): `publicadoEm` nulo. Existe só para quem escreveu — não conta em lugar
 * nenhum e não sai em export.
 *
 * O campo é OBRIGATÓRIO no tipo, não opcional, de propósito: com `?`, qualquer chamador que
 * esquecesse de trazer a coluna receberia "é rascunho" em silêncio — e como rascunho não conta
 * como trabalho, isso DESTRAVARIA o gate de validação sem erro nenhum. Exigir o campo faz o
 * tsc apontar quem esqueceu.
 */
export function ehRascunho(p: { publicadoEm: Date | string | null }): boolean {
  return p.publicadoEm == null;
}

/**
 * **A pergunta "isto é trabalho pendente?" tem DUAS dimensões** desde o item 31: o estado
 * (aberta/em_correcao) E a publicação. Toda contagem, badge, KPI, visão gerencial e gate de
 * validação precisa das duas — por isso a composição mora aqui, e não repetida em cada
 * consulta. Espalhar `publicadoEm != null` à mão pelos ~10 pontos que já filtram por estado é
 * exatamente como um deles ficaria pra trás.
 */
export function contaComoTrabalho(p: { status: string; publicadoEm: Date | string | null }): boolean {
  return estaAberta(p.status) && !ehRascunho(p);
}

/** Quem está agindo — decide quais transições estão liberadas. */
export type PapeisPendencia = {
  /** Tem `uploads:validar` — quem aponta, fecha e descarta. */
  ehValidador: boolean;
  /** Responsável da disciplina (ou perfil global) — o projetista do outro lado. */
  ehResponsavel: boolean;
  /** admin/supervisor — único que adia e reativa (restrição do solicitante em R9). */
  ehGlobal: boolean;
};

type Regra = { para: StatusPendencia; quem: (p: PapeisPendencia) => boolean; exigeJustificativa?: boolean };

/**
 * A máquina de estados do item 22, exatamente como aprovada. Fica aqui, pura e client-safe,
 * por dois motivos: é UM lugar só onde o diagrama vive (antes cada action checava o status na
 * mão, e com 6 estados isso multiplica e diverge), e a UI pode desabilitar botão com a MESMA
 * função que o servidor usa pra recusar — a tela não oferece um movimento que a action nega.
 */
const TRANSICOES: Record<StatusPendencia, Regra[]> = {
  aberta: [
    { para: "em_correcao", quem: (p) => p.ehResponsavel },
    { para: "resolvida", quem: (p) => p.ehResponsavel },
    { para: "descartada", quem: (p) => p.ehValidador, exigeJustificativa: true },
    { para: "adiado", quem: (p) => p.ehGlobal },
  ],
  em_correcao: [
    { para: "aberta", quem: (p) => p.ehResponsavel },
    { para: "resolvida", quem: (p) => p.ehResponsavel },
    { para: "descartada", quem: (p) => p.ehValidador, exigeJustificativa: true },
    { para: "adiado", quem: (p) => p.ehGlobal },
  ],
  resolvida: [
    { para: "aberta", quem: (p) => p.ehResponsavel },
    { para: "fechada", quem: (p) => p.ehValidador },
    { para: "descartada", quem: (p) => p.ehValidador, exigeJustificativa: true },
  ],
  adiado: [{ para: "aberta", quem: (p) => p.ehGlobal }],
  fechada: [],
  descartada: [],
};

export type ResultadoTransicao = { ok: true; exigeJustificativa: boolean } | { ok: false; motivo: string };

/** Diz se a transição é permitida e, se não, POR QUÊ — a mensagem vai direto pro usuário. */
export function podeTransicionar(de: string, para: string, papeis: PapeisPendencia): ResultadoTransicao {
  if (!(STATUS_PENDENCIA as readonly string[]).includes(de)) return { ok: false, motivo: "Estado atual desconhecido." };
  if (!(STATUS_PENDENCIA as readonly string[]).includes(para)) return { ok: false, motivo: "Estado de destino desconhecido." };
  if (de === para) return { ok: false, motivo: "O apontamento já está nesse estado." };
  if (STATUS_TERMINAIS.includes(de as StatusPendencia)) {
    return { ok: false, motivo: `Apontamento ${STATUS_LABEL[de as StatusPendencia].toLowerCase()} não pode mudar de estado.` };
  }
  const regra = TRANSICOES[de as StatusPendencia].find((r) => r.para === para);
  if (!regra) {
    return { ok: false, motivo: `Não é possível ir de "${STATUS_LABEL[de as StatusPendencia]}" para "${STATUS_LABEL[para as StatusPendencia]}".` };
  }
  if (!regra.quem(papeis)) {
    const exigeGlobal = para === "adiado" || de === "adiado";
    return {
      ok: false,
      motivo: exigeGlobal
        ? "Só admin ou supervisor pode adiar ou reativar um apontamento."
        : "Seu perfil não permite essa mudança de estado.",
    };
  }
  return { ok: true, exigeJustificativa: regra.exigeJustificativa === true };
}

/** Destinos possíveis a partir de um estado, para a UI desenhar só o que existe. */
export function transicoesPossiveis(de: string, papeis: PapeisPendencia): StatusPendencia[] {
  if (!(STATUS_PENDENCIA as readonly string[]).includes(de)) return [];
  return TRANSICOES[de as StatusPendencia].filter((r) => r.quem(papeis)).map((r) => r.para);
}

/**
 * Classificação estruturada (item 11) — catálogo em CÓDIGO, não tabela: é vocabulário fixo
 * do escritório (não é dado que o usuário cadastra, ao contrário da futura biblioteca de
 * apontamentos-padrão do item 10). Fica aqui, junto de `STATUS_PENDENCIA`, porque este
 * arquivo é client-safe (sem `server-only`) — action e componente leem a MESMA lista.
 *
 * `impeditivo` é o topo da ESCALA de severidade, não um flag paralelo (decidido pelo
 * solicitante em 2026-08-06): o item 19 vai bloquear a aprovação da disciplina enquanto
 * houver apontamento aberto com `severidade === "impeditivo"` — uma leitura só, sem
 * combinar duas colunas.
 */
export const SEVERIDADES = ["impeditivo", "alta", "media", "baixa"] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export const SEVERIDADE_LABEL: Record<Severidade, string> = {
  impeditivo: "Impeditivo",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const TIPOS_PENDENCIA = [
  "incompatibilidade",
  "falta_informacao",
  "erro_tecnico",
  "norma",
  "representacao",
  "outro",
] as const;
export type TipoPendencia = (typeof TIPOS_PENDENCIA)[number];

export const TIPO_PENDENCIA_LABEL: Record<TipoPendencia, string> = {
  incompatibilidade: "Incompatibilidade",
  falta_informacao: "Falta informação",
  erro_tecnico: "Erro técnico",
  norma: "Norma",
  representacao: "Representação",
  outro: "Outro",
};

/**
 * Ordem de gravidade pra ordenar lista (menor = mais grave). Apontamento SEM severidade vai
 * pro fim: não classificado não é o mesmo que "pouco grave", e empurrá-lo pro topo faria a
 * lista mentir sobre prioridade.
 */
export function pesoSeveridade(s: string | null | undefined): number {
  const i = SEVERIDADES.indexOf(s as Severidade);
  return i === -1 ? SEVERIDADES.length : i;
}

/**
 * Um apontamento AINDA ABERTO e impeditivo trava a aprovação da entrega (item 19).
 *
 * Usa `estaAberta`, não `status === "aberta"`: depois do item 22 um impeditivo que o projetista
 * assumiu (`em_correcao`) continua sendo um impeditivo em aberto — se contasse só "aberta",
 * assumir a correção destravaria a aprovação, que é o oposto do que o estado significa.
 */
export function temImpeditivoAberto<T extends { status: string; severidade?: string | null; publicadoEm: Date | string | null }>(
  pendencias: readonly T[],
): boolean {
  // Rascunho não trava: o revisor ainda não entregou a análise (item 31).
  return pendencias.some((p) => contaComoTrabalho(p) && p.severidade === "impeditivo");
}

/**
 * Só apontamentos ainda em aberto e sem tarefa entram numa nova rodada de envio. `em_correcao`
 * entra junto (via `estaAberta`): é trabalho pendente, e deixá-lo de fora faria o apontamento
 * assumido pelo projetista sumir da rodada.
 */
export function enviaveis<T extends { status: string; tarefaId: string | null }>(pendencias: readonly T[]): T[] {
  return pendencias.filter((p) => estaAberta(p.status) && p.tarefaId === null);
}

/**
 * Menções (item 33) — mesmo casamento do chat (`modules/chat/actions.ts`): token @nome
 * casa pelo PRIMEIRO nome do candidato, case-insensitive. Sem relação formal no banco
 * (decidido: R13, "parse-and-notify", igual ao chat já faz) — resolve na hora, a partir de
 * quem já é candidato natural a receber notificação daquele apontamento (responsáveis da
 * disciplina + autor do upload), não de todo usuário do sistema.
 */
export function resolverMencionados<T extends { userId: string; nome: string }>(
  texto: string,
  candidatos: readonly T[],
): T[] {
  const nomes = new Set(extrairMencoes(texto).map((t) => t.slice(1).toLowerCase()));
  if (nomes.size === 0) return [];
  return candidatos.filter((c) => nomes.has(c.nome.split(" ")[0].toLowerCase()));
}

/** Menções presentes em `novo` mas ausentes em `anterior` — evita renotificar a cada edição. */
export function mencionadosNovos<T extends { userId: string; nome: string }>(
  anterior: string,
  novo: string,
  candidatos: readonly T[],
): T[] {
  const antesIds = new Set(resolverMencionados(anterior, candidatos).map((c) => c.userId));
  return resolverMencionados(novo, candidatos).filter((c) => !antesIds.has(c.userId));
}

/**
 * Momento da evidência (item 7). Anexo sem momento é o anexo comum do item 12 — evidência
 * genérica, que continua valendo (uma norma, um print de referência não são "antes" nem "depois").
 */
export const MOMENTOS_EVIDENCIA = ["antes", "depois"] as const;
export type MomentoEvidencia = (typeof MOMENTOS_EVIDENCIA)[number];

export const MOMENTO_LABEL: Record<MomentoEvidencia, string> = {
  antes: "Antes",
  depois: "Depois",
};

/**
 * Um apontamento tem evidência do "depois" registrada? É o que o fechamento (item 7) quer
 * saber — não bloqueia, mas a UI avisa quem vai fechar sem nenhuma prova do ajuste.
 */
export function temEvidencia(
  anexos: readonly { momento?: string | null }[],
  momento: MomentoEvidencia,
): boolean {
  return anexos.some((a) => a.momento === momento);
}
