import "server-only";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { rotuloRevisao } from "@/lib/utils";
import type { SessionUser } from "@/lib/session";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { STATUS_ABERTOS } from "@/modules/projetos/pendencias/helpers";
import { ROTULO_ESTADO } from "@/modules/uploads/ciclo/estados";
import { refUploadDwg } from "@/modules/dwg/desenho-ref";
import type { Alinhamento } from "./transformacao";
import { arquivoVigente, estadoDoAlinhamento, type EstadoAlinhamento, type Formato } from "./regras";

export type ArquivoDaCamada = {
  uploadId: string;
  /** rotuloRevisao (R00, R01…). */
  revisao: string;
  /** Estado do ciclo documental, rótulo de tela; null em arquivo sem revisão. */
  estado: string | null;
};

export type StatusConversaoDwg = "fila" | "processando" | "concluido" | "erro" | "sem_conversao";

export type PinoDaCena = {
  id: string;
  numero: number;
  status: string;
  x: number;
  y: number;
  uploadId: string;
  rascunho: boolean;
  meu: boolean;
};

export type AlinhamentoDaCena = {
  alinhamento: Alinhamento;
  versao: number;
  estado: EstadoAlinhamento;
  revisaoConferida: string | null;
};

export type CamadaDaCena = {
  id: string;
  documentoId: string;
  disciplinaId: string;
  disciplina: string;
  titulo: string;
  formato: Formato;
  base: boolean;
  cor: string;
  opacidade: number;
  visivel: boolean;
  ordem: number;
  pagina: number;
  pdf: ArquivoDaCamada | null;
  dwg: (ArquivoDaCamada & { desenhoId: string; status: StatusConversaoDwg }) | null;
  alinhamentos: Partial<Record<Formato, AlinhamentoDaCena>>;
  pinos: PinoDaCena[];
};

export type CenaSobreposicao = {
  id: string;
  nome: string;
  projetoId: string;
  podeGerir: boolean;
  /** Gerir a sobreposição E o gate de `criarPendencia` (`uploads:validar`): quem não aponta no PDF não aponta aqui. */
  podeApontar: boolean;
  camadas: CamadaDaCena[];
};

const FORMATOS: readonly Formato[] = ["pdf", "dwg"];
const STATUS_CONVERSAO = new Set<string>(["fila", "processando", "concluido", "erro"]);

/** Arquivos atuais do documento (fora da lixeira e não substituídos) — leitura aninhada precisa dos dois filtros. */
const ARQUIVOS_ATUAIS = { excluidoEm: null, substituidoPorId: null } as const;

export async function sobreposicoesDoProjeto(projetoId: string): Promise<{ id: string; nome: string; camadas: number }[]> {
  const linhas = await prisma.sobreposicaoPlanta.findMany({
    where: { projetoId },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, _count: { select: { camadas: true } } },
  });
  return linhas.map((l) => ({ id: l.id, nome: l.nome, camadas: l._count.camadas }));
}

/** Documentos de disciplina do projeto que podem virar camada (têm PDF ou DWG vigente). */
export async function documentosParaCamada(
  projetoId: string,
): Promise<{ documentoId: string; disciplina: string; titulo: string; temPdf: boolean; temDwg: boolean }[]> {
  const docs = await prisma.documentoDisciplina.findMany({
    where: { disciplina: { projetoId } },
    select: {
      id: true,
      titulo: true,
      nomeArquivo: true,
      disciplina: { select: { disciplinaTextoLegado: true, ordem: true } },
      uploads: { where: ARQUIVOS_ATUAIS, select: { id: true, nomeArquivo: true, versao: true, excluidoEm: true } },
    },
  });
  const ordem = (d: (typeof docs)[number]) => d.disciplina.ordem;
  return [...docs]
    .sort(
      (a, b) =>
        ordem(a) - ordem(b) ||
        a.disciplina.disciplinaTextoLegado.localeCompare(b.disciplina.disciplinaTextoLegado, "pt-BR") ||
        (a.titulo ?? a.nomeArquivo).localeCompare(b.titulo ?? b.nomeArquivo, "pt-BR"),
    )
    .map((d) => ({
      documentoId: d.id,
      disciplina: d.disciplina.disciplinaTextoLegado,
      titulo: d.titulo ?? d.nomeArquivo,
      temPdf: arquivoVigente(d.uploads, "pdf") !== null,
      temDwg: arquivoVigente(d.uploads, "dwg") !== null,
    }))
    .filter((d) => d.temPdf || d.temDwg);
}

function arquivoDaCamada(u: {
  id: string;
  versao: number;
  revisao: { numero: number; estado: keyof typeof ROTULO_ESTADO } | null;
}): ArquivoDaCamada {
  return {
    uploadId: u.id,
    revisao: rotuloRevisao(u.revisao?.numero ?? u.versao),
    estado: u.revisao ? ROTULO_ESTADO[u.revisao.estado] : null,
  };
}

