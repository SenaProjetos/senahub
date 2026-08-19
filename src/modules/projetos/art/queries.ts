import "server-only";

import { prisma } from "@/lib/prisma";
import { formatarRegistro } from "@/modules/usuarios/registro";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Nome + registro do responsável: o usuário vinculado manda; senão, os campos avulsos. */
function responsavelDe(art: {
  responsavelNome: string | null;
  responsavelRegistro: string | null;
  responsavelUser: { name: string; nomeCompleto: string | null; conselho: string | null; registroProfissional: string | null; registroUf: string | null } | null;
}) {
  const u = art.responsavelUser;
  return {
    nome: u ? u.nomeCompleto || u.name : art.responsavelNome,
    registro: (u ? formatarRegistro(u) : null) ?? art.responsavelRegistro,
  };
}

const responsavelSelect = {
  select: { name: true, nomeCompleto: true, conselho: true, registroProfissional: true, registroUf: true },
} as const;

/** ARTs de um projeto (mais recentes primeiro), com o total de versões. */
export async function listarArtsDoProjeto(projetoId: string) {
  const arts = await prisma.art.findMany({
    where: { projetoId },
    orderBy: { createdAt: "desc" },
    include: {
      disciplina: { select: { id: true, disciplinaTextoLegado: true } },
      responsavelUser: responsavelSelect,
      _count: { select: { versoes: true } },
    },
  });

  return arts.map((a) => {
    const resp = responsavelDe(a);
    return {
      id: a.id,
      tipo: a.tipo,
      numero: a.numero,
      descricao: a.descricao,
      situacao: a.situacao,
      emitidaEm: ymd(a.emitidaEm),
      valor: a.valor != null ? Number(a.valor) : null,
      disciplina: a.disciplina,
      responsavelUserId: a.responsavelUserId,
      responsavelNome: resp.nome,
      responsavelRegistro: resp.registro,
      arquivoNome: a.arquivoNome,
      temArquivo: a.arquivoPath != null,
      versoes: a._count.versoes,
      criadoEm: a.createdAt.toISOString(),
    };
  });
}
export type ArtListItem = Awaited<ReturnType<typeof listarArtsDoProjeto>>[number];

/** Uma ART com todo o histórico de versões (mais recente primeiro). */
export async function artComVersoes(id: string) {
  const a = await prisma.art.findUnique({
    where: { id },
    include: {
      disciplina: { select: { id: true, disciplinaTextoLegado: true } },
      responsavelUser: responsavelSelect,
      versoes: {
        orderBy: { numero: "desc" },
        include: { autor: { select: { name: true } } },
      },
    },
  });
  if (!a) return null;

  const resp = responsavelDe(a);
  return {
    id: a.id,
    projetoId: a.projetoId,
    tipo: a.tipo,
    numero: a.numero,
    descricao: a.descricao,
    situacao: a.situacao,
    emitidaEm: ymd(a.emitidaEm),
    valor: a.valor != null ? Number(a.valor) : null,
    disciplina: a.disciplina,
    responsavelUserId: a.responsavelUserId,
    responsavelNome: resp.nome,
    responsavelRegistro: resp.registro,
    arquivoNome: a.arquivoNome,
    temArquivo: a.arquivoPath != null,
    versoes: a.versoes.map((v) => ({
      id: v.id,
      numero: v.numero,
      numeroArt: v.numeroArt,
      situacao: v.situacao,
      emitidaEm: ymd(v.emitidaEm),
      arquivoNome: v.arquivoNome,
      temArquivo: v.arquivoPath != null,
      observacao: v.observacao,
      autor: v.autor.name,
      criadoEm: v.createdAt.toISOString(),
    })),
  };
}
export type ArtDetalhe = NonNullable<Awaited<ReturnType<typeof artComVersoes>>>;

/** Disciplinas do projeto, para o seletor do cadastro de ART. */
export async function disciplinasParaArt(projetoId: string) {
  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: { id: true, disciplinaTextoLegado: true },
  });
  // Volta a se chamar `nome` na fronteira da UI — o seletor fala "nome", não o nome do campo
  // do banco. A F1.19c renomeou a coluna no schema, não o rótulo exibido.
  return disciplinas.map((d) => ({ id: d.id, nome: d.disciplinaTextoLegado }));
}

/**
 * Candidatos a responsável técnico: usuários internos ativos com registro profissional
 * preenchido. Alimenta o `Select` do cadastro de ART e do memorial de cálculo.
 */
export async function responsaveisDisponiveis() {
  const users = await prisma.user.findMany({
    where: { ativo: true, conselho: { not: null }, registroProfissional: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, nomeCompleto: true, conselho: true, registroProfissional: true, registroUf: true },
  });
  return users.map((u) => ({
    id: u.id,
    nome: u.nomeCompleto || u.name,
    registro: formatarRegistro(u) ?? "",
  }));
}
