/**
 * Regra ÚNICA de "tem jornada controlada": bate ponto e, pelo mesmo fato, tem espelho, banco de
 * horas, lembrete de ponto e férias. PURO e client-safe (sem Prisma, sem `server-only`) — gates de
 * action, páginas, a audiência `clt` e a tela de Usuários consomem daqui; `jornada.test.ts` é a rede.
 *
 * **O eixo é a CONTRATAÇÃO, não o papel.** Contratação é independente do cargo: um Administrativo ou
 * TI contratado CLT bate ponto. Até esta regra existir, batida e férias exigiam `CLT_ROLES` (papel),
 * enquanto `apuracao.ts` já apurava jornada pela contratação do vínculo — o sistema cobrava a
 * jornada de quem ele mesmo recusava o registro. Decisão do dono em 2026-09-04 (Q1/Q5/Q11).
 *
 * **O corte jurídico continua de pé.** `Batida` com geolocalização, tolerância e banco de horas é
 * conjunto probatório de vínculo empregatício (commit `2a1abcc`). Só `clt` e `estagio` batem ponto.
 *
 * **Fora do escopo, de propósito: o APONTAMENTO continua pelo papel** (`PJ_ROLES`, em
 * `apontamento-actions.ts`). A decisão aprovada cobre batida, férias, espelho e alertas. Mover o
 * apontamento junto mudaria o registro de horas de sócio em pró-labore e de quem tem papel e
 * contratação divergentes — `scripts/auditar-vinculos-jornada.ts` lista essas pessoas, e é essa
 * lista que decide se o apontamento migra depois.
 *
 * **Os três estados de "sem contratação" são diferentes, e confundi-los tira acesso em silêncio:**
 *   - nunca teve vínculo   → o backfill não chegou nesta pessoa: cai no PAPEL, igual `apuracao.ts`;
 *   - só vínculo encerrado → `aplicarVinculo` grava `contratacao: null` ao encerrar. Não há de onde
 *     tirar a regra e cair no papel seria mentira (a pessoa pode ter saído): NÃO controla jornada;
 *   - externo (cliente)    → nunca.
 * Por isso a entrada EXIGE `jaTeveVinculo`. Nunca preencher com `false` "por padrão" num call-site:
 * `{ role: "clt", contratacao: null, jaTeveVinculo: false }` concede a batida a quem tem vínculo
 * encerrado — é o default que falha aberto.
 *
 * **Campo ausente falha FECHADO — e "fechado" tem sentido diferente em cada função.** `getSession()`
 * monta o usuário com `as SessionUser`, e um `select` de call-site pode esquecer um campo: ele chega
 * aqui como `undefined`. Em `controlaJornada`, fechado é NEGAR a batida. Em
 * `aplicaRegraInicioFeriasClt`, `false` significa PULAR uma validação legal — ali fechado é
 * VALIDAR. As duas funções tratam `undefined` com polaridades opostas de propósito.
 */
import { CLT_ROLES, type Role } from "@/lib/roles";
import type { Contratacao } from "@/generated/prisma/enums";

/** Contratações com jornada controlada. Fonte única — `apuracao.ts` e `rh/banco` importam daqui. */
export const CONTRATACOES_JORNADA: readonly Contratacao[] = ["clt", "estagio"];

export type SujeitoJornada = {
  role: Role;
  /** Contratação do vínculo ATIVO (cache `User.contratacao`, escrito só por `aplicarVinculo`). */
  contratacao: Contratacao | null;
  /** Já teve algum vínculo, ativo ou não. Distingue "nunca teve" de "só encerrado". */
  jaTeveVinculo: boolean;
};

/** Algum dos dois campos veio `undefined` — dado não carregado, não "sem vínculo". */
function incompleto(u: SujeitoJornada): boolean {
  return u.contratacao === undefined || u.jaTeveVinculo === undefined;
}

export function controlaJornada(u: SujeitoJornada): boolean {
  if (u.role === "cliente" || incompleto(u)) return false;
  if (u.contratacao) return CONTRATACOES_JORNADA.includes(u.contratacao);
  if (u.jaTeveVinculo) return false;
  return CLT_ROLES.includes(u.role);
}

/**
 * A regra de início de férias do art. 134 §3º da CLT (não começar nos 2 dias que antecedem feriado
 * ou repouso) vale para contratação CELETISTA — não para estágio, que tem recesso, não férias.
 * Mesma escada de `controlaJornada` para quem está sem contratação.
 *
 * **Polaridade oposta à de `controlaJornada`:** aqui `false` DISPENSA uma validação legal. Dado
 * incompleto responde `true` — validar a mais é inofensivo, deixar de validar é férias começando em
 * véspera de feriado com o sistema carimbando como aprovado.
 */
export function aplicaRegraInicioFeriasClt(u: SujeitoJornada): boolean {
  if (u.role === "cliente") return false;
  if (incompleto(u)) return true;
  if (u.contratacao) return u.contratacao === "clt";
  if (u.jaTeveVinculo) return false;
  return u.role === "clt";
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
    AND: [
      {
        role: { not: "cliente" },
        OR: [
          { contratacao: { in: [...CONTRATACOES_JORNADA] } },
          { contratacao: null, vinculos: { none: {} }, role: { in: [...CLT_ROLES] } },
        ],
      },
    ],
  };
}
