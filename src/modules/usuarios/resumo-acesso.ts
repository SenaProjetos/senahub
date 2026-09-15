/**
 * "O que essa combinação libera": tradução em pt-BR do que **Papel** + **Perfil de acesso**
 * concedem de fato, para a tela de Usuários responder sozinha a pergunta que hoje só se
 * responde lendo o código.
 *
 * PURO e client-safe (importa só `lib/roles`, sem Prisma, sem `server-only`) — mesmo padrão de
 * `documentos/fontes-meta.ts`. **Não autoriza nada, descreve.** Se algum dia divergir do que o
 * sistema faz, o errado é este arquivo, não o gate.
 *
 * Os eixos são diferentes de propósito, e é exatamente isso que a tela precisa mostrar:
 *   - **Perfil de acesso** decide `recurso:ação` — `can()` resolve por `permissaoEfetiva` desde
 *     a Onda D. Sem perfil, o motor nega tudo. Inclui a fila de Aprovações (`uploads:validar`,
 *     desde 2026-09-02).
 *   - **Contratação** decide a batida, o espelho, as férias e a folha CLT (`ponto/jornada.ts`,
 *     desde 2026-09-15) — não o papel.
 *   - **Papel** (`role`) ainda decide o apontamento (`PJ_ROLES`) e o "agir em disciplina alheia"
 *     (`GLOBAL_ROLES`): confirmar aprovação em 2 etapas, editar pendência, diário e tarefa de
 *     outros, enviar arquivo em qualquer disciplina. São gates que a Onda D não converteu.
 *   - **Escopo de projetos** é outro eixo: `acessoGlobal()` = `superUsuario ||` permissão
 *     `escopo:global` do perfil.
 */
import { GLOBAL_ROLES, PJ_ROLES, type Role } from "@/lib/roles";
import { controlaJornada } from "@/modules/ponto/jornada";
import type { Contratacao } from "@/generated/prisma/enums";

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
  /** O perfil tem `uploads:validar` — o gate de `/aprovacoes`. */
  perfilValidaEntregas: boolean;
  /** Contratação do vínculo ativo — eixo da jornada. */
  contratacao: Contratacao | null;
  /** Já teve algum vínculo. Sem ele, "sem contratação" não se distingue de "vínculo encerrado". */
  jaTeveVinculo: boolean;
  superUsuario: boolean;
  ehSocio: boolean;
};

/**
 * Registro de horas: batida pela CONTRATAÇÃO (`controlaJornada`), apontamento ainda pelo PAPEL. A
 * pessoa que não cai em nenhum dos dois fica sem registrar hora — o que zera o custo dela no rateio
 * de projeto. Por isso é aviso, exceto para superusuário e cliente.
 */
function jornada(e: EntradaResumo): { valor: string; tom: TomResumo } {
  if (e.role === "cliente") return { valor: "Não se aplica (acesso externo, só o portal)", tom: "neutro" };
  const sujeito = { role: e.role, contratacao: e.contratacao, jaTeveVinculo: e.jaTeveVinculo };
  if (controlaJornada(sujeito)) {
    return { valor: "Bate ponto — espelho, banco de horas, férias e folha CLT (pela contratação)", tom: "ok" };
  }
  if (PJ_ROLES.includes(e.role)) {
    return { valor: "Registra apontamento de horas (sem ponto, sem folha CLT)", tom: "ok" };
  }
  if (e.superUsuario) return { valor: "Não registra horas", tom: "neutro" };
  const motivo = e.contratacao
    ? "a contratação não é CLT nem estágio, e o apontamento é só para o papel Projetista PJ ou Freelancer"
    : e.jaTeveVinculo
      ? "o vínculo está encerrado"
      : "não há vínculo cadastrado — cadastre em RH → Pessoas";
  return { valor: `Não registra horas: ${motivo}`, tom: "aviso" };
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

  // 3. Fila de Aprovações — pelo Perfil de acesso (`uploads:validar`) desde 2026-09-02.
  const validaEntregas = e.ativo && (e.superUsuario || e.perfilValidaEntregas);
  linhas.push({
    chave: "aprovacoes",
    titulo: "Fila de Aprovações",
    valor: validaEntregas
      ? "Abre /aprovacoes e valida entregas"
      : "Não abre /aprovacoes — o perfil não tem \"Validar entregas\"",
    tom: validaEntregas ? "ok" : "neutro",
  });

  // 4. O que continua preso ao Papel — a parte que mais confunde, porque trocar o Perfil de
  //    acesso não mexe nela.
  const atuaPorPapel = GLOBAL_ROLES.includes(e.role);
  linhas.push({
    chave: "disciplina_alheia",
    titulo: "Disciplina de outros",
    valor: atuaPorPapel
      ? "Age em qualquer disciplina: confirma aprovação, edita pendência, diário e tarefa de outros, envia arquivo"
      : "Só na própria disciplina — agir na dos outros depende do Papel (Administrador ou Coordenador)",
    tom: atuaPorPapel ? "ok" : "neutro",
  });

  // 5. Jornada — batida pela contratação, apontamento pelo papel.
  const j = jornada(e);
  linhas.push({ chave: "jornada", titulo: "Registro de horas", valor: j.valor, tom: j.tom });

  // 6. Piso de sócio — override nominal, some da conta se ninguém disser que existe.
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
