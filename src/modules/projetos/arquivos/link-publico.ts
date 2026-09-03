import "server-only";
import { prisma } from "@/lib/prisma";
import { linkVigente } from "@/lib/link-publico";
import { ehBackupDoModelo, recortarParaLinkPublico } from "./link-publico-regras";

/**
 * Link público (sem login) de arquivos do projeto — somente ver + baixar.
 * Fonte única usada pela página pública (`/p/arquivos/[token]`), pelas rotas de
 * download (`/api/p/arquivos/[token]/...`) e pelo gerenciamento na aba Arquivos.
 *
 * Um projeto pode ter VÁRIOS links, cada um com o seu escopo:
 *  - `disciplinas`  — whitelist de disciplinas (padrão histórico);
 *  - `projeto_todo` — todas as disciplinas, inclusive as criadas depois do link;
 *  - `selecao`      — arquivos escolhidos a dedo.
 *
 * Regras da muralha, nos escopos `disciplinas` e `projeto_todo`:
 *  - só uploads validados (`validado=true`), fora da lixeira (`excluidoEm=null`);
 *  - de cada documento, só a ÚLTIMA revisão;
 *  - nada de "backup do modelo" (pacote B) — é arquivo de software, não entrega;
 *  - `ativo=false` revoga na hora; `expiraEm` no passado desliga o link.
 *
 * No escopo `selecao` a escolha manual vence as duas regras do meio (dá para mandar uma
 * revisão antiga ou um backup de propósito), mas a lixeira continua fora: arquivo na
 * lixeira é purgado em 30 dias e viraria link quebrado.
 *
 * O recorte vive em `link-publico-regras.ts` (puro, testado) e é aplicado nas QUATRO
 * leituras abaixo. Se ficasse só na da página, o .zip despacharia revisão vencida e as
 * URLs diretas antigas continuariam servindo.
 */

/** Link vale agora? (ativo e não expirado) — regra em `lib/link-publico.ts`. */
export { linkVigente };

/** Todos os links do projeto, para a tela de gerenciamento (aba Arquivos). */
export async function linksArquivosDoProjeto(projetoId: string) {
  return prisma.linkPublicoArquivos.findMany({
    where: { projetoId },
    orderBy: { createdAt: "asc" },
  });
}

export type ArquivoPublico = {
  id: string;
  nome: string;
  tamanho: number;
  ehPdf: boolean;
  /** Revisão do upload (1, 2, 3...) — a página mostra como R01, R02. */
  versao: number;
};
export type DisciplinaPublica = {
  id: string;
  nome: string;
  arquivos: ArquivoPublico[];
};
export type ArtPublica = {
  id: string;
  rotulo: string;
  disciplina: string | null;
  situacao: string;
  emitidaEm: string | null;
  /** Versões históricas COM arquivo — o cliente vê o histórico completo. */
  versoes: { id: string; numero: number; rotulo: string }[];
};
export type ConteudoPublico = {
  projeto: { codigo: string; nome: string };
  /** Rótulo do link ("Prefeitura", "Cliente final"), quando quem criou deu um. */
  titulo: string | null;
  disciplinas: DisciplinaPublica[];
  arts: ArtPublica[];
};

/** Campos que o recorte de `link-publico-regras.ts` precisa ver em cada upload. */
const SELECT_REGRAS = {
  pacote: true,
  documentoId: true,
  documento: { select: { substituidoPorId: true } },
  revisao: { select: { numero: true } },
} as const;

type LinhaRegras = {
  id: string;
  pacote: string | null;
  documentoId: string | null;
  documento: { substituidoPorId: string | null } | null;
  revisao: { numero: number } | null;
};

/** Achata o formato do Prisma no formato plano que o recorte puro espera. */
function paraRecorte<T extends LinhaRegras>(u: T) {
  return {
    ...u,
    documentoCanonicoId: u.documento?.substituidoPorId ?? null,
    revisaoNumero: u.revisao?.numero ?? null,
  };
}

