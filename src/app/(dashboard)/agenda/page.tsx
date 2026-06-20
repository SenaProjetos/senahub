import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { INTERNAL_ROLES } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { AgendaView } from "@/components/agenda/agenda-view";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await requireRole(...INTERNAL_ROLES);
  const sp = await searchParams;
  const hoje = new Date();
  const [anoS, mesS] = (sp.m ?? "").split("-");
  const ano = Number(anoS) || hoje.getFullYear();
  const mes = Number(mesS) || hoje.getMonth() + 1;
  // Carrega uma folga de ±7 dias para que as vistas semanais nas bordas do mês
  // (semanas que atravessam a virada de mês) tenham os compromissos vizinhos.
  const iniQuery = new Date(ano, mes - 1, 1 - 7);
  const fimQuery = new Date(ano, mes, 0 + 7, 23, 59, 59);

  const [compromissos, prazosProjeto, prazosDisciplina, internos] = await Promise.all([
    prisma.compromisso.findMany({
      where: {
        inicio: { gte: iniQuery, lte: fimQuery },
        participantes: { some: { userId: user.id } },
      },
      orderBy: { inicio: "asc" },
      include: {
        criador: { select: { name: true } },
        participantes: { include: { user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.projeto.findMany({
      where: { situacao: "em_andamento", prazoFinal: { gte: iniQuery, lte: fimQuery } },
      select: { id: true, codigo: true, nome: true, prazoFinal: true },
    }),
    prisma.disciplina.findMany({
      where: {
        prazo: { gte: iniQuery, lte: fimQuery },
        status: { notIn: ["aprovado"] },
        projeto: { situacao: "em_andamento" },
      },
      select: { id: true, nome: true, prazo: true, projeto: { select: { id: true, codigo: true } } },
    }),
    prisma.user.findMany({
      where: { ativo: true, role: { not: "cliente" }, id: { not: user.id } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AgendaView
      ano={ano}
      mes={mes}
      meuId={user.id}
      internos={internos}
      compromissos={compromissos.map((c) => ({
        id: c.id,
        titulo: c.titulo,
        descricao: c.descricao,
        local: c.local,
        inicio: c.inicio.toISOString(),
        fim: c.fim ? c.fim.toISOString() : null,
        criador: c.criador.name,
        minhaConfirmacao:
          c.participantes.find((p) => p.user.id === user.id)?.confirmado ?? null,
        participantes: c.participantes.map((p) => ({
          nome: p.user.name,
          confirmado: p.confirmado,
        })),
      }))}
      prazos={[
        ...prazosProjeto.map((p) => ({
          data: p.prazoFinal!.toISOString().slice(0, 10),
          rotulo: `${p.codigo} · ${p.nome}`,
          href: `/projetos/${p.id}`,
          tipo: "projeto" as const,
        })),
        ...prazosDisciplina.map((d) => ({
          data: d.prazo!.toISOString().slice(0, 10),
          rotulo: `${d.projeto.codigo} · ${d.nome}`,
          href: `/projetos/${d.projeto.id}`,
          tipo: "disciplina" as const,
        })),
      ]}
    />
  );
}
