import "server-only";
import { prisma } from "@/lib/prisma";
import { smtpConfigurado } from "@/lib/mail";
import { CAMPOS } from "@/lib/campos";
import { separarItens, type ItemEnviado } from "./regras";

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
  const [projeto, itens, envios, todosOsEnvios] = await Promise.all([
    prisma.projeto.findUnique({
      where: { id: projetoId },
      select: {
        cliente: {
          select: {
            nome: true,
            // `optOut` fica fora aqui — a regra de quem pode receber contato é do cadastro do contato.
            // Leitura aninhada não passa pelo filtro de exclusão: contato excluído (ou que saiu da empresa) fica fora à mão.
            contatos: { where: { optOut: false, email: { not: null }, excluidoEm: null, statusRelacionamento: { not: "SAIU_DA_EMPRESA" } }, orderBy: [{ principal: "desc" }, { nome: "asc" }], select: { id: true, nome: true, email: true } },
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
    prisma.emailAcompanhamento.findMany({ where: { projetoId }, select: { itens: true } }),
  ]);
  // Revisões que algum e-mail já listou (o histórico mostra só os 10 últimos; isto olha todos).
  const jaAvisadas = new Set<string>();
  for (const e of todosOsEnvios) {
    if (!Array.isArray(e.itens)) continue;
    for (const i of e.itens) {
      const id = (i as { revisaoId?: unknown } | null)?.revisaoId;
      if (typeof id === "string") jaAvisadas.add(id);
    }
  }
  return {
    smtp: smtpConfigurado(),
    cliente: projeto?.cliente?.nome ?? null,
    contatos: (projeto?.cliente?.contatos ?? []).flatMap((c) => {
      // E-mail antigo inválido não vira opção: a action o recusaria e travaria o envio inteiro sem dizer qual é.
      const email = CAMPOS.email.normalizar(c.email ?? "");
      return email && CAMPOS.email.validar(email) ? [{ id: c.id, nome: c.nome, email }] : [];
    }),
    itens,
    jaAvisadas,
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

/** O que o diálogo recebe: datas como texto (vai do servidor ao cliente) e cada item já marcado como novo ou anterior. */
export type AcompanhamentoParaTela = {
  smtp: boolean;
  cliente: string | null;
  contatos: { id: string; nome: string; email: string }[];
  itens: { revisaoId: string; rotulo: string; novo: boolean }[];
  historico: { id: string; enviadoEm: string; enviadoPor: string | null; destinatarios: string[]; itens: number }[];
};

export async function acompanhamentoParaTela(projetoId: string): Promise<AcompanhamentoParaTela> {
  const d = await dadosDoAcompanhamento(projetoId);
  const { novos } = separarItens(d.itens, d.jaAvisadas);
  const ehNovo = new Set(novos.map((i) => i.revisaoId));
  return {
    smtp: d.smtp,
    cliente: d.cliente,
    contatos: d.contatos,
    // Os novos primeiro: é o que a pessoa quer mandar.
    itens: [...d.itens]
      .sort((a, b) => Number(ehNovo.has(b.revisaoId)) - Number(ehNovo.has(a.revisaoId)))
      .map((i) => ({ revisaoId: i.revisaoId, rotulo: i.rotulo, novo: ehNovo.has(i.revisaoId) })),
    historico: d.historico.map((h) => ({ ...h, enviadoEm: h.enviadoEm.toISOString() })),
  };
}