/**
 * Disciplinas que o link alcança. `null` = link não expõe nada (whitelist vazia, ou
 * projeto sem disciplina) — a página trata como indisponível.
 *
 * `projeto_todo` resolve na hora da leitura de propósito: disciplina criada depois do
 * link entra sozinha, que é justamente o ponto de um link "do projeto inteiro".
 */
async function disciplinasDoLink(link: {
  escopo: string;
  projetoId: string;
  disciplinaIds: string[];
}): Promise<string[] | null> {
  if (link.escopo === "projeto_todo") {
    const todas = await prisma.disciplina.findMany({
      where: { projetoId: link.projetoId },
      select: { id: true },
    });
    return todas.length > 0 ? todas.map((d) => d.id) : null;
  }
  return link.disciplinaIds.length > 0 ? link.disciplinaIds : null;
}

/**
 * ARTs visíveis no link: as do projeto todo (sem disciplina) e as de disciplinas
 * alcançadas pelo link — a mesma muralha dos arquivos. Só entram as que têm PDF:
 * sem arquivo não há o que baixar.
 *
 * As versões históricas continuam saindo inteiras. É intencional e diferente da regra
 * de "só a última revisão": a ART é documento legal, e o cliente precisa da série toda.
 */
async function artsPublicasDoLink(projetoId: string, disciplinaIds: string[]) {
  const arts = await prisma.art.findMany({
    where: {
      projetoId,
      arquivoPath: { not: null },
      OR: [{ disciplinaId: null }, { disciplinaId: { in: disciplinaIds } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tipo: true,
      numero: true,
      situacao: true,
      emitidaEm: true,
      disciplina: { select: { disciplinaTextoLegado: true } },
      versoes: {
        where: { arquivoPath: { not: null } },
        orderBy: { numero: "desc" },
        select: { id: true, numero: true, numeroArt: true },
      },
    },
  });

  return arts.map((a) => ({
    id: a.id,
    rotulo: `${a.tipo} ${a.numero}`,
    disciplina: a.disciplina?.disciplinaTextoLegado ?? null,
    situacao: a.situacao,
    emitidaEm: a.emitidaEm ? a.emitidaEm.toISOString().slice(0, 10) : null,
    versoes: a.versoes.map((v) => ({ id: v.id, numero: v.numero, rotulo: `${a.tipo} ${v.numeroArt}` })),
  }));
}

function ehPdf(nome: string): boolean {
  return nome.toLowerCase().endsWith(".pdf");
}

/**
 * Conteúdo de um link de seleção: exatamente os arquivos escolhidos, agrupados pela
 * disciplina de cada um só para a página ter como organizar a lista. Sem ART — quem
 * escolheu arquivo a arquivo não pediu o anexo automático.
 */
async function conteudoDaSelecao(uploadIds: string[]): Promise<DisciplinaPublica[]> {
  if (uploadIds.length === 0) return [];
  const uploads = await prisma.upload.findMany({
    where: { id: { in: uploadIds }, excluidoEm: null },
    orderBy: [{ disciplina: { ordem: "asc" } }, { nomeArquivo: "asc" }],
    select: {
      id: true,
      nomeArquivo: true,
      tamanho: true,
      versao: true,
      disciplina: { select: { id: true, disciplinaTextoLegado: true } },
    },
  });

  const porDisciplina = new Map<string, DisciplinaPublica>();
  for (const u of uploads) {
    let grupo = porDisciplina.get(u.disciplina.id);
    if (!grupo) {
      grupo = { id: u.disciplina.id, nome: u.disciplina.disciplinaTextoLegado, arquivos: [] };
      porDisciplina.set(u.disciplina.id, grupo);
    }
    grupo.arquivos.push({
      id: u.id,
      nome: u.nomeArquivo,
      tamanho: u.tamanho,
      ehPdf: ehPdf(u.nomeArquivo),
      versao: u.versao,
    });
  }
  return [...porDisciplina.values()];
}

/**
 * Resolve o conteúdo visível de um link por token: só se o link estiver vigente.
 * Retorna `null` quando o token não existe ou o link está revogado/expirado
 * (a página pública trata como "link indisponível").
 */
export async function conteudoPublicoPorToken(token: string): Promise<ConteudoPublico | null> {
  const link = await prisma.linkPublicoArquivos.findUnique({
    where: { token },
    include: { projeto: { select: { codigo: true, nome: true } } },
  });
  if (!link || !linkVigente(link)) return null;

  const projeto = { codigo: link.projeto.codigo, nome: link.projeto.nome };

  if (link.escopo === "selecao") {
    const disciplinas = await conteudoDaSelecao(link.uploadIds);
    if (disciplinas.length === 0) return null;
    return { projeto, titulo: link.nome, disciplinas, arts: [] };
  }

  const disciplinaIds = await disciplinasDoLink(link);
  if (!disciplinaIds) return null;

  const disciplinas = await prisma.disciplina.findMany({
    where: { id: { in: disciplinaIds } },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      disciplinaTextoLegado: true,
      uploads: {
        where: { validado: true, excluidoEm: null },
        orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
        select: { id: true, nomeArquivo: true, tamanho: true, versao: true, ...SELECT_REGRAS },
      },
    },
  });

  const arts = await artsPublicasDoLink(link.projetoId, disciplinaIds);

  return {
    projeto,
    titulo: link.nome,
    arts,
    disciplinas: disciplinas
      .map((d) => ({
        id: d.id,
        nome: d.disciplinaTextoLegado,
        arquivos: recortarParaLinkPublico(d.uploads.map(paraRecorte)).map((u) => ({
          id: u.id,
          nome: u.nomeArquivo,
          tamanho: u.tamanho,
          ehPdf: ehPdf(u.nomeArquivo),
          versao: u.versao,
        })),
      }))
      // Disciplina sem nenhum arquivo liberado não aparece (nada a baixar).
      .filter((d) => d.arquivos.length > 0),
  };
}

/**
 * O upload sobrevive ao recorte do seu documento? Reusa o MESMO filtro puro da página:
 * pergunta a lista de irmãos do documento canônico e confere se `id` continua nela.
 *
 * Mais caro que comparar com um `max(numero)`, e de propósito — o recorte tem sutileza
 * (backup B não pode puxar o máximo para cima, apelido de merge agrupa pelo canônico) e
 * duplicá-la aqui é como a página e o download passam a discordar.
 */
async function sobreviveAoRecorte(upload: LinhaRegras): Promise<boolean> {
  if (ehBackupDoModelo(upload)) return false;

  const docId = upload.documento?.substituidoPorId ?? upload.documentoId;
  // Sem documento ou sem revisão não há o que comparar: é arquivo solto, e ele fica.
  if (!docId || !upload.revisao) return true;

  const irmaos = await prisma.upload.findMany({
    where: {
      validado: true,
      excluidoEm: null,
      OR: [{ documentoId: docId }, { documento: { substituidoPorId: docId } }],
    },
    select: { id: true, ...SELECT_REGRAS },
  });
  return recortarParaLinkPublico(irmaos.map(paraRecorte)).some((u) => u.id === upload.id);
}

/**
 * Valida, para as rotas de download, que o `uploadId` está de fato liberado pelo
 * `token`. Retorna o upload servível (caminho/nome/mime) ou `null`.
 */
export async function uploadLiberadoNoLink(token: string, uploadId: string) {
  const link = await prisma.linkPublicoArquivos.findUnique({ where: { token } });
  if (!link || !linkVigente(link)) return null;

  const servivel = { id: true, nomeArquivo: true, caminho: true, mimeType: true } as const;

  if (link.escopo === "selecao") {
    if (!link.uploadIds.includes(uploadId)) return null;
    return prisma.upload.findFirst({
      where: { id: uploadId, excluidoEm: null },
      select: servivel,
    });
  }

  const disciplinaIds = await disciplinasDoLink(link);
  if (!disciplinaIds) return null;

  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, validado: true, excluidoEm: null, disciplinaId: { in: disciplinaIds } },
    select: { ...servivel, ...SELECT_REGRAS },
  });
  if (!upload) return null;
  if (!(await sobreviveAoRecorte(upload))) return null;

  return { id: upload.id, nomeArquivo: upload.nomeArquivo, caminho: upload.caminho, mimeType: upload.mimeType };
}

