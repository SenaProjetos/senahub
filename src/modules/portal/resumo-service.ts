import "server-only";

/**
 * I/O do resumo diário do portal (spec docs/superpowers/specs/2026-11-19-portal-resumo-diario-design.md). As regras
 * são do puro `resumo-diario.ts`; aqui ficam a configuração, a leitura (a MESMA `andamentoDoPortal` da página), a
 * RESERVA de cada envio e o envio. `enviar` e `notificar` são injetáveis para o smoke rodar o mesmo código sem SMTP.
 *
 * Ordem que garante "uma vez só": reserva (conta, projeto, dia, canal) → envia → se o e-mail falhar, devolve a
 * reserva do e-mail. Duas rodadas ao mesmo tempo: a chave única decide quem envia (P2002 = outra já tem).
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { filtrarPorCategoria } from "@/modules/usuarios/preferencias/queries";
import { andamentoDoPortal } from "./andamento-queries";
import {
  CHAVE_CONFIG_RESUMO,
  diasParaAvaliar,
  escaparMarkdown,
  itensDosDias,
  listaEmMarkdown,
  normalizarConfigResumo,
  periodoDoResumo,
  somarDiasIso,
  textoDoSino,
  type ConfigResumo,
} from "./resumo-diario";

/** `false` = o e-mail não saiu (o transporte devolve `false` em vez de lançar): a reserva é devolvida. */
export type EnviarEmailResumo = (
  para: string,
  vars: { nome: string; projeto: string; periodo: string; lista: string; url: string },
) => Promise<boolean>;
export type NotificarSino = (userId: string, n: { titulo: string; corpo: string; href: string }) => Promise<void>;
export type ResultadoResumo = {
  dias: string[];
  projetos: number;
  emails: number;
  sinos: number;
  duplicados: number;
  semEmail: number;
  optOut: number;
  falhas: number;
};

/** Categoria da preferência do cliente (`notif_portal_resumo`): só desliga o E-MAIL — o sino é dentro do portal. */
export const CATEGORIA_RESUMO = "portal_resumo";
type Canal = "email" | "sino";

export async function getConfigResumo(): Promise<ConfigResumo> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_RESUMO } });
  return normalizarConfigResumo(c?.valor);
}

export async function salvarConfigResumo(c: ConfigResumo): Promise<void> {
  const valor = { ativo: c.ativo, desde: c.desde, ultimoDia: c.ultimoDia };
  await prisma.configSistema.upsert({
    where: { chave: CHAVE_CONFIG_RESUMO },
    create: { chave: CHAVE_CONFIG_RESUMO, valor },
    update: { valor },
  });
}

const dataDoDia = (d: string) => new Date(`${d}T00:00:00.000Z`);
/** Fim do dia `d` em São Paulo (UTC−3, sem horário de verão): meia-noite do dia seguinte = 03:00Z. */
const fimDoDiaSp = (d: string) => new Date(`${somarDiasIso(d, 1)}T03:00:00.000Z`);

/** Reserva uma linha por dia; qualquer P2002 desfaz as desta chamada e devolve `false` (todas ou nenhuma). */
async function reservar(userId: string, projetoId: string, dias: readonly string[], canal: Canal): Promise<boolean> {
  const feitos: string[] = [];
  for (const d of dias) {
    try {
      await prisma.avisoPortalEnviado.create({ data: { userId, projetoId, dia: dataDoDia(d), canal } });
      feitos.push(d);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        await liberar(userId, projetoId, feitos, canal);
        return false;
      }
      throw e;
    }
  }
  return true;
}

