import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { derivarEixos } from "@/modules/usuarios/vinculo/mapa";
import { CONTRATACAO_LABELS, SETOR_LABELS } from "@/modules/usuarios/vinculo/labels";
import { cargaDaEquipe } from "@/modules/planejamento/recursos-queries";
import { cargaSemanalPorRecurso } from "@/modules/planejamento/queries";
import { climaResumo } from "@/modules/rh/queries";
import { saldoCorrenteEquipe } from "@/modules/rh/banco/queries";
import { necessidadesDeHabilidade } from "@/modules/rh/habilidades/queries";
import { pendenciasPorResponsavel, ciclosAbertos } from "@/modules/rh/ciclo/queries";
import { proximoUmAUm } from "@/modules/rh/desenvolvimento/regras";
import { climaVisivel, horasAcimaDaEscala, superalocacaoRecorrente, type Sinal } from "./sinais";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const br = (dia: string) => dia.split("-").reverse().join("/");

/**
 * Painel de gestão de pessoas (F6): composição do que já existe — nada é calculado de novo aqui.
 * Nada de salário, conteúdo de 1:1, documento médico ou humor individual: só contagens e sinais
 * explicáveis, cada um com fonte e link.
 */
export async function painelGestao() {
  const hoje = diaDeSaoPaulo();
  const agora = new Date();
  const em60 = new Date(Date.parse(`${hoje}T00:00:00Z`) + 60 * 86_400_000);

  const [pessoas, carga, real, clima, banco, necessidades, pendencias, abertos, ferias, liderancas] = await Promise.all([
    prisma.user.findMany({ where: { ativo: true, tipo: "interno" }, select: { role: true, contratacao: true, setor: true } }),
    cargaDaEquipe({ semanas: 12 }),
    cargaSemanalPorRecurso(4),
    climaResumo(),
    saldoCorrenteEquipe(agora.getFullYear(), agora.getMonth() + 1),
    necessidadesDeHabilidade(),
    pendenciasPorResponsavel(),
    ciclosAbertos(),
    prisma.ferias.findMany({
      where: { status: "aprovado", fim: { gte: new Date(`${hoje}T00:00:00Z`) }, inicio: { lte: em60 } },
      select: { inicio: true, fim: true, user: { select: { name: true } } },
      orderBy: { inicio: "asc" },
    }),
    prisma.liderancaPessoa.findMany({
      where: { fim: null },
      select: { userId: true, liderId: true, inicio: true, cadenciaDias: true, liderado: { select: { name: true } }, lider: { select: { name: true } } },
    }),
  ]);

  // ── Pessoas ──
  const porContratacao = new Map<string, number>();
  const porSetor = new Map<string, number>();
  for (const p of pessoas) {
    const c = p.contratacao ?? derivarEixos(p.role).contratacao;
    const rc = c ? CONTRATACAO_LABELS[c] : "Sem contratação";
    porContratacao.set(rc, (porContratacao.get(rc) ?? 0) + 1);
    const rs = p.setor ? SETOR_LABELS[p.setor] : "Sem setor";
    porSetor.set(rs, (porSetor.get(rs) ?? 0) + 1);
  }

  // ── Capacidade × demanda (próximas 4 semanas, horas) ──
  const semanas4 = carga.semanas.slice(0, 4);
  const capacidadeDemanda = semanas4.map((s) => ({
    semana: s,
    capacidade: Math.round(carga.pessoas.reduce((t, p) => t + (p.capacidade[s] ?? 0), 0)),
    demanda: Math.round(carga.pessoas.reduce((t, p) => t + (p.carga[s] ?? 0), 0)),
  }));

  // ── Lacunas de competência: necessidade sem ninguém no nível (folga fica para /recursos) ──
  const projetos = await prisma.projeto.findMany({
    where: { id: { in: [...new Set(necessidades.necessidades.map((n) => n.projetoId))] } },
    select: { id: true, codigo: true, nome: true, prazoPlanejado: true, prazoContrato: true, situacao: true },
  });
  const projeto = new Map(projetos.map((p) => [p.id, p]));
  const lacunas = necessidades.necessidades
    .filter((n) => projeto.get(n.projetoId)?.situacao === "em_andamento")
    .filter((n) => !Object.values(necessidades.niveisPorHabilidade[n.habilidadeId] ?? {}).some((v) => (v.nivel ?? 0) >= n.nivelMinimo))
    .map((n) => {
      const p = projeto.get(n.projetoId)!;
      return { ...n, projeto: `${p.codigo} · ${p.nome}`, prazo: ymd(p.prazoPlanejado ?? p.prazoContrato) };
    });

  // ── 1:1 vencidos ──
  const umAUm = [];
  for (const l of liderancas) {
    const ultimo = await prisma.encontroUmAUm.findFirst({ where: { userId: l.userId }, orderBy: { data: "desc" }, select: { data: true, proximoEm: true } });
    const prox = proximoUmAUm(ultimo ? { data: ymd(ultimo.data)!, proximoEm: ymd(ultimo.proximoEm) } : null, ymd(l.inicio)!, l.cadenciaDias, hoje);
    if (prox.vencido) umAUm.push({ userId: l.userId, liderado: l.liderado.name, lider: l.lider.name, diasAtraso: prox.diasAtraso });
  }

  // ── Sinais ──
  const superalocados = superalocacaoRecorrente(
    carga.pessoas.map((p) => ({ userId: p.userId, nome: p.nome, carga: p.carga, capacidade: p.capacidade })),
    carga.semanas,
  );
  const acimaEscala = horasAcimaDaEscala(real.linhas, real.semanas);
  const lacunaMarco = lacunas.filter((l) => l.prazo && l.prazo >= hoje && l.prazo <= ymd(new Date(Date.parse(`${hoje}T00:00:00Z`) + 30 * 86_400_000))!);
  const parados = abertos.filter((c) => c.itens.some((i) => i.atrasado));

  const sinais: Sinal[] = [
    ...superalocados.map((s) => ({
      tipo: "superalocacao" as const,
      titulo: `${s.nome}: carga acima da capacidade ${s.semanas} semanas seguidas`,
      fonte: "Carga planejada (horas das linhas dos cronogramas aprovados e alocação digitada)",
      periodo: `${s.de} a ${s.ate}`,
      acao: { rotulo: "Ver em Recursos", href: "/recursos" },
    })),
    ...acimaEscala.map((s) => ({
      tipo: "horas_acima" as const,
      titulo: `${s.nome}: horas acima da escala em ${s.semanas} das últimas 4 semanas (+${String(s.excessoHoras).replace(".", ",")} h)`,
      fonte: "Ponto (sessões de trabalho) contra a capacidade da escala",
      periodo: "últimas 4 semanas",
      acao: { rotulo: "Ver carga real", href: "/recursos" },
    })),
    ...lacunaMarco.map((l) => ({
      tipo: "lacuna_marco" as const,
      titulo: `${l.projeto}: ninguém com ${l.habilidade} no nível ${l.nivelMinimo}`,
      fonte: "Necessidades de competência do projeto × níveis das pessoas",
      periodo: `prazo ${br(l.prazo!)}`,
      acao: { rotulo: "Cobrir necessidade", href: "/recursos" },
    })),
    ...umAUm.map((u) => ({
      tipo: "um_a_um" as const,
      titulo: `1:1 de ${u.lider} com ${u.liderado} atrasado ${u.diasAtraso} dia(s)`,
      fonte: "Cadência da liderança direta × último encontro registrado",
      periodo: "hoje",
      acao: { rotulo: "Abrir ficha", href: `/rh/pessoas/${u.userId}` },
    })),
    ...parados.map((c) => ({
      tipo: "onboarding_parado" as const,
      titulo: `${c.nome}: lista de ${c.tipo === "entrada" ? "entrada" : "saída"} com ${c.itens.filter((i) => i.atrasado).length} item(ns) atrasado(s)`,
      fonte: "Listas de entrada e saída (prazo de cada item)",
      periodo: c.ancora ? `${c.tipo === "entrada" ? "início" : "último dia"} ${br(c.ancora)}` : "—",
      acao: { rotulo: "Abrir ficha", href: `/rh/pessoas/${c.userId}` },
    })),
  ];

  const ordenarSaldo = [...banco].sort((a, b) => b.saldoMinutos - a.saldoMinutos);
  return {
    pessoas: {
      total: pessoas.length,
      porContratacao: [...porContratacao.entries()].sort((a, b) => b[1] - a[1]),
      porSetor: [...porSetor.entries()].sort((a, b) => b[1] - a[1]),
    },
    capacidadeDemanda,
    lacunas,
    lifecycle: {
      abertos: abertos.length,
      atrasados: Object.values(pendencias).reduce((t, g) => t + g.filter((l) => l.atrasado).length, 0),
      pendentes: Object.values(pendencias).reduce((t, g) => t + g.length, 0),
    },
    ferias: ferias.map((f) => ({ nome: f.user.name, inicio: ymd(f.inicio)!, fim: ymd(f.fim)! })),
    banco: {
      positivos: ordenarSaldo.filter((s) => s.saldoMinutos > 0).slice(0, 5),
      negativos: ordenarSaldo.filter((s) => s.saldoMinutos < 0).reverse().slice(0, 5),
    },
    umAUmVencidos: umAUm.length,
    clima: climaVisivel(clima.total) ? { total: clima.total, media: Math.round(clima.media * 10) / 10, distribuicao: clima.distribuicao } : { total: clima.total, oculto: true as const },
    sinais,
  };
}
export type PainelGestao = Awaited<ReturnType<typeof painelGestao>>;
