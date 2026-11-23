import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PAPEL_COORDENADOR, podeVerConversa } from "./audiencia";
import { aguardandoResposta, ladoOposto, ROTULO_DECISAO_PORTAL, type LadoMensagem } from "./regras";
import { contaPodeVerConversa, contasDoClienteDoProjeto, fatosDaAudiencia, podeVerConversaDoProjeto } from "./service";
import type { DecisaoDeAtaDTO } from "@/modules/portal/atas/decisoes";
import { decisoesDasAtas } from "@/modules/portal/atas/queries";

/**
 * Leituras da conversa do portal. Cada uma confere a porta do seu lado (conta do portal ou audiência) e devolve null
 * quando a pessoa não vê — a action transforma em "Conversa não encontrada.".
 */

export type MensagemDTO = {
  id: string;
  lado: "cliente" | "equipe";
  autorNome: string;
  texto: string;
  criadaEm: string;
  anexos: { id: string; nome: string; tamanho: number }[];
  decisao: { resumo: string | null; marcadaPor: string; marcadaEm: string } | null;
  minha: boolean;
};

export type ConversaDTO = {
  projetoId: string;
  mensagens: MensagemDTO[];
  temAnteriores: boolean;
  naoLidas: number;
  decisoes: { mensagemId: string; resumo: string | null; trecho: string; mensagemEm: string; marcadaPor: string }[];
  /** Decisões das atas de reunião publicadas (versão vigente, não retirada): juntam-se às da conversa na lista "Decisões". */
  decisoesDeAtas: DecisaoDeAtaDTO[];
};

/**
 * A conversa vista pela equipe leva também `clienteLe`: o projeto tem cliente ativo com pelo menos uma conta externa
 * ativa no portal. Sem isso, a equipe escreve para ninguém — a tela avisa (e ainda deixa enviar).
 */
export type ConversaEquipeDTO = ConversaDTO & { clienteLe: boolean };

/** Mensagens por página (as mais recentes; `antesDe` = id da mais antiga já carregada). */
export const POR_PAGINA = 50;
const TRECHO_MAX = 140;

/** Trecho da mensagem decidida; mensagem só de anexos mostra os nomes deles (ou que tinha anexos). */
function trechoDe(texto: string, nomesDosAnexos: readonly string[] = []): string {
  const t = texto.replace(/\s+/g, " ").trim() || nomesDosAnexos.join(", ") || "(mensagem com anexos)";
  return t.length > TRECHO_MAX ? `${t.slice(0, TRECHO_MAX - 1)}…` : t;
}

export async function conversaParaCliente(projetoId: string, userId: string, antesDe?: string): Promise<ConversaDTO | null> {
  if (!(await contaPodeVerConversa(userId, projetoId))) return null;
  const conversa = await montarConversa(projetoId, userId, "cliente", antesDe);
  return { ...conversa, decisoesDeAtas: await decisoesDasAtas(projetoId) };
}

export async function conversaParaEquipe(
  projetoId: string,
  userId: string,
  antesDe?: string,
): Promise<ConversaEquipeDTO | null> {
  if (!(await podeVerConversaDoProjeto(userId, projetoId))) return null;
  const conversa = await montarConversa(projetoId, userId, "equipe", antesDe);
  const clienteLe = (await contasDoClienteDoProjeto(projetoId)).length > 0;
  return { ...conversa, decisoesDeAtas: await decisoesDasAtas(projetoId), clienteLe };
}

