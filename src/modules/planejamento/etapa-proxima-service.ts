import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { montarCalendario } from "./agenda";
import { etapasParaAvisar, textoAvisoEtapa, type LinhaDeEtapa } from "./etapa-proxima";

/**
 * Aviso da etapa que vem (reunião de 08/10/2026, decisão 4) — o lado com I/O de `etapa-proxima.ts`.
 *
 * Só cronograma APROVADO de projeto em andamento: em rascunho as datas ainda mudam e o card nem
 * existe. Destinatários: quem tem atividade na etapa + a coordenação do projeto (`ProjetoMembro`
 * com papel de coordenador). Categoria `etapa_proxima` (opt-out em Preferências).
 *
 * `notificar` entra como parâmetro para o smoke rodar o mesmo código sem disparar notificação.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Linhas até 15 dias corridos à frente bastam: o aviso é de 2 dias úteis, e as anteriores dizem se a etapa já começou. */
const HORIZONTE_DIAS = 15;

export async function avisarEtapasProximas(
  opts: { hoje?: string; notificar?: typeof notificarMuitos } = {},
): Promise<{ avisadas: number; jaAvisadas: number }> {
  const hoje = opts.hoje ?? diaDeSaoPaulo();
  const notificar = opts.notificar ?? notificarMuitos;
  const [a, m, d] = hoje.split("-").map(Number);
  const limite = new Date(Date.UTC(a, m - 1, d + HORIZONTE_DIAS));

  const linhas = await prisma.eapTarefa.findMany({
    where: {
      disciplinaId: { not: null },
      etapaId: { not: null },
      inicioPrevisto: { lte: limite },
      projeto: { situacao: "em_andamento", cronograma: { aprovado: true } },
    },
    select: {
      projetoId: true,
      disciplinaId: true,
      etapaId: true,
      inicioPrevisto: true,
      inicioReal: true,
      progresso: true,
      atribuicoes: { select: { userId: true, papel: true } },
    },
  });
  if (linhas.length === 0) return { avisadas: 0, jaAvisadas: 0 };

  const etapas = await prisma.disciplinaEtapa.findMany({
    where: { disciplinaId: { in: [...new Set(linhas.map((l) => l.disciplinaId!))] } },
    select: {
      id: true,
      disciplinaId: true,
      etapaId: true,
      etapa: { select: { nome: true } },
      disciplina: { select: { disciplinaTextoLegado: true, projeto: { select: { id: true, codigo: true } } } },
    },
  });
  const etapaPorChave = new Map(etapas.map((e) => [`${e.disciplinaId}:${e.etapaId}`, e]));

  const entrada: LinhaDeEtapa[] = [];
  for (const l of linhas) {
    // Linha cuja fase não está cadastrada na disciplina não tem etapa para avisar.
    const e = etapaPorChave.get(`${l.disciplinaId}:${l.etapaId}`);
    if (!e) continue;
    entrada.push({
      disciplinaEtapaId: e.id,
      inicio: iso(l.inicioPrevisto),
      iniciada: l.inicioReal != null || l.progresso > 0,
      pessoas: l.atribuicoes.filter((x) => x.userId != null && x.papel !== "ext").map((x) => x.userId!),
    });
  }

  const ano = Number(hoje.slice(0, 4));
  const cal = await montarCalendario([ano, ano + 1]);
  const aAvisar = etapasParaAvisar(entrada, hoje, cal);
  if (aAvisar.length === 0) return { avisadas: 0, jaAvisadas: 0 };

  const etapaPorId = new Map(etapas.map((e) => [e.id, e]));
  const projetoIds = [...new Set(aAvisar.map((x) => etapaPorId.get(x.disciplinaEtapaId)!.disciplina.projeto.id))];
  const coordenadores = await prisma.projetoMembro.findMany({
    where: { projetoId: { in: projetoIds }, papel: { contains: "coord", mode: "insensitive" } },
    select: { projetoId: true, userId: true },
  });

  let avisadas = 0;
  let jaAvisadas = 0;
  for (const x of aAvisar) {
    const e = etapaPorId.get(x.disciplinaEtapaId)!;
    const projeto = e.disciplina.projeto;
    const destino = [...x.pessoas, ...coordenadores.filter((c) => c.projetoId === projeto.id).map((c) => c.userId)];
    if (destino.length === 0) continue;

    const chave = { disciplinaEtapaId: e.id, inicio: new Date(`${x.inicio}T00:00:00Z`) };
    try {
      await prisma.avisoEtapaEnviado.create({ data: chave });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        jaAvisadas++;
      } else {
        // Um item com problema não derruba os outros do dia: registra e segue (a próxima rodada tenta de novo).
        console.error(`[cronograma] aviso da etapa ${e.id} não reservado:`, err);
      }
      continue;
    }

    const texto = textoAvisoEtapa({
      disciplina: e.disciplina.disciplinaTextoLegado,
      etapa: e.etapa.nome,
      projetoCodigo: formatarCodigo(projeto.codigo),
      inicio: x.inicio,
    });
    try {
      await notificar(
        destino,
        { ...texto, href: `/planejamento/${projeto.id}`, tag: `etapa-proxima-${e.id}-${x.inicio}` },
        { categoria: "etapa_proxima" },
      );
      avisadas++;
    } catch (err) {
      // Devolve a reserva: a próxima rodada tenta de novo. E segue para as outras etapas do dia.
      await prisma.avisoEtapaEnviado.deleteMany({ where: chave });
      console.error(`[cronograma] aviso da etapa ${e.id} falhou ao notificar:`, err);
    }
  }
  return { avisadas, jaAvisadas };
}
