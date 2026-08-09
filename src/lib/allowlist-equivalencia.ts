import type { ViaAutorizacao } from "@/lib/equivalencia-permissoes";

/**
 * Allowlist do gate de equivalência (§6.2 passo 3 do plano de Setor × Contratação × Perfil):
 * **"`false → true` (ganhou acesso) = falha dura. Exceção só via allowlist versionada e
 * aprovada."** Este arquivo é essa allowlist.
 *
 * Ela existe para que uma mudança intencional de acesso seja **registrada**, e não para fazer o
 * gate calar. Por isso:
 *   - o casamento é EXATO (usuário + recurso + ação + via). Nada de curinga: uma exceção que
 *     cobre "tudo daquele usuário" deixa de ser exceção e vira porta.
 *   - toda entrada carrega `motivo`, `aprovadoPor` e `aprovadoEm`. Sem isso, em 12 meses
 *     ninguém sabe por que a linha está aqui — que é literalmente o R5 do plano.
 *   - o gate ainda IMPRIME os ganhos aceitos, só não bloqueia. Exceção silenciosa não serve.
 *   - entradas que não casam com nada são reportadas como obsoletas, para serem removidas.
 *
 * O identificador é o **hash** do userId (`hashUserId`, sha256/12), não o id real — o mesmo que
 * o relatório em `logs/` usa. Assim a allowlist é versionável sem carregar identificador direto
 * de pessoa.
 */

export type ExcecaoEquivalencia = {
  /** `hashUserId(user.id)` — o mesmo hash que aparece no relatório JSON do gate. */
  userIdHash: string;
  recurso: string;
  acao: string;
  via: ViaAutorizacao;
  /** Por que este ganho é aceitável. Frase de negócio, não "aprovado". */
  motivo: string;
  aprovadoPor: string;
  /** ISO (AAAA-MM-DD). */
  aprovadoEm: string;
};

const MOTIVO_PISO_LEITURA_SOCIO =
  "Piso de sócio passou a valer também em Server Actions. Hoje o `defineAction` não aplica piso " +
  "nenhum e o `requirePermission` aplica, então esta pessoa já enxerga isto nas páginas — o flip " +
  "só torna o comportamento consistente entre os dois caminhos. Todas de LEITURA: o piso de " +
  "sócio é read-only por decisão de 2026-08-08 (§15.7).";

export const ALLOWLIST_EQUIVALENCIA: ExcecaoEquivalencia[] = [
  // Sócio ativo com perfil `projetista_pj` (§15.9). As 5 células de leitura que o perfil
  // `coordenador` concede e o `projetista_pj` não — materializadas como override de piso.
  // As 7 de ESCRITA do mesmo caso foram deliberadamente NÃO aceitas: decisão do dono em
  // 2026-08-09 é que essa pessoa **perde** as 7 no flip (§15.12).
  ...(
    [
      ["qualidade", "ver"],
      ["recursos", "ver"],
      ["ponto", "rateio"],
      ["arquivos", "ver_todas_disciplinas"],
      ["projetos", "historico"],
    ] as const
  ).map(([recurso, acao]) => ({
    userIdHash: "de4d7b2489d1",
    recurso,
    acao,
    via: "defineAction" as const,
    motivo: MOTIVO_PISO_LEITURA_SOCIO,
    aprovadoPor: "dono do produto",
    aprovadoEm: "2026-08-09",
  })),
];

type ChaveGanho = { userId: string; recurso: string; acao: string; via?: ViaAutorizacao };

function chave(e: { userIdHash?: string; userId?: string; recurso: string; acao: string; via?: ViaAutorizacao }): string {
  return `${e.userIdHash ?? e.userId}::${e.recurso}:${e.acao}::${e.via ?? "requirePermission"}`;
}

const PORCHAVE = new Map(ALLOWLIST_EQUIVALENCIA.map((e) => [chave(e), e]));

/**
 * A exceção que cobre este ganho, se houver. `userId` DEVE vir já hasheado — o chamador é quem
 * sabe se está com o id real em mãos.
 */
export function excecaoDe(ganho: ChaveGanho): ExcecaoEquivalencia | undefined {
  return PORCHAVE.get(chave(ganho));
}

/**
 * Entradas da allowlist que **deixaram de ser necessárias** — a pessoa está nesta base e o ganho
 * que a exceção cobria não aparece mais. Não é erro; é higiene: exceção que sobra vira um
 * cemitério que ninguém ousa limpar e que pode voltar a cobrir algo sem que ninguém perceba.
 *
 * `usuariosPresentes` (hashes) evita o alarme falso óbvio: uma exceção nominal de produção
 * naturalmente não casa com nada no banco de dev, onde aquela pessoa não existe. Isso é
 * "não se aplica aqui", não "está obsoleta" — e um gate que grita nos dois casos ensina o time
 * a ignorar o aviso.
 */
export function excecoesObsoletas(ganhos: ChaveGanho[], usuariosPresentes?: Set<string>): ExcecaoEquivalencia[] {
  const usadas = new Set(ganhos.map(chave));
  return ALLOWLIST_EQUIVALENCIA.filter(
    (e) => !usadas.has(chave(e)) && (usuariosPresentes === undefined || usuariosPresentes.has(e.userIdHash)),
  );
}