async function montarConversa(projetoId: string, userId: string, meuLado: LadoMensagem, antesDe?: string): Promise<ConversaDTO> {
  const vazia: ConversaDTO = { projetoId, mensagens: [], temAnteriores: false, naoLidas: 0, decisoes: [], decisoesDeAtas: [] };
  const conversa = await prisma.conversaPortal.findUnique({ where: { projetoId }, select: { id: true } });
  if (!conversa) return vazia;

  // Cursor pela mensagem mais antiga já carregada (data + id: duas no mesmo milissegundo não somem entre páginas).
  const cursor = antesDe
    ? await prisma.mensagemPortal.findFirst({ where: { id: antesDe, conversaId: conversa.id }, select: { id: true, criadaEm: true } })
    : null;
  const pagina = await prisma.mensagemPortal.findMany({
    where: {
      conversaId: conversa.id,
      ...(cursor
        ? { OR: [{ criadaEm: { lt: cursor.criadaEm } }, { criadaEm: cursor.criadaEm, id: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ criadaEm: "desc" }, { id: "desc" }],
    take: POR_PAGINA + 1,
    select: { id: true, lado: true, autorId: true, autorNome: true, texto: true, criadaEm: true },
  });
  const temAnteriores = pagina.length > POR_PAGINA;
  const mensagens = pagina.slice(0, POR_PAGINA).reverse();
  const ids = mensagens.map((m) => m.id);

  const anexos = ids.length
    ? await prisma.anexoMensagemPortal.findMany({
        where: { mensagemId: { in: ids } },
        orderBy: { criadoEm: "asc" },
        select: { id: true, mensagemId: true, nome: true, tamanho: true },
      })
    : [];
  const ativas = await prisma.decisaoMensagemPortal.findMany({
    where: { removidaEm: null, mensagem: { conversaId: conversa.id } },
    orderBy: { marcadaEm: "desc" },
    select: {
      mensagemId: true,
      resumo: true,
      marcadaPorId: true,
      marcadaEm: true,
      mensagem: { select: { texto: true, criadaEm: true } },
    },
  });
  // No portal, a marca nunca leva o nome de quem marcou (o nome não é nem lido).
  const nomes =
    meuLado === "equipe" && ativas.length
      ? new Map(
          (
            await prisma.user.findMany({
              where: { id: { in: [...new Set(ativas.map((d) => d.marcadaPorId))] } },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name]),
        )
      : new Map<string, string>();
  const quemMarcou = (id: string) => (meuLado === "cliente" ? ROTULO_DECISAO_PORTAL : (nomes.get(id) ?? "—"));
  const decisaoPorMensagem = new Map(ativas.map((d) => [d.mensagemId, d]));
  // Decisão em mensagem sem texto (só anexos): o trecho é o nome dos anexos dela.
  const semTexto = ativas.filter((d) => d.mensagem.texto.trim() === "").map((d) => d.mensagemId);
  const anexosSemTexto = semTexto.length
    ? await prisma.anexoMensagemPortal.findMany({
        where: { mensagemId: { in: semTexto } },
        orderBy: { criadoEm: "asc" },
        select: { mensagemId: true, nome: true },
      })
    : [];
  const nomesDosAnexos = (mensagemId: string) => anexosSemTexto.filter((a) => a.mensagemId === mensagemId).map((a) => a.nome);

  const leitura = await prisma.leituraConversaPortal.findUnique({
    where: { conversaId_userId: { conversaId: conversa.id, userId } },
    select: { lidaAte: true },
  });
  const naoLidas = await prisma.mensagemPortal.count({
    where: {
      conversaId: conversa.id,
      lado: ladoOposto(meuLado),
      ...(leitura?.lidaAte ? { criadaEm: { gt: leitura.lidaAte } } : {}),
    },
  });

  return {
    projetoId,
    temAnteriores,
    naoLidas,
    // Preenchido por `conversaParaCliente`/`conversaParaEquipe` (a lista das atas não depende da página).
    decisoesDeAtas: [],
    mensagens: mensagens.map((m) => {
      const d = decisaoPorMensagem.get(m.id);
      return {
        id: m.id,
        lado: m.lado,
        autorNome: m.autorNome,
        texto: m.texto,
        criadaEm: m.criadaEm.toISOString(),
        anexos: anexos.filter((a) => a.mensagemId === m.id).map((a) => ({ id: a.id, nome: a.nome, tamanho: a.tamanho })),
        decisao: d ? { resumo: d.resumo, marcadaPor: quemMarcou(d.marcadaPorId), marcadaEm: d.marcadaEm.toISOString() } : null,
        minha: m.autorId === userId,
      };
    }),
    decisoes: ativas.map((d) => ({
      mensagemId: d.mensagemId,
      resumo: d.resumo,
      trecho: trechoDe(d.mensagem.texto, nomesDosAnexos(d.mensagemId)),
      mensagemEm: d.mensagem.criadaEm.toISOString(),
      marcadaPor: quemMarcou(d.marcadaPorId),
    })),
  };
}

/**
 * "Mensagens de clientes": as conversas de todos os projetos de que a pessoa é audiência, aguardando resposta
 * primeiro, depois a mais recente. `soMinhas` = só os projetos em que ela é membro coordenador.
 */
export async function conversasDaEquipe(
  userId: string,
  filtro: { soMinhas: boolean },
): Promise<{ projetoId: string; codigo: string; nome: string; ultimaMensagemEm: string | null; aguardando: boolean; naoLidas: number }[]> {
  const conversas = await prisma.conversaPortal.findMany({
    where: {
      ultimaMensagemEm: { not: null },
      ...(filtro.soMinhas ? { projeto: { membros: { some: { userId, papel: PAPEL_COORDENADOR } } } } : {}),
    },
    select: {
      id: true,
      projetoId: true,
      ultimaMensagemEm: true,
      ultimoLado: true,
      projeto: { select: { codigo: true, nome: true } },
    },
  });
  if (conversas.length === 0) return [];
  const fatos = await fatosDaAudiencia([userId], conversas.map((c) => c.projetoId));
  const visiveis = conversas.filter((c) => {
    const f = fatos(userId, c.projetoId);
    return f !== null && podeVerConversa(f);
  });
  if (visiveis.length === 0) return [];

  const contagem = await prisma.$queryRaw<{ conversaId: string; n: number }[]>`
    SELECT m."conversaId", count(*)::int AS n
    FROM mensagem_portal m
    LEFT JOIN leitura_conversa_portal l ON l."conversaId" = m."conversaId" AND l."userId" = ${userId}
    WHERE m."conversaId" IN (${Prisma.join(visiveis.map((c) => c.id))})
      AND m.lado = 'cliente'
      AND (l."lidaAte" IS NULL OR m."criadaEm" > l."lidaAte")
    GROUP BY m."conversaId"`;
  const naoLidas = new Map(contagem.map((r) => [r.conversaId, Number(r.n)]));

  return visiveis
    .map((c) => ({
      projetoId: c.projetoId,
      codigo: c.projeto.codigo,
      nome: c.projeto.nome,
      ultimaMensagemEm: c.ultimaMensagemEm?.toISOString() ?? null,
      aguardando: aguardandoResposta({ ultimoLado: c.ultimoLado }),
      naoLidas: naoLidas.get(c.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.aguardando !== b.aguardando) return a.aguardando ? -1 : 1;
      return (b.ultimaMensagemEm ?? "").localeCompare(a.ultimaMensagemEm ?? "");
    });
}
