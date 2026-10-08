/**
 * Smoke das listas de entrada e saída (Gestão de Pessoas F4) contra o banco de dev.
 * Cria ciclos numa pessoa real sem lista aberta e APAGA tudo o que criou no fim.
 *
 *   npm run smoke:ciclo-rh
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { abrirCicloNoBanco, cancelarCicloNoBanco, marcarItemNoBanco } from "@/modules/rh/ciclo/service";
import { lembrarItensCicloAtrasados } from "@/modules/rh/ciclo/lembrete";
import {
  MOTIVO_CICLO_ABERTO,
  MOTIVO_CICLO_FECHADO,
  MOTIVO_SAIDA_SEM_DESLIGAMENTO,
  MOTIVO_SEM_PERMISSAO_ITEM,
  prazoDoItem,
} from "@/modules/rh/ciclo/regras";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};
async function recusa(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function main() {
  const inicio = new Date();
  const criados: string[] = [];

  const pessoa = await prisma.user.findFirst({
    where: {
      ativo: true,
      role: { not: "cliente" },
      vinculoAtivo: { is: { dataFim: null } },
      ciclosRh: { none: { status: "em_andamento" } },
    },
    select: { id: true, name: true, vinculoAtivo: { select: { dataInicio: true } } },
  });
  if (!pessoa) throw new Error("Nenhuma pessoa interna com vínculo ativo e sem lista aberta no banco de dev.");
  const outro = await prisma.user.findFirst({ where: { ativo: true, id: { not: pessoa.id } }, select: { id: true } });
  console.log(`Pessoa de teste: ${pessoa.name}`);

  const [entradaModelo, saidaModelo] = await Promise.all([
    prisma.onboardingTemplate.findUnique({ where: { nome: "Entrada — CLT e estágio" }, include: { itens: { orderBy: { ordem: "asc" } } } }),
    prisma.onboardingTemplate.findUnique({ where: { nome: "Saída — CLT e estágio" } }),
  ]);
  if (!entradaModelo || !saidaModelo) throw new Error("Listas-modelo da seed ausentes — rode npm run db:seed.");

  try {
    // 1) Abrir entrada: prazos resolvidos a partir do início do vínculo.
    const { id: cicloId } = await abrirCicloNoBanco({ userId: pessoa.id, tipo: "entrada", templateId: entradaModelo.id });
    criados.push(cicloId);
    const ciclo = await prisma.onboardingProcesso.findUniqueOrThrow({
      where: { id: cicloId },
      include: { itens: { orderBy: { ordem: "asc" } } },
    });
    const ancora = iso(pessoa.vinculoAtivo!.dataInicio)!;
    ok(iso(ciclo.ancora) === ancora, `âncora = início do vínculo (${ancora})`);
    ok(ciclo.itens.length === entradaModelo.itens.length, `${ciclo.itens.length} itens copiados da lista-modelo`);
    ok(
      ciclo.itens.every((it, i) => iso(it.prazoEm) === prazoDoItem(ancora, entradaModelo.itens[i].prazoDias)),
      "prazo de cada item = âncora + prazoDias do modelo",
    );
    ok(
      ciclo.itens.every((it, i) => it.responsavel === entradaModelo.itens[i].responsavel && it.patrimonio === entradaModelo.itens[i].patrimonio),
      "responsável e marca de equipamentos copiados",
    );

    // 2) Um em andamento por tipo: pela regra e pelo índice parcial.
    ok((await recusa(() => abrirCicloNoBanco({ userId: pessoa.id, tipo: "entrada", templateId: entradaModelo.id }))) === MOTIVO_CICLO_ABERTO.entrada,
      "segunda lista de entrada aberta é recusada");
    const p2002 = await recusa(() => prisma.onboardingProcesso.create({ data: { userId: pessoa.id, tipo: "entrada" } }));
    ok(!!p2002 && /unique|Unique/.test(p2002), "índice parcial recusa um segundo ciclo em andamento direto no banco");

    // 3) Saída sem desligamento agendado.
    ok((await recusa(() => abrirCicloNoBanco({ userId: pessoa.id, tipo: "saida", templateId: saidaModelo.id }))) === MOTIVO_SAIDA_SEM_DESLIGAMENTO,
      "lista de saída sem último dia do vínculo é recusada");
    ok((await recusa(() => abrirCicloNoBanco({ userId: pessoa.id, tipo: "saida", templateId: entradaModelo.id }))) === "Escolha uma lista de saída.",
      "lista-modelo do tipo errado é recusada");

    // 4) Quem marca o quê.
    const itemRh = ciclo.itens.find((i) => i.responsavel === "rh")!;
    const itemTi = ciclo.itens.find((i) => i.responsavel === "ti")!;
    const itemPessoa = ciclo.itens.find((i) => i.responsavel === "pessoa")!;
    const ti = { id: outro?.id ?? "ti", ehRh: false, ehTi: true };
    ok((await recusa(() => marcarItemNoBanco({ id: itemRh.id, concluido: true }, ti))) === MOTIVO_SEM_PERMISSAO_ITEM, "TI não marca item do RH");
    ok((await recusa(() => marcarItemNoBanco({ id: itemTi.id, concluido: true, evidencia: "notebook 0123" }, ti))) === null, "TI marca item da TI");
    const marcadoTi = await prisma.onboardingItem.findUniqueOrThrow({ where: { id: itemTi.id } });
    ok(marcadoTi.concluido && marcadoTi.evidencia === "notebook 0123" && marcadoTi.concluidoPorId === ti.id, "item guarda quem marcou e a evidência");
    const propria = { id: pessoa.id, ehRh: false, ehTi: false };
    ok((await recusa(() => marcarItemNoBanco({ id: itemPessoa.id, concluido: true }, propria))) === null, "a pessoa marca o item dela");
    ok((await recusa(() => marcarItemNoBanco({ id: itemRh.id, concluido: true }, propria))) === MOTIVO_SEM_PERMISSAO_ITEM, "a pessoa não marca item do RH");

    // 5) Lembrete: um item vencido avisa uma vez por dia.
    const hoje = inicioDoDiaUtc();
    const anteontem = new Date(hoje.getTime() - 2 * 86_400_000);
    await prisma.onboardingItem.update({ where: { id: itemRh.id }, data: { prazoEm: anteontem, lembradoEm: null } });
    const primeira = await lembrarItensCicloAtrasados(hoje);
    ok(primeira.itens >= 1 && primeira.destinatarios >= 1, `lembrete saiu (${primeira.itens} item(ns), ${primeira.destinatarios} destinatário(s))`);
    const lembrado = await prisma.onboardingItem.findUniqueOrThrow({ where: { id: itemRh.id } });
    ok(iso(lembrado.lembradoEm) === iso(hoje), "item marcado como lembrado hoje");
    const segunda = await lembrarItensCicloAtrasados(hoje);
    ok(segunda.itens === 0, "segunda execução no mesmo dia não avisa de novo");

    // 6) Todos marcados = concluído; desmarcar reabre.
    const rh = { id: outro?.id ?? "rh", ehRh: true, ehTi: false };
    for (const it of ciclo.itens) await marcarItemNoBanco({ id: it.id, concluido: true }, rh);
    ok((await prisma.onboardingProcesso.findUniqueOrThrow({ where: { id: cicloId } })).status === "concluido", "todos os itens marcados → concluído");
    await marcarItemNoBanco({ id: itemRh.id, concluido: false }, rh);
    ok((await prisma.onboardingProcesso.findUniqueOrThrow({ where: { id: cicloId } })).status === "em_andamento", "desmarcar um item reabre o ciclo");

    // 7) Cancelar: itens travam; recontratação abre outro.
    await cancelarCicloNoBanco(cicloId);
    ok((await recusa(() => marcarItemNoBanco({ id: itemRh.id, concluido: true }, rh))) === MOTIVO_CICLO_FECHADO, "ciclo cancelado não aceita marcação");
    ok((await recusa(() => cancelarCicloNoBanco(cicloId))) !== null, "cancelar de novo é recusado");
    const { id: novo } = await abrirCicloNoBanco({ userId: pessoa.id, tipo: "entrada", templateId: entradaModelo.id });
    criados.push(novo);
    const historico = await prisma.onboardingProcesso.count({ where: { userId: pessoa.id, tipo: "entrada" } });
    ok(historico >= 2, "nova lista de entrada abre com a anterior preservada no histórico");
  } finally {
    await prisma.onboardingProcesso.deleteMany({ where: { id: { in: criados } } });
    await prisma.notificacao.deleteMany({ where: { createdAt: { gte: inicio }, titulo: { contains: "entrada/saída atrasado" } } });
    console.log(`(limpeza: ${criados.length} ciclo(s) de teste e os avisos de teste apagados)`);
  }

  console.log(falhas === 0 ? "\nSMOKE OK" : `\nSMOKE FALHOU (${falhas})`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
