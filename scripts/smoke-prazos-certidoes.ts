/**
 * Smoke dos prazos configuráveis das certidões (`modules/certidoes/prazos.ts`) contra o banco de
 * dev: sem configuração vale o de sempre (30 dias; avisos 30/15/7), a configuração gravada muda o
 * badge/card (`contarCertidoesAtencao`) e os dias do job (`alertaCertidoes`), aviso no dia certo
 * (o antigo pegava a certidão do dia seguinte), lista vazia desliga os avisos e valor estragado
 * cai no padrão. Restaura a configuração e APAGA o que criou.
 *
 *   npm run smoke:prazos-certidoes
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { alertaCertidoes } from "@/lib/jobs-handlers";
import { contarCertidoesAtencao, prazosCertidoes } from "@/modules/certidoes/queries";
import { CHAVE_CONFIG_PRAZOS_CERTIDOES, PRAZOS_CERTIDOES_PADRAO } from "@/modules/certidoes/prazos";
import type { Prisma } from "@/generated/prisma/client";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};

const MARCA = "smoke-prazos";
const DIAS_CRIADOS = [0, 1, 10, 12, 30, 31];

async function gravarConfig(valor: Prisma.InputJsonValue | null) {
  if (valor === null) {
    await prisma.configSistema.deleteMany({ where: { chave: CHAVE_CONFIG_PRAZOS_CERTIDOES } });
    return;
  }
  await prisma.configSistema.upsert({
    where: { chave: CHAVE_CONFIG_PRAZOS_CERTIDOES },
    create: { chave: CHAVE_CONFIG_PRAZOS_CERTIDOES, valor },
    update: { valor },
  });
}

/** Dias (dos criados pelo smoke) que receberam notificação desde `desde`. */
async function diasAvisados(desde: Date): Promise<number[]> {
  const ns = await prisma.notificacao.findMany({
    where: { createdAt: { gte: desde }, corpo: { contains: MARCA } },
    select: { corpo: true },
  });
  const dias = ns.map((n) => Number(n.corpo!.split(`${MARCA}-`)[1]));
  return [...new Set(dias)].sort((a, b) => a - b);
}

async function main() {
  const inicio = new Date();
  const original = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_PRAZOS_CERTIDOES } });
  const responsavel = await prisma.user.findFirst({ where: { ativo: true, tipo: "interno" }, select: { id: true } });
  if (!responsavel) throw new Error("Nenhum usuário interno ativo no banco de dev.");

  const hoje = inicioDoDiaUtc();
  const em = (dias: number) => new Date(hoje.getTime() + dias * 86_400_000);
  const certIds: string[] = [];
  let tipoId: string | null = null;

  try {
    // 1. Contagem ANTES de criar, nas duas janelas — o resto do banco de dev entra nas duas.
    await gravarConfig(null);
    ok((await prazosCertidoes()).diasEmBreve === 30, "sem configuração: 'Vence em breve' = 30 dias");
    ok(
      JSON.stringify((await prazosCertidoes()).diasAvisos) === JSON.stringify(PRAZOS_CERTIDOES_PADRAO.diasAvisos),
      "sem configuração: avisos em 30/15/7",
    );
    const antesPadrao = await contarCertidoesAtencao();
    await gravarConfig({ diasEmBreve: 12, diasAvisos: [12, 1, 0] });
    const antes12 = await contarCertidoesAtencao();
    ok(antes12.diasEmBreve === 12, "configuração gravada chega ao badge/card (diasEmBreve = 12)");

    const tipo = await prisma.certidaoTipo.create({ data: { nome: `Tipo ${MARCA} ${Date.now()}` } });
    tipoId = tipo.id;
    for (const d of DIAS_CRIADOS) {
      const c = await prisma.certidao.create({
        data: { tipoId: tipo.id, descricao: `${MARCA}-${d}`, validade: em(d), responsavelId: responsavel.id },
      });
      certIds.push(c.id);
    }

    // 2. Badge/card: com 12 dias entram 0, 1, 10 e 12; com o padrão (30) entram também 30, não 31.
    const depois12 = await contarCertidoesAtencao();
    ok(depois12.venceEmBreve - antes12.venceEmBreve === 4, `janela de 12 dias conta 0/1/10/12 (${depois12.venceEmBreve - antes12.venceEmBreve})`);
    await gravarConfig(null);
    const depoisPadrao = await contarCertidoesAtencao();
    ok(depoisPadrao.venceEmBreve - antesPadrao.venceEmBreve === 5, `janela padrão conta até 30, não 31 (${depoisPadrao.venceEmBreve - antesPadrao.venceEmBreve})`);

    // 3. Job com o padrão: avisa a de 30 dias (e não a de 31 — o antigo `diaAlvo` local pegava a de 31).
    const t1 = new Date();
    await alertaCertidoes();
    const padrao = await diasAvisados(t1);
    ok(JSON.stringify(padrao) === "[30]", `padrão 30/15/7: avisou ${JSON.stringify(padrao)} (esperado [30])`);

    // 4. Job com os dias configurados.
    await gravarConfig({ diasEmBreve: 12, diasAvisos: [12, 1, 0] });
    const t2 = new Date();
    await alertaCertidoes();
    const config = await diasAvisados(t2);
    ok(JSON.stringify(config) === "[0,1,12]", `avisos 12/1/0: avisou ${JSON.stringify(config)} (esperado [0,1,12])`);
    const titulos = await prisma.notificacao.findMany({
      where: { createdAt: { gte: t2 }, corpo: { contains: MARCA } },
      select: { titulo: true, corpo: true },
    });
    ok(
      titulos.some((n) => n.corpo!.endsWith(`${MARCA}-0`) && n.titulo === "Certidão vence hoje") &&
        titulos.some((n) => n.corpo!.endsWith(`${MARCA}-1`) && n.titulo === "Certidão vence amanhã") &&
        titulos.some((n) => n.corpo!.endsWith(`${MARCA}-12`) && n.titulo === "Certidão vence em 12 dias"),
      "títulos: 'vence hoje', 'vence amanhã', 'vence em 12 dias'",
    );

    // 5. Lista vazia desliga os avisos.
    await gravarConfig({ diasEmBreve: 30, diasAvisos: [] });
    const t3 = new Date();
    const n3 = await alertaCertidoes();
    ok(n3 === 0 && (await diasAvisados(t3)).length === 0, "avisos vazios: ninguém é notificado");

    // 6. Valor estragado no banco cai no padrão, campo a campo.
    await gravarConfig({ diasEmBreve: "trinta", diasAvisos: [5, -2, 5] });
    const estragado = await prazosCertidoes();
    ok(
      estragado.diasEmBreve === 30 && JSON.stringify(estragado.diasAvisos) === "[5]",
      `valor estragado: ${JSON.stringify(estragado)} (esperado 30 e [5])`,
    );
  } finally {
    await prisma.certidao.deleteMany({ where: { id: { in: certIds } } });
    if (tipoId) await prisma.certidaoTipo.delete({ where: { id: tipoId } });
    // Inclui avisos de certidões reais do banco de dev que o job tenha disparado durante o smoke.
    await prisma.notificacao.deleteMany({ where: { createdAt: { gte: inicio }, titulo: { startsWith: "Certidão vence" } } });
    await gravarConfig(original ? (original.valor as Prisma.InputJsonValue) : null);
    console.log("(limpeza: certidões, tipo e avisos de teste apagados; configuração restaurada)");
  }
  console.log(falhas === 0 ? "\nSMOKE OK" : `\nSMOKE FALHOU (${falhas})`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
