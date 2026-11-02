import "server-only";
import { prisma } from "@/lib/prisma";
import { smtpConfigurado } from "@/lib/mail";
import { CAMPOS } from "@/lib/campos";
import type { ItemEnviado } from "./regras";

const rotuloDaRevisao = (r: {
  numero: number;
  documento: {
    titulo: string | null;
    nomeArquivo: string;
    disciplina: { disciplinaTextoLegado: string; catalogo: { nome: string } | null };
  };
}) => {
  const disciplina = r.documento.disciplina.catalogo?.nome ?? r.documento.disciplina.disciplinaTextoLegado;
  return `R${String(r.numero).padStart(2, "0")} · ${r.documento.titulo ?? r.documento.nomeArquivo} (${disciplina})`;
};

/**
 * As revisões do projeto que HOJE estão "Enviado ao cliente" (controle ativo), com o momento em que o
 * controle foi aplicado. É a lista do e-mail e a fonte que o servidor revalida na hora de enviar.
 */
export async function itensEnviadosAoCliente(projetoId: string): Promise<ItemEnviado[]> {
  const controles = await prisma.controleRevisao.findMany({
    where: { tipo: "enviado_cliente", removidoEm: null, revisao: { documento: { disciplina: { projetoId } } } },
    orderBy: { aplicadoEm: "asc" },
    select: {
      aplicadoEm: true,
      revisao: {
        select: {
          id: true,
          numero: true,
          documento: {
            select: {
              titulo: true,
              nomeArquivo: true,
              disciplina: { select: { disciplinaTextoLegado: true, catalogo: { select: { nome: true } } } },
            },
          },
        },
      },
    },
  });
  return controles.map((c) => ({ revisaoId: c.revisao.id, rotulo: rotuloDaRevisao(c.revisao), enviadoEm: c.aplicadoEm }));
}

export type DadosDoAcompanhamento = Awaited<ReturnType<typeof dadosDoAcompanhamento>>;

/** Tudo que o diálogo do e-mail de acompanhamento precisa: contatos, lista, último envio e histórico. */
export async function dadosDoAcompanhamento(projetoId: string) {
  const [projeto, itens, envios] = await Promise.all([
    prisma.projeto.findUnique({
      where: { id: projetoId },
      select: {
        cliente: {
          select: {
            nome: true,
            // `optOut` fica fora aqui — a regra de quem pode receber contato é do cadastro do contato.
            contatos: { where: { optOut: false, email: { not: null } }, orderBy: [{ principal: "desc" }, { nome: "asc" }], select: { id: true, nome: true, email: true } },
          },
        },
      },
    }),
    itensEnviadosAoCliente(projetoId),
    prisma.emailAcompanhamento.findMany({
      where: { projetoId },
      orderBy: { enviadoEm: "desc" },
      take: 10,
      select: { id: true, enviadoEm: true, destinatarios: true, itens: true, enviadoPor: { select: { name: true } } },
    }),
  ]);
  return {
    smtp: smtpConfigurado(),
    cliente: projeto?.cliente?.nome ?? null,
    contatos: (projeto?.cliente?.contatos ?? []).flatMap((c) => {
      const email = CAMPOS.email.normalizar(c.email ?? "");
      return email ? [{ id: c.id, nome: c.nome, email }] : [];
    }),
    itens,
    ultimoEnvioEm: envios[0]?.enviadoEm ?? null,
    historico: envios.map((e) => ({
      id: e.id,
      enviadoEm: e.enviadoEm,
      enviadoPor: e.enviadoPor?.name ?? null,
      destinatarios: e.destinatarios,
      itens: Array.isArray(e.itens) ? e.itens.length : 0,
    })),
  };
}