async function liberar(userId: string, projetoId: string, dias: readonly string[], canal: Canal): Promise<void> {
  if (dias.length === 0) return;
  await prisma.avisoPortalEnviado.deleteMany({ where: { userId, projetoId, canal, dia: { in: dias.map(dataDoDia) } } });
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

/**
 * Uma rodada do resumo. `somenteProjetos` restringe aos projetos dados (smoke — não toca nos dados de verdade).
 * `enviar = null` = sem SMTP: só sinos.
 */
export async function rodarResumoDiario(o: {
  hoje?: string;
  enviar: EnviarEmailResumo | null;
  notificar: NotificarSino;
  somenteProjetos?: string[];
}): Promise<ResultadoResumo> {
  const hoje = o.hoje ?? diaDeSaoPaulo();
  const ontem = somarDiasIso(hoje, -1);
  const r: ResultadoResumo = { dias: [], projetos: 0, emails: 0, sinos: 0, duplicados: 0, semEmail: 0, optOut: 0, falhas: 0 };

  let cfg = await getConfigResumo();
  if (!cfg.ativo) return r;
  // Primeira rodada depois de ligado pelo deploy: só o dia de ontem, nunca o histórico.
  if (!cfg.desde) {
    cfg = { ...cfg, desde: ontem };
    await salvarConfigResumo(cfg);
  }
  r.dias = diasParaAvaliar({ hoje, desde: cfg.desde, ultimoDia: cfg.ultimoDia });
  if (r.dias.length === 0) return r;

  const projetos = await prisma.projeto.findMany({
    where: {
      ...(o.somenteProjetos ? { id: { in: o.somenteProjetos } } : {}),
      cliente: { ativo: true, usuarios: { some: { tipo: "externo", ativo: true } } },
    },
    select: {
      id: true,
      codigo: true,
      nome: true,
      cliente: {
        select: {
          usuarios: {
            where: { tipo: "externo", ativo: true },
            select: { id: true, name: true, email: true, createdAt: true },
          },
        },
      },
    },
  });

  const app = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  for (const p of projetos) {
    r.projetos += 1;
    const { linha } = await andamentoDoPortal(p);
    const porDia = itensDosDias(linha, r.dias);
    if (porDia.size === 0) continue;

    const contas = p.cliente?.usuarios ?? [];
    const querEmail = new Set(await filtrarPorCategoria(contas.map((c) => c.id), CATEGORIA_RESUMO));
    for (const conta of contas) {
      // Conta criada depois do fim do dia não recebe aquele dia.
      const daConta = new Map([...porDia].filter(([d]) => conta.createdAt.getTime() < fimDoDiaSp(d).getTime()));
      if (daConta.size === 0) continue;
      const dias = [...daConta.keys()];

      if (await reservar(conta.id, p.id, dias, "sino")) {
        await o.notificar(conta.id, { titulo: `Novidades em ${p.nome}`, corpo: textoDoSino(daConta), href: `/portal/${p.id}` });
        r.sinos += 1;
      } else {
        r.duplicados += 1;
      }

      if (!o.enviar) continue;
      if (!conta.email) {
        r.semEmail += 1;
        continue;
      }
      if (!querEmail.has(conta.id)) {
        r.optOut += 1;
        continue;
      }
      if (!(await reservar(conta.id, p.id, dias, "email"))) {
        r.duplicados += 1;
        continue;
      }
      try {
        const saiu = await o.enviar(conta.email, {
          nome: escaparMarkdown(primeiroNome(conta.name)),
          projeto: escaparMarkdown(p.nome),
          periodo: periodoDoResumo(dias),
          lista: listaEmMarkdown(daConta),
          url: `${app}/portal/${p.id}`,
        });
        if (!saiu) throw new Error("o e-mail não saiu");
        r.emails += 1;
      } catch (e) {
        // Não é reenviado em outro dia (o dia já foi avaliado): fica no log; o sino já foi entregue.
        await liberar(conta.id, p.id, dias, "email");
        r.falhas += 1;
        console.error("[portal] resumo diário: e-mail falhou:", e);
      }
    }
  }

  // Só no fim: rodada que cai no meio é refeita, e as reservas impedem o duplicado.
  await salvarConfigResumo({ ...cfg, ultimoDia: ontem });
  return r;
}