/** A cena inteira de uma sobreposição; `null` se ela não existe ou o projeto não é visível para o usuário. */
export async function cenaDaSobreposicao(sobreposicaoId: string, user: SessionUser): Promise<CenaSobreposicao | null> {
  const s = await prisma.sobreposicaoPlanta.findUnique({
    where: { id: sobreposicaoId },
    select: {
      id: true,
      nome: true,
      projetoId: true,
      camadas: {
        orderBy: [{ ordem: "asc" }, { id: "asc" }],
        select: {
          id: true,
          documentoId: true,
          formato: true,
          base: true,
          cor: true,
          opacidade: true,
          visivel: true,
          ordem: true,
          pagina: true,
          alinhamentos: {
            select: {
              formato: true,
              tx: true,
              ty: true,
              giro: true,
              escala: true,
              versao: true,
              uploadConferidoId: true,
              uploadConferido: { select: { versao: true, revisao: { select: { numero: true } } } },
            },
          },
          documento: {
            select: {
              titulo: true,
              nomeArquivo: true,
              disciplinaId: true,
              disciplina: { select: { disciplinaTextoLegado: true } },
              uploads: {
                where: ARQUIVOS_ATUAIS,
                select: {
                  id: true,
                  nomeArquivo: true,
                  versao: true,
                  excluidoEm: true,
                  revisao: { select: { numero: true, estado: true } },
                  conversaoDesenho: { select: { status: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!s) return null;
  if (!(await projetoVisivel(user, s.projetoId))) return null;
  const podeGerir = user.tipo === "interno" && (await can(user, "coordenacao", "gerir"));
  const podeApontar = podeGerir && (await can(user, "uploads", "validar"));

  const documentoIds = [...new Set(s.camadas.map((c) => c.documentoId))];
  const pendencias = documentoIds.length
    ? await prisma.pendencia.findMany({
        where: {
          documentoId: { in: documentoIds },
          status: { in: [...STATUS_ABERTOS] },
          excluidoEm: null,
          // Mesma regra do visualizador: rascunho só do próprio autor.
          OR: [{ publicadoEm: { not: null } }, { autorId: user.id }],
        },
        orderBy: { numero: "asc" },
        select: { id: true, numero: true, status: true, x: true, y: true, uploadId: true, pagina: true, documentoId: true, publicadoEm: true, autorId: true },
      })
    : [];

  const camadas: CamadaDaCena[] = s.camadas.map((c) => {
    const pdf = arquivoVigente(c.documento.uploads, "pdf");
    const dwg = arquivoVigente(c.documento.uploads, "dwg");
    const vigentes: Record<Formato, { id: string } | null> = { pdf, dwg };

    const alinhamentos: Partial<Record<Formato, AlinhamentoDaCena>> = {};
    for (const a of c.alinhamentos) {
      const f = a.formato as Formato;
      if (!FORMATOS.includes(f)) continue;
      const vigente = vigentes[f];
      const conferido = a.uploadConferido;
      alinhamentos[f] = {
        alinhamento: { tx: a.tx, ty: a.ty, giro: a.giro, escala: a.escala },
        versao: a.versao,
        // R4: sem arquivo vigente no formato, o alinhamento não está conferido em nada atual.
        estado: vigente ? estadoDoAlinhamento(a, vigente.id) : "revisao_anterior",
        revisaoConferida: conferido ? rotuloRevisao(conferido.revisao?.numero ?? conferido.versao) : null,
      };
    }

    return {
      id: c.id,
      documentoId: c.documentoId,
      disciplinaId: c.documento.disciplinaId,
      disciplina: c.documento.disciplina.disciplinaTextoLegado,
      titulo: c.documento.titulo ?? c.documento.nomeArquivo,
      formato: c.formato === "dwg" ? "dwg" : "pdf",
      base: c.base,
      cor: c.cor,
      opacidade: c.opacidade,
      visivel: c.visivel,
      ordem: c.ordem,
      pagina: c.pagina,
      pdf: pdf ? arquivoDaCamada(pdf) : null,
      dwg: dwg
        ? {
            ...arquivoDaCamada(dwg),
            desenhoId: refUploadDwg(dwg.id),
            status: (dwg.conversaoDesenho && STATUS_CONVERSAO.has(dwg.conversaoDesenho.status)
              ? dwg.conversaoDesenho.status
              : "sem_conversao") as StatusConversaoDwg,
          }
        : null,
      alinhamentos,
      pinos: pendencias
        .filter((p) => p.documentoId === c.documentoId && p.pagina === c.pagina)
        .map((p) => ({
          id: p.id,
          numero: p.numero,
          status: p.status,
          x: p.x,
          y: p.y,
          uploadId: p.uploadId,
          rascunho: p.publicadoEm === null,
          meu: p.autorId === user.id,
        })),
    };
  });

  return { id: s.id, nome: s.nome, projetoId: s.projetoId, podeGerir, podeApontar, camadas };
}
