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
import { conferirPrevisoes } from "./agenda/conferencia";
import { itensDoResumoDaAgenda } from "./agenda/queries";
import { liberarAvisoPortal as liberar, reservarAvisoPortal as reservar } from "./resumo-reserva";
import { resumirObras } from "./obra/resumo-service";
import {
  CHAVE_CONFIG_RESUMO,
  diasParaAvaliar,
  fimDoDiaSp,
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
  /** Obras com conta de obra avaliadas (resumo de obra, spec 2026-11-25). */
  obras: number;
};

/** Categoria da preferência do cliente (`notif_portal_resumo`): só desliga o E-MAIL — o sino é dentro do portal. */
export const CATEGORIA_RESUMO = "portal_resumo";

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

const soDosDias = <T>(porDia: ReadonlyMap<string, T>, dias: readonly string[]) => new Map([...porDia].filter(([d]) => dias.includes(d)));

/** Opção do cliente em Meus projetos: grava SÓ `notif_portal_resumo` (as outras preferências ficam como estão). */
export async function definirResumoPorEmail(userId: string, quer: boolean): Promise<void> {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { dados: true } });
  const dados = { ...((pref?.dados as Record<string, unknown> | null) ?? {}), notif_portal_resumo: quer };
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, dados: dados as Prisma.InputJsonObject },
    update: { dados: dados as Prisma.InputJsonObject },
  });
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

/**
 * Uma rodada do resumo. `somenteProjetos` restringe aos projetos dados (smoke — não toca nos dados de verdade).
 * `enviar = null` = sem SMTP: só sinos.
 */
export async function rodarResumoDiario(o: {
  hoje?: string;
  enviar: EnviarEmailResumo | null;
  /** E-mail do resumo de OBRA (template próprio). Ausente/null = só o sino para as contas de obra. */
  enviarObra?: EnviarEmailResumo | null;
  notificar: NotificarSino;
  somenteProjetos?: string[];
}): Promise<ResultadoResumo> {
  const hoje = o.hoje ?? diaDeSaoPaulo();
  const ontem = somarDiasIso(hoje, -1);
  const r: ResultadoResumo = { dias: [], projetos: 0, emails: 0, sinos: 0, duplicados: 0, semEmail: 0, optOut: 0, falhas: 0, obras: 0 };

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
    // Um projeto com problema não pode travar os outros todo dia: conta como falha, fica no log e a rodada segue.
    try {
      await resumirProjeto(p, r, o, app, ontem);
    } catch (e) {
      r.falhas += 1;
      console.error(`[portal] resumo diário: projeto ${p.codigo} falhou:`, e);
    }
  }

  // Contas de obra: outro resumo (liberadas, substituídas, retiradas), nos mesmos dias. Elas não têm cliente, então nunca
  // entram no resumo do cliente acima. Uma falha aqui não derruba a rodada.
  await resumirObras(r, { enviar: o.enviarObra ?? null, notificar: o.notificar, somenteProjetos: o.somenteProjetos }, app).catch((e: unknown) => {
    r.falhas += 1;
    console.error("[portal] resumo de obra falhou:", e);
  });

  // Só no fim: rodada que cai no meio é refeita, e as reservas impedem o duplicado. Relê a configuração e mexe só
  // em `ultimoDia`: quem desligou durante a rodada não é desfeito.
  await salvarConfigResumo({ ...(await getConfigResumo()), ultimoDia: ontem });
  return r;
}

type ProjetoDoResumo = {
  id: string;
  codigo: string;
  nome: string;
  cliente: { usuarios: { id: string; name: string; email: string | null; createdAt: Date }[] } | null;
};

async function resumirProjeto(
  p: ProjetoDoResumo,
  r: ResultadoResumo,
  o: { enviar: EnviarEmailResumo | null; notificar: NotificarSino },
  app: string,
  ontem: string,
): Promise<void> {
  // A agenda (marcos e reuniões) entra na mesma lista por dia. Uma falha dela não derruba o resumo do andamento.
  await conferirPrevisoes(p.id, ontem).catch((e: unknown) => console.error("[portal] agenda: conferência da previsão falhou:", e));
  const { linha: linhaDoAndamento } = await andamentoDoPortal(p);
  const daAgenda = await itensDoResumoDaAgenda(p.id).catch((e: unknown) => {
    console.error("[portal] agenda: itens do resumo falharam:", e);
    return [];
  });
  const linha = [...linhaDoAndamento, ...daAgenda];
  const porDia = itensDosDias(linha, r.dias);
  if (porDia.size === 0) return;

  const contas = p.cliente?.usuarios ?? [];
  const querEmail = new Set(await filtrarPorCategoria(contas.map((c) => c.id), CATEGORIA_RESUMO));
  for (const conta of contas) {
    // Conta criada depois do fim do dia não recebe aquele dia.
    const daConta = new Map([...porDia].filter(([d]) => conta.createdAt.getTime() < fimDoDiaSp(d).getTime()));
    if (daConta.size === 0) continue;
    const dias = [...daConta.keys()];

    const diasSino = await reservar(conta.id, p.id, dias, "sino");
    if (diasSino.length < dias.length) r.duplicados += 1;
    if (diasSino.length > 0) {
      try {
        await o.notificar(conta.id, { titulo: `Novidades em ${p.nome}`, corpo: textoDoSino(soDosDias(daConta, diasSino)), href: `/portal/${p.id}` });
        r.sinos += 1;
      } catch (e) {
        await liberar(conta.id, p.id, diasSino, "sino");
        r.falhas += 1;
        console.error("[portal] resumo diário: sino falhou:", e);
      }
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
    const diasEmail = await reservar(conta.id, p.id, dias, "email");
    if (diasEmail.length < dias.length) r.duplicados += 1;
    if (diasEmail.length === 0) continue;
    try {
      // Nome e projeto vão como estão: o assunto é texto puro (escapar mostraria as barras) e os dois são cadastrados
      // pelo escritório. A lista, que vira Markdown, é escapada em `listaEmMarkdown`.
      const saiu = await o.enviar(conta.email, {
        nome: primeiroNome(conta.name),
        projeto: p.nome,
        periodo: periodoDoResumo(diasEmail),
        lista: listaEmMarkdown(soDosDias(daConta, diasEmail)),
        url: `${app}/portal/${p.id}`,
      });
      if (!saiu) throw new Error("o e-mail não saiu");
      r.emails += 1;
    } catch (e) {
      // Não é reenviado em outro dia (o dia já foi avaliado): fica no log; o sino já foi entregue.
      await liberar(conta.id, p.id, diasEmail, "email");
      r.falhas += 1;
      console.error("[portal] resumo diário: e-mail falhou:", e);
    }
  }
}
