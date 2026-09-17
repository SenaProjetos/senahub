import "server-only";
import { prisma } from "@/lib/prisma";
import { podeVerTodasDisciplinas, responsavelOuVeTodas } from "@/modules/arquivos/acesso";
import { catalogosPrancha, mapaCanonico } from "@/modules/projetos/pranchas/queries";
import { listarDocumentosAgrupados } from "@/modules/uploads/documentos-agrupados";
import type { SubjectAutorizacao } from "@/lib/permissions";
import type { EscopoDeDados } from "@/lib/roles";
import {
  faseDaListaMestre,
  montarListaMestre,
  nomeDaListaMestre,
  numeroDaListaMestre,
  type LinhaListaMestre,
} from "./montar";

/** Teto de documentos lidos numa geração — uma disciplina real tem dezenas, não milhares. */
const LIMITE_DOCUMENTOS = 5000;

export type ListaMestreCarregada =
  | { ok: false; status: 400 | 404; erro: string }
  | {
      ok: true;
      projeto: { id: string; codigo: string; nome: string };
      disciplina: { id: string; nome: string };
      /** Nome sem extensão (`{proj}-{disc}-{fase}-{nº}-{tipo}`). */
      nome: string;
      faseId: string;
      tipoId: string;
      tipoNome: string;
      /** Lista Mestre anterior desta disciplina: a nova geração entra como revisão DELA. */
      documentoExistenteId: string | null;
      linhas: LinhaListaMestre[];
    };

/**
 * Carrega o que a Lista Mestre de uma disciplina precisa, com a MESMA muralha da aba Arquivos
 * (sem visão ampla, só a disciplina de que a pessoa é responsável) e a mesma listagem de
 * documentos — o filtro "validado" e os títulos de reserva saem de lá, não de uma consulta à parte.
 */
export async function carregarListaMestre(
  user: SubjectAutorizacao & EscopoDeDados & { id: string },
  projeto: { id: string; codigo: string; nome: string },
  disciplinaId: string,
): Promise<ListaMestreCarregada> {
  const [disciplina, veTodas, catalogos] = await Promise.all([
    prisma.disciplina.findFirst({
      where: { id: disciplinaId, projetoId: projeto.id },
      select: {
        id: true,
        disciplinaTextoLegado: true,
        numeracaoInicioProjeto: true,
        catalogo: { select: { nome: true, codigo: true, numeracao: true } },
        responsaveis: { select: { userId: true } },
      },
    }),
    podeVerTodasDisciplinas(user),
    catalogosPrancha(projeto.id),
  ]);
  if (!disciplina || !responsavelOuVeTodas(user.id, veTodas, disciplina.responsaveis)) {
    return { ok: false, status: 404, erro: "Disciplina não encontrada." };
  }
  const nomeDisciplina = disciplina.catalogo?.nome ?? disciplina.disciplinaTextoLegado;
  const sigla = disciplina.catalogo?.codigo;
  if (!sigla) {
    return {
      ok: false,
      status: 400,
      erro: `A disciplina ${nomeDisciplina} não tem sigla no catálogo (Configurações → Disciplinas) — sem ela não dá para nomear a Lista Mestre.`,
    };
  }

  // O tipo "Lista Mestre" é o do catálogo cuja sigla ou sinônimo é LMS/LME — a sigla canônica
  // pode ter sido trocada na tela, e o nome gerado acompanha.
  const canonicoTipo = mapaCanonico(catalogos.tipo);
  const siglaTipo = canonicoTipo.get("LMS") ?? canonicoTipo.get("LME");
  const tipo = siglaTipo ? catalogos.tipo.find((t) => t.sigla.toUpperCase() === siglaTipo) : undefined;
  if (!tipo) {
    return {
      ok: false,
      status: 400,
      erro: "Cadastre o tipo Lista Mestre (sigla LMS ou sinônimo LME) em Configurações → Lista Mestre.",
    };
  }

  const pagina = await listarDocumentosAgrupados({
    projetoId: projeto.id,
    userId: user.id,
    veTodas,
    ehGlobal: false,
    podeEnviarCap: false,
    podeEditarMetadados: false,
    podeAlterarStatus: false,
    filtros: { disciplinaId: disciplina.id, validado: "sim", pacote: "A" },
    skip: 0,
    take: LIMITE_DOCUMENTOS,
    sort: "nome",
    dir: "asc",
  });
  const linhas = montarListaMestre(pagina.linhas, tipo.sigla.toUpperCase());
  if (linhas.length === 0) {
    return {
      ok: false,
      status: 400,
      erro: `${nomeDisciplina} ainda não tem documento validado em Pranchas — valide os arquivos antes de gerar a Lista Mestre.`,
    };
  }

  const siglaFase = faseDaListaMestre(linhas);
  const fase = siglaFase ? catalogos.fase.find((f) => f.sigla.toUpperCase() === siglaFase.toUpperCase()) : undefined;
  if (!fase) {
    return {
      ok: false,
      status: 400,
      erro: `Nenhum documento validado de ${nomeDisciplina} tem fase — preencha a fase deles para nomear a Lista Mestre.`,
    };
  }

  // Lista Mestre já gerada (ou enviada à mão, com a sigla antiga LME): a próxima vai como
  // revisão do MESMO documento, senão cada geração criaria um documento paralelo só porque o
  // nome mudou de sigla ou de número.
  const anterior = await prisma.documentoDisciplina.findFirst({
    where: {
      disciplinaId: disciplina.id,
      tipoId: tipo.id,
      substituidoPorId: null,
      chave: { startsWith: "A/" },
      uploads: { some: { excluidoEm: null } },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: { select: { final: true } } },
  });

  const numero = numeroDaListaMestre(disciplina.numeracaoInicioProjeto ?? disciplina.catalogo?.numeracao ?? null, linhas);
  return {
    ok: true,
    projeto,
    disciplina: { id: disciplina.id, nome: nomeDisciplina },
    nome: nomeDaListaMestre({
      codigoProjeto: projeto.codigo,
      siglaDisciplina: sigla,
      fase: fase.sigla,
      numero,
      siglaTipo: tipo.sigla,
    }),
    faseId: fase.id,
    tipoId: tipo.id,
    documentoExistenteId: anterior && !anterior.status?.final ? anterior.id : null,
    tipoNome: tipo.nome,
    linhas,
  };
}
