import "server-only";
import { prisma } from "@/lib/prisma";
import {
  prePopularRespostas,
  respostasVisiveis,
  secoesDoProjeto,
  type SecaoBriefing,
} from "@/modules/inputs/briefing-schema";
import { resolverModeloDoProjeto } from "@/modules/inputs/modelo-queries";

/** O que a leitura precisa do projeto (o link e o portal já carregam isto). */
export type ProjetoDoFormulario = {
  id: string;
  endereco: string | null;
  cliente: { nome: string; email: string | null; telefone: string | null } | null;
  disciplinas: { disciplinaTextoLegado: string }[];
  briefing: {
    respostasJson: unknown;
    secoesOcultas: string[];
    camposOcultos: string[];
    modeloId: string | null;
  } | null;
};

export type ExtraDoFormulario = { id: string; disciplina: string | null; pergunta: string; resposta: string };

export type FormularioDoCliente = {
  /** Seções que o projeto mostra (modelo, disciplinas ativas, ocultações). */
  secoes: SecaoBriefing[];
  /** O que está GRAVADO (base do status e do progresso, igual ao selo da equipe). */
  gravadas: Record<string, unknown>;
  /** O que a tela recebe: gravado + pré-preenchimento do cadastro, sem resposta de campo oculto. */
  respostas: Record<string, unknown>;
  /** Perguntas extras ATIVAS do projeto. */
  extras: ExtraDoFormulario[];
};

/**
 * UMA leitura do formulário do cliente — a do link público e a do portal. Quem monta o formulário de um projeto
 * para o cliente passa por aqui: modelo resolvido, ocultações, `secoesDoProjeto`, pré-preenchimento e
 * `respostasVisiveis` (resposta de campo oculto, ou de disciplina que o projeto não tem, não sai do servidor).
 */
export async function formularioDoCliente(projeto: ProjetoDoFormulario): Promise<FormularioDoCliente> {
  const disciplinas = projeto.disciplinas.map((d) => d.disciplinaTextoLegado);
  const ocultos = {
    secoes: projeto.briefing?.secoesOcultas ?? [],
    campos: projeto.briefing?.camposOcultos ?? [],
  };
  const modelo = await resolverModeloDoProjeto(projeto.id, projeto.briefing?.modeloId);
  const secoes = secoesDoProjeto(modelo.secoes, disciplinas, ocultos);
  const gravadas = (projeto.briefing?.respostasJson as Record<string, unknown> | null) ?? {};
  const respostas = respostasVisiveis(
    prePopularRespostas(
      gravadas,
      {
        nome: projeto.cliente?.nome,
        email: projeto.cliente?.email,
        telefone: projeto.cliente?.telefone,
        endereco: projeto.endereco ?? undefined,
      },
      modelo.secoes,
    ),
    secoes,
  );
  const linhas = await prisma.inputProjeto.findMany({
    where: { projetoId: projeto.id, removidoEm: null },
    orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
    select: { id: true, disciplina: true, pergunta: true, resposta: true },
  });
  const extras = linhas.map((e) => ({ id: e.id, disciplina: e.disciplina, pergunta: e.pergunta, resposta: e.resposta ?? "" }));
  return { secoes, gravadas, respostas, extras };
}