/**
 * Valida, para a rota pública de download, que `id` (de uma ART **ou** de uma versão de ART)
 * está liberado pelo `token`: link vigente + ART do projeto do link + disciplina alcançada
 * (ou ART sem disciplina). Retorna caminho/nome do PDF, ou `null`.
 *
 * Link de seleção não expõe ART: o conteúdo dele é só o que foi escolhido a dedo.
 */
export async function artLiberadaNoLink(token: string, id: string) {
  const link = await prisma.linkPublicoArquivos.findUnique({ where: { token } });
  if (!link || !linkVigente(link) || link.escopo === "selecao") return null;

  const disciplinaIds = await disciplinasDoLink(link);
  if (!disciplinaIds) return null;

  const escopo = {
    projetoId: link.projetoId,
    OR: [{ disciplinaId: null }, { disciplinaId: { in: disciplinaIds } }],
  };

  const art = await prisma.art.findFirst({
    where: { id, arquivoPath: { not: null }, ...escopo },
    select: { arquivoPath: true, arquivoNome: true, tipo: true, numero: true },
  });
  if (art?.arquivoPath) {
    return { caminho: art.arquivoPath, nome: art.arquivoNome ?? `${art.tipo}-${art.numero}.pdf` };
  }

  const versao = await prisma.artVersao.findFirst({
    where: { id, arquivoPath: { not: null }, art: escopo },
    select: { arquivoPath: true, arquivoNome: true, numeroArt: true, art: { select: { tipo: true } } },
  });
  if (versao?.arquivoPath) {
    return { caminho: versao.arquivoPath, nome: versao.arquivoNome ?? `${versao.art.tipo}-${versao.numeroArt}.pdf` };
  }
  return null;
}

