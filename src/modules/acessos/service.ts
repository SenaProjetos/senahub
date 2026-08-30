/**
 * Regras puras do cofre de Acessos e Credenciais.
 *
 * SEM I/O de propósito (nem Prisma, nem `server-only`): é o que permite testar as regras de
 * autorização sem banco, e o que deixa `queries.ts` e `actions.ts` compartilharem a MESMA
 * decisão em vez de cada um reimplementar a sua. Mesma forma de `lib/dxf.ts`/`lib/aging.ts`.
 *
 * Spec: docs/contas/specs/acessos-credenciais.md · Plano: docs/contas/plans/
 */

import type { Setor } from "@/generated/prisma/enums";

/** Alvos que um compartilhamento pode apontar. `alvoId` guarda o id/valor correspondente. */
export const TIPOS_ALVO = ["usuario", "perfil", "setor"] as const;
export type TipoAlvo = (typeof TIPOS_ALVO)[number];

export const STATUS_CREDENCIAL = ["ativo", "atencao", "expirando", "bloqueado", "inativo"] as const;
export type StatusCredencial = (typeof STATUS_CREDENCIAL)[number];

/**
 * O que basta saber sobre quem está olhando. Campos obrigatórios de propósito — um viewer
 * parcial (`{ id }`) compilaria e resolveria "nega tudo" em silêncio, que é fail-closed mas
 * silencioso, e é assim que se perde acesso sem ninguém entender por quê. Mesmo raciocínio
 * de `EscopoDeDados` em `lib/roles.ts`.
 */
export type ViewerCofre = {
  id: string;
  /** Usuário desativado não alcança nada — `permissaoEfetiva` também nega, e os dois concordam. */
  ativo: boolean;
  /** Perfil de acesso (motor da Onda D). Nulo = sem perfil, não casa com alvo `perfil`. */
  perfilId: string | null;
  /** Setor do vínculo ativo. Nulo = não casa com alvo `setor`. */
  setor: Setor | null;
  /** Bypass total — o mesmo de `permissaoEfetiva`. */
  superUsuario: boolean;
};

/** Uma linha de `CredencialCompartilhamento`, reduzida ao que a decisão precisa. */
export type LinhaCompartilhamento = {
  tipoAlvo: string;
  alvoId: string;
  podeVerCadastro: boolean;
  podeVerCredencial: boolean;
  podeEditar: boolean;
  podeGerenciarPermissoes: boolean;
};

export type PermissoesNaCredencial = {
  /** Enxerga que o registro existe e seus metadados (§27) — NÃO implica ver a senha. */
  verCadastro: boolean;
  /** Pode revelar/copiar usuário e senha. Independente de `verCadastro` e de `editar` (§27/§29). */
  verCredencial: boolean;
  editar: boolean;
  gerenciarPermissoes: boolean;
};

const NEGADO: PermissoesNaCredencial = {
  verCadastro: false,
  verCredencial: false,
  editar: false,
  gerenciarPermissoes: false,
};

/** A linha de compartilhamento aponta para este viewer? */
export function alvoCasaComViewer(linha: Pick<LinhaCompartilhamento, "tipoAlvo" | "alvoId">, viewer: ViewerCofre): boolean {
  switch (linha.tipoAlvo) {
    case "usuario":
      return linha.alvoId === viewer.id;
    case "perfil":
      return viewer.perfilId !== null && linha.alvoId === viewer.perfilId;
    case "setor":
      return viewer.setor !== null && linha.alvoId === viewer.setor;
    default:
      // `tipoAlvo` desconhecido (dado velho, ou tipo novo ainda não implementado) NÃO concede.
      return false;
  }
}

/**
 * O que este viewer pode fazer NESTE registro.
 *
 * **Aditivo por OR**: uma linha com `podeVerCredencial: false` não REVOGA o que outra linha
 * concede — ela apenas não concede. Compartilhamento é lista de concessões, não de negações;
 * quem quiser tirar acesso remove a linha. Escrito aqui porque a leitura inversa ("qualquer
 * false nega") é plausível e inverteria a segurança do módulo em silêncio.
 *
 * O RESPONSÁVEL pela credencial ganha `verCadastro` + `editar`, mas **não** `verCredencial`:
 * ser dono do cadastro não é o mesmo que estar autorizado a ler a senha (§27), e a decisão do
 * dono em 2026-08-28 foi justamente separar administrar de revelar. Se o responsável precisar
 * revelar, isso é uma linha de compartilhamento explícita — que fica auditável.
 */
export function permissoesNaCredencial(
  viewer: ViewerCofre,
  compartilhamentos: LinhaCompartilhamento[],
  opts?: { ehResponsavel?: boolean },
): PermissoesNaCredencial {
  if (viewer.superUsuario) {
    return { verCadastro: true, verCredencial: true, editar: true, gerenciarPermissoes: true };
  }

  const resultado = { ...NEGADO };

  if (opts?.ehResponsavel) {
    resultado.verCadastro = true;
    resultado.editar = true;
  }

  for (const linha of compartilhamentos) {
    if (!alvoCasaComViewer(linha, viewer)) continue;
    resultado.verCadastro ||= linha.podeVerCadastro;
    resultado.verCredencial ||= linha.podeVerCredencial;
    resultado.editar ||= linha.podeEditar;
    resultado.gerenciarPermissoes ||= linha.podeGerenciarPermissoes;
  }

  // Ver a credencial sem enxergar o cadastro é incoerente: a senha é exibida DENTRO do
  // cadastro. Uma linha que conceda só `podeVerCredencial` implica o cadastro junto.
  if (resultado.verCredencial) resultado.verCadastro = true;

  return resultado;
}

