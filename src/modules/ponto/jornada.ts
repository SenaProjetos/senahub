/**
 * Regra ÚNICA de "tem jornada controlada": bate ponto e, pelo mesmo fato, tem espelho, banco de
 * horas, lembrete de ponto e férias. PURO e client-safe (sem Prisma, sem `server-only`) — gates de
 * action, páginas, a audiência `clt` e a tela de Usuários consomem daqui; `jornada.test.ts` é a rede.
 *
 * **O eixo é a CONTRATAÇÃO do vínculo ativo, e só ela.** Contratação é independente do cargo: um
 * Administrativo ou TI contratado CLT bate ponto. Decisão do dono em 2026-09-04 (Q1/Q5/Q11).
 *
 * **Sem vínculo = sem jornada** (Onda F, decisão 1 do dono, §16.4). Até 2026-10-10 quem nunca teve
 * vínculo caía no PAPEL (`CLT_ROLES`) — a rede para quem o backfill ainda não tinha alcançado. A
 * rede saiu junto com o papel: o backfill de vínculos é pré-requisito do deploy, e `contratacao`
 * nula agora quer dizer, sem ambiguidade, "não bate ponto".
 *
 * **O corte jurídico continua de pé.** `Batida` com geolocalização, tolerância e banco de horas é
 * conjunto probatório de vínculo empregatício (commit `2a1abcc`). Só `clt` e `estagio` batem ponto.
 * Quem não bate ponto e registra horas faz APONTAMENTO (`usaApontamento` em `lib/contratacao.ts`).
 *
 * **Campo ausente falha FECHADO — e "fechado" tem sentido diferente em cada função.** `getSession()`
 * monta o usuário com `as SessionUser`, e um `select` de call-site pode esquecer um campo: ele chega
 * aqui como `undefined`. Em `controlaJornada`, fechado é NEGAR a batida. Em
 * `aplicaRegraInicioFeriasClt`, `false` significa PULAR uma validação legal — ali fechado é
 * VALIDAR. As duas funções tratam `undefined` com polaridades opostas de propósito.
 */
import type { Contratacao } from "@/generated/prisma/enums";
import { CONTRATACOES_JORNADA as JORNADA } from "@/lib/contratacao";

/** Contratações com jornada controlada. Fonte única: `lib/contratacao.ts`. */
export const CONTRATACOES_JORNADA: readonly Contratacao[] = JORNADA;

export type SujeitoJornada = {
  /** Interno × externo (`User.tipo`): externo nunca tem jornada. */
  tipo: "interno" | "externo";
  /** Contratação do vínculo ATIVO (cache `User.contratacao`, escrito só por `aplicarVinculo`). */
  contratacao: Contratacao | null;
};

export function controlaJornada(u: SujeitoJornada): boolean {
  if (u.tipo !== "interno" || u.contratacao === undefined) return false;
  return u.contratacao != null && CONTRATACOES_JORNADA.includes(u.contratacao);
}

/**
 * A regra de início de férias do art. 134 §3º da CLT (não começar nos 2 dias que antecedem feriado
 * ou repouso) vale para contratação CELETISTA — não para estágio, que tem recesso, não férias.
 *
 * **Polaridade oposta à de `controlaJornada`:** aqui `false` DISPENSA uma validação legal. Dado
 * incompleto responde `true` — validar a mais é inofensivo, deixar de validar é férias começando em
 * véspera de feriado com o sistema carimbando como aprovado.
 */
export function aplicaRegraInicioFeriasClt(u: SujeitoJornada): boolean {
  if (u.tipo === "externo") return false;
  if (u.contratacao === undefined) return true;
  return u.contratacao === "clt";
}

/**
 * `controlaJornada` em forma de `where` de `User`, para a audiência `clt` (folha, lembrete e resumo
 * de ponto, elegíveis a férias, banco de horas). As duas formas PRECISAM responder igual — o teste
 * roda a mesma tabela de casos contra as duas.
 *
 * `ativo: true` vem no topo, igual a toda audiência: sem ele, folha e jobs de ponto passariam a
 * incluir desligados. `AND` para poder ser espalhado junto de outro `OR` do call-site.
 */
export function whereControlaJornada(): { ativo: true; AND: Record<string, unknown>[] } {
  return {
    ativo: true,
    AND: [{ tipo: "interno", contratacao: { in: [...CONTRATACOES_JORNADA] } }],
  };
}