/**
 * Lista todos os uploads servíveis do link (para o .zip). `disciplinaId` opcional
 * restringe a uma disciplina (que ainda precisa estar no alcance do link).
 */
export async function uploadsDoLinkParaZip(token: string, disciplinaId?: string) {
  const link = await prisma.linkPublicoArquivos.findUnique({
    where: { token },
    include: { projeto: { select: { codigo: true } } },
  });
  if (!link || !linkVigente(link)) return null;

  if (link.escopo === "selecao") {
    if (link.uploadIds.length === 0) return null;
    const uploads = await prisma.upload.findMany({
      where: {
        id: { in: link.uploadIds },
        excluidoEm: null,
        ...(disciplinaId ? { disciplinaId } : {}),
      },
      orderBy: [{ disciplina: { ordem: "asc" } }, { nomeArquivo: "asc" }],
      select: {
        caminho: true,
        nomeArquivo: true,
        disciplina: { select: { disciplinaTextoLegado: true } },
      },
    });
    if (uploads.length === 0) return null;
    return {
      codigo: link.projeto.codigo,
      entradas: uploads.map((u) => ({
        caminho: u.caminho,
        nome: `${u.disciplina.disciplinaTextoLegado}/${u.nomeArquivo}`,
      })),
    };
  }

  const alcance = await disciplinasDoLink(link);
  if (!alcance) return null;
  const alvo = disciplinaId ? (alcance.includes(disciplinaId) ? [disciplinaId] : []) : alcance;
  if (alvo.length === 0) return null;

  const disciplinas = await prisma.disciplina.findMany({
    where: { id: { in: alvo } },
    orderBy: { ordem: "asc" },
    select: {
      disciplinaTextoLegado: true,
      uploads: {
        where: { validado: true, excluidoEm: null },
        orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
        select: { id: true, caminho: true, nomeArquivo: true, ...SELECT_REGRAS },
      },
    },
  });

  const entradas = disciplinas.flatMap((d) =>
    recortarParaLinkPublico(d.uploads.map(paraRecorte)).map((u) => ({
      caminho: u.caminho,
      nome: `${d.disciplinaTextoLegado}/${u.nomeArquivo}`,
    })),
  );
  if (entradas.length === 0) return null;
  return { codigo: link.projeto.codigo, entradas };
}
