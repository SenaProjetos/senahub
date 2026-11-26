import "server-only";

import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { filtrarPorCategoria } from "@/modules/usuarios/preferencias/queries";
import { whereAudiencia, wherePermissao } from "@/lib/audiencias";
import type { Dia } from "@/lib/calendario-trabalho";
import { diaLocal } from "@/modules/ponto/engine";
import { planoDoProjeto } from "./agenda";
import { cargaDaEquipe } from "./recursos-queries";
import { semanasAteOFim } from "./conflitos-recursos";
import { destinatariosDaConclusao } from "./conclusao-aviso";
import {
  conflitosNovos,
  diasDoConflito,
  paraTela,
  textoDoAvisoDeCascata,
  type AvisoCascata,
  type ConflitoNovo,
} from "./cascata";
import type { SobrecargaDia } from "./recursos";

/**
 * Lado com I/O do aviso em cascata (`cascata.ts`). Quem chama tira uma FOTO da carga antes de gravar a data real ou a Data
 * de Status e outra depois; `avisarCascata` compara, avisa a coordenação dos projetos aprovados afetados e devolve o que a
 * tela de quem gravou mostra. Só informa: nada aqui muda data (D18).
 *
 * Nunca derruba a gravação: as funções públicas engolem o erro (log) e devolvem `null` — a data já foi gravada, e o aviso
 * é um extra.
 */

export type FotoDaCarga = {
  projetoId: string;
  hoje: Dia;
  /** Só os dias acima da jornada em que este projeto põe hora em alguém. */
  sobrecargas: SobrecargaDia[];
  nomes: Map<string, string>;
  linhas: Record<string, { nome: string }>;
  projetos: Record<string, { codigo: string; nome: string }>;
};

async function fotografar(projetoId: string, hoje: Dia): Promise<FotoDaCarga> {
  const vazia: FotoDaCarga = { projetoId, hoje, sobrecargas: [], nomes: new Map(), linhas: {}, projetos: {} };
  // A conta da equipe inteira é cara: sem ninguém com hora aqui, não há conflito para comparar.
  const comHora = await prisma.eapAtribuicao.count({
    where: { tarefa: { projetoId }, userId: { not: null }, horasPrevistas: { gt: 0 } },
  });
  if (comHora === 0) return vazia;
  const plano = await planoDoProjeto(projetoId);
  // Até o fim do projeto: depois dele as linhas daqui não põem hora em ninguém.
  const semanas = plano ? semanasAteOFim(hoje, plano.resultado.fimProjeto) : 0;
  if (semanas === 0) return vazia;
  const carga = await cargaDaEquipe({ semanas, hoje, incluirDigitada: false, diario: { desde: hoje, comRascunhos: true } });
  return {
    projetoId,
    hoje,
    sobrecargas: carga.sobrecargasDiarias.filter((s) => s.parcelas.some((p) => p.projetoId === projetoId && p.horas > 0)),
    nomes: new Map(carga.pessoas.map((p) => [p.userId, p.nome])),
    linhas: carga.rotulos.linhas,
    projetos: carga.rotulos.projetos,
  };
}

/** A foto de antes, para a Data de Status. `null` = não mudou (ou falhou): nada a comparar. */
export async function fotoAntesDaDataStatus(projetoId: string, dataStatus: Dia): Promise<FotoDaCarga | null> {
  try {
    const c = await prisma.cronogramaProjeto.findUnique({ where: { projetoId }, select: { dataStatus: true } });
    if (c?.dataStatus && c.dataStatus.toISOString().slice(0, 10) === dataStatus) return null;
    return await fotografar(projetoId, diaLocal(new Date()));
  } catch (e) {
    console.error("[cascata] falha na foto antes da Data de Status", projetoId, e);
    return null;
  }
}

/**
 * A foto de antes, para a data real de uma linha. `null` = as datas reais não mudam (só o %, o valor do terceiro — decisão
 * 9: o % não dispara) ou falhou. O 100% sem término grava as datas pelo planejado sem que o pedido mude as datas: não
 * dispara, de propósito — a tarefa concluída sai da carga, não cria conflito.
 */
export async function fotoAntesDaDataReal(
  linhaId: string,
  datas: { inicioReal: Dia | null; fimReal: Dia | null },
): Promise<FotoDaCarga | null> {
  try {
    const l = await prisma.eapTarefa.findUnique({ where: { id: linhaId }, select: { projetoId: true, inicioReal: true, fimReal: true } });
    if (!l) return null;
    const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    if (dia(l.inicioReal) === datas.inicioReal && dia(l.fimReal) === datas.fimReal) return null;
    return await fotografar(l.projetoId, diaLocal(new Date()));
  } catch (e) {
    console.error("[cascata] falha na foto antes da data real", linhaId, e);
    return null;
  }
}

type Enviar = typeof notificarMuitos;