/** Dias inteiros de hoje até a data (negativo = já passou). `null` se não houver data. */
export function diasAte(data: Date | null | undefined, hoje: Date): number | null {
  if (!data) return null;
  const d = Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
  const h = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((d - h) / 86_400_000);
}

export type CredencialParaStatus = {
  /** Status gravado. `bloqueado` e `inativo` são declarados por gente e vencem o cálculo. */
  status: string;
  vencimentoEm?: Date | null;
  ultimaRevisaoEm?: Date | null;
};

/** Vencimento a partir de quantos dias vira "expirando" (§37 usa 90 como maior aviso). */
export const DIAS_AVISO_VENCIMENTO = 90;
/** Sem revisar há mais que isto → "atencao" (§8: "Credencial não é revisada há 180 dias"). */
export const DIAS_REVISAO = 180;

/**
 * Status EXIBIDO, que não é o mesmo que o status gravado (§19).
 *
 * `bloqueado` e `inativo` são declarações humanas e não podem ser sobrescritas por cálculo de
 * data — uma conta bloqueada pelo órgão continua bloqueada mesmo com licença em dia. O resto
 * deriva de vencimento e revisão, nesta ordem de gravidade.
 */
export function statusCredencial(cred: CredencialParaStatus, hoje: Date): StatusCredencial {
  if (cred.status === "bloqueado" || cred.status === "inativo") return cred.status;

  const dias = diasAte(cred.vencimentoEm, hoje);
  if (dias !== null && dias < 0) return "bloqueado"; // vencida: trata como impedimento real
  if (dias !== null && dias <= DIAS_AVISO_VENCIMENTO) return "expirando";

  const desdeRevisao = diasAte(cred.ultimaRevisaoEm, hoje);
  if (desdeRevisao !== null && -desdeRevisao > DIAS_REVISAO) return "atencao";

  return "ativo";
}

/** Uma concessão vinda do formulário, antes de virar linha no banco. */
export type ConcessaoEntrada = {
  tipoAlvo: string;
  alvoId: string;
  podeVerCadastro: boolean;
  podeVerCredencial: boolean;
  podeEditar: boolean;
  podeGerenciarPermissoes: boolean;
};

/**
 * Normaliza a lista de compartilhamentos vinda do formulário.
 *
 * Funde linhas repetidas do MESMO alvo somando as concessões (mesma regra aditiva de
 * `permissoesNaCredencial`) — a tabela tem `@@unique(credencialId, tipoAlvo, alvoId)`, e duas
 * linhas do mesmo alvo estourariam a transação inteira em vez de só a linha ruim.
 *
 * Descarta quem não concede nada: compartilhamento é lista de CONCESSÕES, então uma linha com
 * tudo `false` não significa "negue para este alvo" — significa nada, e guardá-la sugeriria a
 * quem lesse a tela que existe uma negação explícita ali.
 */
export function normalizarCompartilhamentos<T extends ConcessaoEntrada>(linhas: T[]): T[] {
  const porAlvo = new Map<string, T>();
  for (const l of linhas) {
    const chave = `${l.tipoAlvo}::${l.alvoId}`;
    const anterior = porAlvo.get(chave);
    porAlvo.set(
      chave,
      anterior
        ? {
            ...l,
            podeVerCadastro: anterior.podeVerCadastro || l.podeVerCadastro,
            podeVerCredencial: anterior.podeVerCredencial || l.podeVerCredencial,
            podeEditar: anterior.podeEditar || l.podeEditar,
            podeGerenciarPermissoes: anterior.podeGerenciarPermissoes || l.podeGerenciarPermissoes,
          }
        : l,
    );
  }
  return [...porAlvo.values()].filter(
    (l) => l.podeVerCadastro || l.podeVerCredencial || l.podeEditar || l.podeGerenciarPermissoes,
  );
}

export type NivelAcesso = "setor" | "perfil" | "usuario" | "restrito";

/**
 * §18 — como a credencial é ALCANÇADA, resumido numa palavra para a coluna "Acesso".
 *
 * Prioriza o alcance mais largo: quem é partilhado com um setor inteiro é "Setor", ainda que
 * também tenha pessoas nominais. `restrito` é o caso sem alcance coletivo nenhum — é a mesma
 * definição que o card "Acessos restritos" (§7-04) conta, e as duas leituras precisam bater.
 */
export function nivelDeAcesso(
  compartilhamentos: Array<{ tipoAlvo: string; podeVerCredencial: boolean }>,
): NivelAcesso {
  const comCredencial = compartilhamentos.filter((c) => c.podeVerCredencial);
  if (comCredencial.some((c) => c.tipoAlvo === "setor")) return "setor";
  if (comCredencial.some((c) => c.tipoAlvo === "perfil")) return "perfil";
  return "restrito";
}
