/**
 * F7.3/F7.4 — prova o motor real e a deduplicação no PostgreSQL.
 *
 * Cria um follow-up vencido, carrega-o pelo contexto real do job e executa o tick 2× no mesmo
 * dia + 1× no dia seguinte. Push fica desligado; sino e dedup percorrem o caminho de produção.
 *
 * Uso: npm run smoke:crm-automacoes
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  carregarContextoAutomacoesComerciais,
  executarAutomacoesComerciais,
} from "../src/modules/comercial/automacoes";

const TAG = `SMKAUTO_${randomBytes(4).toString("hex")}`;

async function main() {
  let ok = true;
  const check = (nome: string, condicao: boolean, detalhe = "") => {
    console.log(`${condicao ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!condicao) ok = false;
  };

  let compromissoId: string | null = null;
  let leadId: string | null = null;
  let clienteId: string | null = null;
  let prefixoChave = "";
  let responsavelId: string | null = null;
  let preferenciaAntes: unknown = undefined;

  try {
    const [responsavel, etapa] = await Promise.all([
      prisma.user.findFirst({
        where: { ativo: true, role: { not: "cliente" } },
        select: { id: true },
      }),
      prisma.funilEtapa.findFirst({ where: { ativo: true }, select: { id: true } }),
    ]);
    if (!responsavel || !etapa) throw new Error("Dev sem usuário interno ou etapa do funil; rode db:seed.");
    responsavelId = responsavel.id;
    const preferencia = await prisma.userPreference.findUnique({ where: { userId: responsavel.id } });
    preferenciaAntes = preferencia?.dados;
    const dadosPreferencia = (preferencia?.dados as Record<string, unknown> | null) ?? {};
    await prisma.userPreference.upsert({
      where: { userId: responsavel.id },
      create: { userId: responsavel.id, dados: { ...dadosPreferencia, notif_comercial: true } },
      update: { dados: { ...dadosPreferencia, notif_comercial: true } },
    });

    const cliente = await prisma.cliente.create({
      data: { nome: `${TAG} Cliente` },
      select: { id: true },
    });
    clienteId = cliente.id;
    const lead = await prisma.lead.create({
      data: {
        nome: `${TAG} Lead`,
        etapaId: etapa.id,
        clienteId: cliente.id,
        responsavelId: responsavel.id,
      },
      select: { id: true },
    });
    leadId = lead.id;
    const compromisso = await prisma.compromisso.create({
      data: {
        titulo: `${TAG} Retornar ao prospect`,
        inicio: new Date("2026-08-20T12:00:00.000Z"),
        criadorId: responsavel.id,
        entidadeTipo: "LEAD",
        entidadeId: lead.id,
        tipo: "FOLLOW_UP",
      },
      select: { id: true },
    });
    compromissoId = compromisso.id;
    prefixoChave = `follow_up_vencido:${compromisso.id}:`;

    const dia1 = new Date("2026-08-23T15:00:00.000Z");
    const contextoCompleto = await carregarContextoAutomacoesComerciais(dia1);
    const followUp = contextoCompleto.followUps.find((item) => item.id === compromisso.id);
    check("o contexto real do job encontra o follow-up", followUp?.entidadeId === lead.id);
    check("o responsável vem do Lead, não de um destinatário global", followUp?.responsavelId === responsavel.id);

    if (!followUp) throw new Error("Fixture não entrou no contexto das automações.");
    const contextoIsolado = {
      ...contextoCompleto,
      followUps: [followUp],
      propostas: [],
      negociacoes: [],
      clientes: [],
    };

    const primeira = await executarAutomacoesComerciais(dia1, {
      contexto: contextoIsolado,
      push: false,
    });
    const segunda = await executarAutomacoesComerciais(dia1, {
      contexto: contextoIsolado,
      push: false,
    });
    check("1º tick cria exatamente um sino", primeira.enviadas === 1 && primeira.duplicadas === 0);
    check("2º tick no mesmo dia não duplica", segunda.enviadas === 0 && segunda.duplicadas === 1);

    const dia2 = new Date("2026-08-24T15:00:00.000Z");
    const terceira = await executarAutomacoesComerciais(dia2, {
      contexto: { ...contextoIsolado, hoje: dia2 },
      push: false,
    });
    check("no dia seguinte o fato pode notificar de novo", terceira.enviadas === 1);

    await prisma.userPreference.update({
      where: { userId: responsavel.id },
      data: { dados: { ...dadosPreferencia, notif_comercial: false } },
    });
    const dia3 = new Date("2026-08-25T15:00:00.000Z");
    const quarta = await executarAutomacoesComerciais(dia3, {
      contexto: { ...contextoIsolado, hoje: dia3 },
      push: false,
    });
    check("opt-out Comercial impede sino e marca de deduplicação", quarta.enviadas === 0 && quarta.optOut === 1);

    const marcas = await prisma.automacaoComercialEnviada.findMany({
      where: { userId: responsavel.id, chave: { startsWith: prefixoChave } },
      include: { notificacao: true },
      orderBy: { chave: "asc" },
    });
    check("há duas marcas, uma por data civil", marcas.length === 2, `${marcas.length}`);
    check(
      "as duas chaves carregam dias diferentes",
      marcas.some((marca) => marca.chave.endsWith("2026-08-23")) &&
        marcas.some((marca) => marca.chave.endsWith("2026-08-24")),
    );
    check(
      "o sino aponta para a ficha real do lead",
      marcas.every((marca) => marca.notificacao?.href === `/comercial/${lead.id}`),
    );
    check(
      "o destinatário é o responsável do lead",
      marcas.every((marca) => marca.notificacao?.userId === responsavel.id),
    );

    if (!ok) throw new Error("Smoke de automações falhou.");
    console.log("\nSmoke F7.3/F7.4 concluído: idempotência diária comprovada.\n");
  } finally {
    if (prefixoChave) {
      const marcas = await prisma.automacaoComercialEnviada.findMany({
        where: { chave: { startsWith: prefixoChave } },
        select: { notificacaoId: true },
      });
      await prisma.automacaoComercialEnviada.deleteMany({
        where: { chave: { startsWith: prefixoChave } },
      });
      const notificacaoIds = marcas.flatMap((marca) => marca.notificacaoId ?? []);
      if (notificacaoIds.length) {
        await prisma.notificacao.deleteMany({ where: { id: { in: notificacaoIds } } });
      }
    }
    if (compromissoId) await prisma.compromisso.deleteMany({ where: { id: compromissoId } });
    if (leadId) await prisma.lead.deleteMany({ where: { id: leadId } });
    if (clienteId) await prisma.cliente.deleteMany({ where: { id: clienteId } });
    if (responsavelId) {
      if (preferenciaAntes === undefined) {
        await prisma.userPreference.deleteMany({ where: { userId: responsavelId } });
      } else {
        await prisma.userPreference.update({
          where: { userId: responsavelId },
          data: { dados: preferenciaAntes as never },
        });
      }
    }
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
