/**
 * "O que essa combinação libera": tradução em pt-BR do que **Papel** + **Perfil de acesso**
 * concedem de fato, para a tela de Usuários responder sozinha a pergunta que hoje só se
 * responde lendo o código.
 *
 * PURO e client-safe (importa só `lib/roles`, sem Prisma, sem `server-only`) — mesmo padrão de
 * `documentos/fontes-meta.ts`. **Não autoriza nada, descreve.** Se algum dia divergir do que o
 * sistema faz, o errado é este arquivo, não o gate.
 *
 * Os dois eixos são diferentes de propósito, e é exatamente isso que a tela precisa mostrar:
 *   - **Perfil de acesso** decide `recurso:ação` — `can()` resolve por `permissaoEfetiva` desde
 *     a Onda D. Sem perfil, o motor nega tudo (default negado aplicado à pessoa).
 *   - **Papel** (`role`) ainda decide a jornada (`CLT_ROLES`/`PJ_ROLES`) e os gates que a Onda D
 *     não converteu: `GLOBAL_ROLES` em `/aprovacoes`, no `podeAprovar` do painel e no escopo
 *     global de arquivos/uploads/coordenação.
 *   - **Escopo de projetos** é um terceiro eixo: `acessoGlobal()` = `superUsuario ||` permissão
 *     `escopo:global` do perfil. Nenhum perfil semente recebe `escopo:global` (§9.7 — Coordenador
 *     perdeu o escopo global de propósito).
 */
import { CLT_ROLES, GLOBAL_ROLES, PJ_ROLES, type Role } from "@/lib/roles";

/** `aviso` = o admin precisa reparar nisso antes de salvar; `ok`/`neutro` só informam. */
export type TomResumo = "ok" | "aviso" | "neutro";

export type LinhaResumo = {
  /** Estável — usado como `key` e nos testes; não é exibido. */
  chave: string;
  titulo: string;
  valor: string;
  tom: TomResumo;
};

export type EntradaResumo = {
  role: Role;
  ativo: boolean;
  /** `User.perfilId` preenchido. Sem ele, `permissaoEfetiva` nega tudo. */
  temPerfil: boolean;
  perfilNome: string | null;
  /** O perfil tem a permissão sintética `escopo:global`. */
  perfilEscopoGlobal: boolean;
  superUsuario: boolean;
  ehSocio: boolean;
};

/**
 * Papéis que chegam em `/ponto` mas cujo `registrarBatida` o servidor recusa: a página aceita
 * todo interno, a action tem `roles: CLT_ROLES`. Não é bug desta tela — é o estado real do
 * sistema, e esconder isso é o que faz o admin descobrir só quando a pessoa reclama.
 */
function jornada(role: Role): { valor: string; tom: TomResumo } {
  if (CLT_ROLES.includes(role)) {
    return { valor: "Bate ponto — folha CLT, férias e banco de horas", tom: "ok" };
  }
  if (PJ_ROLES.includes(role)) {
    return { valor: "Registra apontamento de horas (sem ponto, sem folha CLT)", tom: "ok" };
  }
  if (role === "cliente") {
    return { valor: "Não se aplica (acesso externo, só o portal)", tom: "neutro" };
  }
  return {
    valor: "Abre a tela de Ponto, mas o registro de batida é recusado — só CLT e Estágio batem ponto",
    tom: "aviso",
  };
}

export function resumirAcesso(e: EntradaResumo): LinhaResumo[] {
  const linhas: LinhaResumo[] = [];

  // 1. Telas e ações — o que o Perfil de acesso decide.
  if (!e.ativo) {
    linhas.push({
      chave: "telas",
      titulo: "Telas e ações",
      valor: "Conta inativa — nada liberado, nem com perfil atribuído",
      tom: "aviso",
    });
  } else if (e.superUsuario) {
    linhas.push({
      chave: "telas",
      titulo: "Telas e ações",
      valor: "Acesso total (bypass) — o Perfil de acesso nem chega a ser consultado",
      tom: "aviso",
    });
  } else if (!e.temPerfil) {
    linhas.push({
      chave: "telas",
      titulo: "Telas e ações",
      valor: "Sem Perfil de acesso: nenhuma tela liberada. Escolha um perfil acima",
      tom: "aviso",
    });
  } else {
    linhas.push({
      chave: "telas",
      titulo: "Telas e ações",
      valor: `Pelo perfil "${e.perfilNome ?? "—"}"`,
      tom: "ok",
    });
  }

  // 2. Escopo de dados — `acessoGlobal()`, terceiro eixo, nem Papel nem matriz de telas.
  const global = e.superUsuario || e.perfilEscopoGlobal;
  linhas.push({
    chave: "escopo",
    titulo: "Projetos que enxerga",
    valor: global
      ? "Todos os projetos da empresa"
      : "Só os projetos onde é membro ou responsável",
    tom: global ? "ok" : "neutro",
  });

  // 3. Gates que continuam presos ao Papel — a parte que mais confunde, porque trocar o
  //    Perfil de acesso não mexe nela.
  const ehGlobalPorPapel = GLOBAL_ROLES.includes(e.role);
  linhas.push({
    chave: "aprovacoes",
    titulo: "Fila de Aprovações",
    valor: ehGlobalPorPapel
      ? "Vê /aprovacoes e o escopo global de arquivos e uploads"
      : "Não vê /aprovacoes — isso depende do Papel (Administrador ou Coordenador), não do Perfil de acesso",
    tom: ehGlobalPorPapel ? "ok" : "neutro",
  });

  // 4. Jornada — `CLT_ROLES`/`PJ_ROLES`, também pelo Papel.
  const j = jornada(e.role);
  linhas.push({ chave: "jornada", titulo: "Registro de horas", valor: j.valor, tom: j.tom });

  // 5. Piso de sócio — override nominal, some da conta se ninguém disser que existe.
  if (e.ehSocio) {
    linhas.push({
      chave: "socio",
      titulo: "Piso de sócio",
      valor: "Além do perfil, recebe o que o papel Coordenador poderia em qualquer checagem de permissão",
      tom: "neutro",
    });
  }

  return linhas;
}
