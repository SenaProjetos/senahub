import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { encontroVisivel, proximoUmAUm, type Papel } from "./regras";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Liderança ativa da pessoa (ou null). */
export async function liderancaAtiva(userId: string) {
  return prisma.liderancaPessoa.findFirst({
    where: { userId, fim: null },
    select: { id: true, liderId: true, inicio: true, cadenciaDias: true, lider: { select: { name: true } } },
  });
}

/**
 * Desenvolvimento da pessoa, já recortado pelo papel de quem olha: a pessoa só recebe o 1:1
 * compartilhado (o resto nem sai do servidor), e o histórico de feedbacks antigos só vai ao RH.
 */
export async function desenvolvimentoDaPessoa(userId: string, papel: Papel) {
  const hoje = diaDeSaoPaulo();
  const [lideranca, objetivos, encontros, historico, liderancasAnteriores] = await Promise.all([
    liderancaAtiva(userId),
    prisma.objetivoDesenvolvimento.findMany({
      where: { userId },
      select: { id: true, titulo: true, resultadoEsperado: true, alvo: true, status: true, habilidadeId: true, habilidade: { select: { nome: true } }, criadoEm: true, concluidoEm: true },
      orderBy: [{ status: "asc" }, { alvo: "asc" }, { criadoEm: "desc" }],
    }),
    prisma.encontroUmAUm.findMany({
      where: { userId, ...(papel === "self" ? { visibilidade: "compartilhado" as const } : {}) },
      select: { id: true, liderId: true, data: true, pauta: true, decisoes: true, acoes: true, proximoEm: true, visibilidade: true },
      orderBy: { data: "desc" },
    }),
    papel === "rh"
      ? prisma.feedbackRH.findMany({ where: { userId }, select: { id: true, tipo: true, conteudo: true, createdAt: true, autorId: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    papel === "rh"
      ? prisma.liderancaPessoa.findMany({
          where: { userId, fim: { not: null } },
          select: { id: true, inicio: true, fim: true, lider: { select: { name: true } } },
          orderBy: { inicio: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const ultimo = await prisma.encontroUmAUm.findFirst({ where: { userId }, orderBy: { data: "desc" }, select: { data: true, proximoEm: true } });
  const nomes = await prisma.user.findMany({
    where: { id: { in: [...new Set([...encontros.map((e) => e.liderId), ...historico.map((h) => h.autorId)])] } },
    select: { id: true, name: true },
  });
  const nome = new Map(nomes.map((n) => [n.id, n.name]));
  return {
    lideranca: lideranca
      ? {
          liderId: lideranca.liderId,
          lider: lideranca.lider.name,
          inicio: ymd(lideranca.inicio)!,
          cadenciaDias: lideranca.cadenciaDias,
          proximo: proximoUmAUm(ultimo ? { data: ymd(ultimo.data)!, proximoEm: ymd(ultimo.proximoEm) } : null, ymd(lideranca.inicio)!, lideranca.cadenciaDias, hoje),
        }
      : null,
    objetivos: objetivos.map((o) => ({
      id: o.id,
      titulo: o.titulo,
      resultadoEsperado: o.resultadoEsperado,
      alvo: ymd(o.alvo),
      status: o.status,
      habilidadeId: o.habilidadeId,
      habilidade: o.habilidade?.nome ?? null,
      concluidoEm: o.concluidoEm?.toISOString() ?? null,
    })),
    encontros: encontros
      .filter((e) => encontroVisivel(e, papel))
      .map((e) => ({
        id: e.id,
        lider: nome.get(e.liderId) ?? "—",
        data: ymd(e.data)!,
        pauta: e.pauta,
        decisoes: e.decisoes,
        acoes: e.acoes,
        proximoEm: ymd(e.proximoEm),
        visibilidade: e.visibilidade,
      })),
    historico: historico.map((h) => ({ id: h.id, tipo: h.tipo, conteudo: h.conteudo, em: h.createdAt.toISOString(), autor: nome.get(h.autorId) ?? "—" })),
    liderancasAnteriores: liderancasAnteriores.map((l) => ({ id: l.id, lider: l.lider.name, inicio: ymd(l.inicio)!, fim: ymd(l.fim)! })),
  };
}
export type DesenvolvimentoDaPessoa = Awaited<ReturnType<typeof desenvolvimentoDaPessoa>>;

/** "Minha equipe": liderados ativos com o próximo 1:1 e quantos objetivos abertos. */
export async function minhaEquipe(liderId: string) {
  const hoje = diaDeSaoPaulo();
  const liderancas = await prisma.liderancaPessoa.findMany({
    where: { liderId, fim: null },
    select: { userId: true, inicio: true, cadenciaDias: true, liderado: { select: { name: true, image: true } } },
    orderBy: { liderado: { name: "asc" } },
  });
  const linhas = [];
  for (const l of liderancas) {
    const [ultimo, abertos] = await Promise.all([
      prisma.encontroUmAUm.findFirst({ where: { userId: l.userId }, orderBy: { data: "desc" }, select: { data: true, proximoEm: true } }),
      prisma.objetivoDesenvolvimento.count({ where: { userId: l.userId, status: "aberto" } }),
    ]);
    linhas.push({
      userId: l.userId,
      nome: l.liderado.name,
      image: l.liderado.image,
      objetivosAbertos: abertos,
      ultimo1a1: ymd(ultimo?.data),
      proximo: proximoUmAUm(ultimo ? { data: ymd(ultimo.data)!, proximoEm: ymd(ultimo.proximoEm) } : null, ymd(l.inicio)!, l.cadenciaDias, hoje),
    });
  }
  return linhas;
}
export type LideradoLinha = Awaited<ReturnType<typeof minhaEquipe>>[number];

export async function quantosLidera(userId: string) {
  return prisma.liderancaPessoa.count({ where: { liderId: userId, fim: null } });
}

/** Opções para "definir liderança": qualquer pessoa interna ativa (decisão do dono). */
export async function pessoasParaLiderar(excetoId: string) {
  return prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" }, id: { not: excetoId } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
