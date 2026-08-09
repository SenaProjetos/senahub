/**
 * Comparador do arnês de equivalência (§6.2 do plano). Puro — sem I/O, sem Prisma — para
 * poder ser testado com fixtures sintéticas e rodar em CI sem banco.
 *
 * Assimétrico por design: é isso que garante fail-closed na migração de `role` para
 * Perfil de acesso.
 *   - `false → true` (ganhou acesso) é a mudança que importa: alguém passaria a ver
 *     financeiro, RH ou dado sensível que não via antes. Vira `ganhos` — falha dura.
 *   - `true → false` (perdeu acesso) é degradação de serviço, não incidente de segurança:
 *     conserta-se com um override. Vira `perdas` — warning.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2, R1)
 */

/**
 * Qual dos DOIS caminhos de autorização a célula mede. Eles não são equivalentes hoje:
 *   - `requirePermission` (`session.ts`) aplica o piso de sócio: `can(role) || (ehSocio && can("supervisor"))`
 *   - `defineAction` (`with-action.ts`) chama `can(user, ...)` e **não** aplica o piso
 * Ou seja: um sócio não-admin hoje passa em páginas que o coordenador vê, mas NÃO nas Server
 * Actions correspondentes. `permissaoEfetiva` não tem essa divisão (o piso virou override
 * individual, que vale em qualquer checagem), então medir só a fórmula de `requirePermission`
 * esconderia um GANHO de acesso de escrita no caminho de `defineAction` — R1 fail-open com
 * luz verde. As duas fórmulas viram matrizes separadas.
 */
export type ViaAutorizacao = "requirePermission" | "defineAction";

export type CelulaPermissao = {
  /** Hasheado pelo script gerador — nunca o id real em fixtures persistidas. */
  userId: string;
  /** Só para leitura humana do relatório; a comparação em si não depende de `role`. */
  role: string;
  recurso: string;
  acao: string;
  /** Caminho medido. Ausente = `requirePermission` (formato antigo do relatório). */
  via?: ViaAutorizacao;
  permitido: boolean;
};

export type DiferencaPermissao = {
  userId: string;
  role: string;
  recurso: string;
  acao: string;
  via?: ViaAutorizacao;
  antes: boolean;
  depois: boolean;
};

export type ResultadoEquivalencia = {
  ganhos: DiferencaPermissao[];
  perdas: DiferencaPermissao[];
};

function chave(c: { userId: string; recurso: string; acao: string; via?: ViaAutorizacao }): string {
  // `via` entra na chave para que as duas fórmulas não se sobreponham. Ausente vira
  // `requirePermission` — mantém compatível o relatório gerado antes desta divisão.
  return `${c.userId}::${c.recurso}:${c.acao}::${c.via ?? "requirePermission"}`;
}

/**
 * Compara a matriz "antes" (legado, via `can()`) com a matriz "depois" (via
 * `permissaoEfetiva()`), célula a célula. Uma célula presente em `antes` e ausente em
 * `depois` é tratada como `permitido: false` — ausência de linha é o "default negado" dos
 * dois motores, então é a comparação correta, não um erro de dado faltando.
 */
export function compararPermissoes(antes: CelulaPermissao[], depois: CelulaPermissao[]): ResultadoEquivalencia {
  const depoisPorChave = new Map(depois.map((c) => [chave(c), c]));
  const ganhos: DiferencaPermissao[] = [];
  const perdas: DiferencaPermissao[] = [];

  for (const a of antes) {
    const d = depoisPorChave.get(chave(a));
    const depoisPermitido = d?.permitido ?? false;
    if (a.permitido === depoisPermitido) continue;

    const diff: DiferencaPermissao = {
      userId: a.userId,
      role: a.role,
      recurso: a.recurso,
      acao: a.acao,
      via: a.via,
      antes: a.permitido,
      depois: depoisPermitido,
    };
    if (!a.permitido && depoisPermitido) ganhos.push(diff);
    else perdas.push(diff);
  }

  return { ganhos, perdas };
}