/** Avisa a coordenação de UM projeto afetado. Devolve quantas pessoas receberam (depois do opt-out). */
async function avisarCoordenacao(
  afetadoId: string,
  novos: readonly ConflitoNovo[],
  depois: FotoDaCarga,
  autorId: string,
  enviar: Enviar,
): Promise<number> {
  const [coord, gestores] = await Promise.all([
    // Só coordenador ativo: um coordenador desligado não pode deixar o aviso sem os gestores.
    prisma.projetoMembro.findMany({
      where: { projetoId: afetadoId, papel: { contains: "coord", mode: "insensitive" }, user: { ativo: true } },
      select: { userId: true },
    }),
    prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } }),
  ]);
  // Mesma regra do aviso de atividade concluída: a coordenação; sem coordenador, os gestores. Quem gravou não recebe.
  const candidatos = destinatariosDaConclusao({ coordenadores: coord.map((c) => c.userId), gestores: gestores.map((g) => g.id), autorId });
  // Quem desligou "Conflito de recurso no cronograma" não conta: a tela só diz "foi avisada" se alguém recebeu.
  const permitidos = new Set(await filtrarPorCategoria(candidatos, "conflito_recurso"));
  const ativos = candidatos.filter((id) => permitidos.has(id)).map((id) => ({ id }));
  if (ativos.length === 0) return 0;
  // O nome do projeto onde a data foi registrada só para quem vê a carga da equipe: o escopo de quem recebe pode não incluí-lo.
  const comRecursos = new Set(
    (await prisma.user.findMany({ where: { ...wherePermissao("recursos", "ver"), id: { in: ativos.map((u) => u.id) } }, select: { id: true } })).map(
      (u) => u.id,
    ),
  );

  const diaMes = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const porPessoa = new Map<string, Dia[]>();
  for (const n of novos) porPessoa.set(n.userId, [...new Set([...(porPessoa.get(n.userId) ?? []), ...n.dias])].sort());
  const pessoas = [...porPessoa].map(([userId, dias]) => ({ nome: depois.nomes.get(userId) ?? "Pessoa sem nome", dias: diasDoConflito(dias, diaMes) }));
  const afetado = depois.projetos[afetadoId]?.codigo ?? "outro projeto";
  const origemP = depois.projetos[depois.projetoId];
  const primeiroDia = novos.map((n) => n.dias[0]).sort()[0];
  // A origem na tag: duas gravações em projetos diferentes não se juntam num push só.
  const base = { href: `/planejamento/${afetadoId}`, tag: `conflito-recurso-${afetadoId}-${depois.projetoId}-${primeiroDia}` };

  const com = ativos.filter((u) => comRecursos.has(u.id)).map((u) => u.id);
  const sem = ativos.filter((u) => !comRecursos.has(u.id)).map((u) => u.id);
  if (com.length > 0) {
    const t = textoDoAvisoDeCascata({ afetado, origem: origemP ? `${origemP.codigo} — ${origemP.nome}` : null, pessoas });
    await enviar(com, { ...base, titulo: t.titulo, corpo: t.corpo }, { categoria: "conflito_recurso" });
  }
  if (sem.length > 0) {
    const t = textoDoAvisoDeCascata({ afetado, origem: null, pessoas });
    await enviar(sem, { ...base, titulo: t.titulo, corpo: t.corpo }, { categoria: "conflito_recurso" });
  }
  return ativos.length;
}

/**
 * Compara as fotos, avisa a coordenação de cada projeto APROVADO afetado (decisão D; rascunho afetado não avisa ninguém,
 * decisão 8) e devolve os conflitos novos para a tela de quem gravou. `null` = nada novo (ou falhou).
 */
export async function avisarCascata(p: {
  antes: FotoDaCarga | null;
  origem: AvisoCascata["origem"];
  autorId: string;
  /** `recursos:ver` de quem gravou. Função: só é resolvida aqui dentro, onde uma falha não derruba a gravação. */
  verCargaDaEquipe: () => Promise<boolean>;
  /** Injetável para o smoke rodar sem sino nem push. */
  enviar?: Enviar;
}): Promise<AvisoCascata | null> {
  if (!p.antes) return null;
  const { projetoId, hoje } = p.antes;
  try {
    const depois = await fotografar(projetoId, hoje);
    const cronograma = await prisma.cronogramaProjeto.findUnique({ where: { projetoId }, select: { aprovado: true } });
    const novos = conflitosNovos(p.antes.sobrecargas, depois.sobrecargas, projetoId, cronograma?.aprovado ?? false);
    if (novos.length === 0) return null;

    const avisados = new Set<string>();
    const porAfetado = new Map<string, ConflitoNovo[]>();
    for (const n of novos) if (n.avisarCoordenacao) porAfetado.set(n.outroId, [...(porAfetado.get(n.outroId) ?? []), n]);
    for (const [afetadoId, lista] of porAfetado) {
      if ((await avisarCoordenacao(afetadoId, lista, depois, p.autorId, p.enviar ?? notificarMuitos)) > 0) avisados.add(afetadoId);
    }

    return {
      origem: p.origem,
      conflitos: paraTela(novos, {
        nomes: depois.nomes,
        linhas: depois.linhas,
        projetos: depois.projetos,
        verCargaDaEquipe: await p.verCargaDaEquipe(),
        avisados,
      }),
    };
  } catch (e) {
    console.error("[cascata] falha ao comparar/avisar", projetoId, e);
    return null;
  }
}
