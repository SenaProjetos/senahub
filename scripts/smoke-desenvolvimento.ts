/**
 * Smoke de liderança, 1:1 e objetivos (Gestão de Pessoas F3) contra o banco de dev. Cria dados de
 * teste entre duas pessoas reais e APAGA tudo no fim.
 *
 *   npm run smoke:desenvolvimento
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { desenvolvimentoDaPessoa, minhaEquipe } from "@/modules/rh/desenvolvimento/queries";
import { lembrarUmAUmAtrasado } from "@/modules/rh/desenvolvimento/lembrete";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};

async function main() {
  const inicio = new Date();
  const [lider, liderado] = await prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" }, liderancasComoLiderado: { none: { fim: null } } },
    select: { id: true, name: true },
    take: 2,
    orderBy: { name: "asc" },
  });
  if (!lider || !liderado) throw new Error("Preciso de duas pessoas internas sem liderança ativa no banco de dev.");
  console.log(`Líder: ${lider.name} · Liderado: ${liderado.name}`);
  const criadas: string[] = [];

  try {
    const hoje = inicioDoDiaUtc();
    const ha40 = new Date(hoje.getTime() - 40 * 86_400_000);
    const l = await prisma.liderancaPessoa.create({ data: { liderId: lider.id, userId: liderado.id, inicio: ha40, criadoPorId: lider.id } });
    criadas.push(l.id);

    const segunda = await prisma.liderancaPessoa
      .create({ data: { liderId: liderado.id, userId: liderado.id, criadoPorId: lider.id } })
      .then(() => null, (e: Error) => e.message);
    ok(!!segunda, "banco recusa liderar a si mesmo / segunda liderança ativa");
    const outra = await prisma.liderancaPessoa
      .create({ data: { liderId: liderado.id === lider.id ? lider.id : (await prisma.user.findFirst({ where: { id: { notIn: [lider.id, liderado.id] } } }))!.id, userId: liderado.id, criadoPorId: lider.id } })
      .then((x) => { criadas.push(x.id); return null; }, (e: Error) => e.message);
    ok(!!outra && /unique|Unique/.test(outra), "índice parcial: no máximo uma liderança ativa por liderado");

    await prisma.encontroUmAUm.createMany({
      data: [
        { userId: liderado.id, liderId: lider.id, data: ha40, pauta: "conteúdo PRIVADO", visibilidade: "lider_rh", criadoPorId: lider.id },
        { userId: liderado.id, liderId: lider.id, data: new Date(ha40.getTime() + 86_400_000), pauta: "conteúdo compartilhado", visibilidade: "compartilhado", criadoPorId: lider.id },
      ],
    });
    await prisma.objetivoDesenvolvimento.create({ data: { userId: liderado.id, titulo: "Objetivo de teste", criadoPorId: lider.id } });

    const comoSelf = await desenvolvimentoDaPessoa(liderado.id, "self");
    ok(comoSelf.encontros.length === 1 && comoSelf.encontros[0].pauta === "conteúdo compartilhado", "a pessoa recebe só o 1:1 compartilhado");
    ok(!JSON.stringify(comoSelf).includes("PRIVADO"), "o conteúdo privado nem sai do servidor para a pessoa");
    ok(comoSelf.objetivos.some((o) => o.titulo === "Objetivo de teste"), "a pessoa vê os próprios objetivos");
    ok(comoSelf.historico.length === 0, "histórico antigo de feedback não vai para a pessoa");

    const comoLider = await desenvolvimentoDaPessoa(liderado.id, "lider");
    ok(comoLider.encontros.length === 2, "a liderança vê os dois registros");
    ok(comoLider.lideranca?.proximo.vencido === true, "1:1 de 40 dias atrás com cadência de 30 está atrasado");

    const equipe = await minhaEquipe(lider.id);
    ok(equipe.some((p) => p.userId === liderado.id), "o liderado aparece em Minha equipe");

    const primeira = await lembrarUmAUmAtrasado(hoje);
    ok(primeira >= 1, `lembrete de 1:1 atrasado saiu (${primeira})`);
    const aviso = await prisma.notificacao.findFirst({ where: { userId: lider.id, createdAt: { gte: inicio }, titulo: { startsWith: "1:1 atrasado" } } });
    ok(!!aviso && !aviso.corpo?.includes("PRIVADO") && !aviso.corpo?.includes("compartilhado"), "o aviso não carrega conteúdo do 1:1");
    ok((await lembrarUmAUmAtrasado(hoje)) === 0, "segunda execução no mesmo dia não repete");

    await prisma.liderancaPessoa.update({ where: { id: l.id }, data: { fim: hoje } });
    ok((await minhaEquipe(lider.id)).every((p) => p.userId !== liderado.id), "liderança encerrada: some de Minha equipe");
  } finally {
    await prisma.encontroUmAUm.deleteMany({ where: { userId: liderado.id, criadoEm: { gte: inicio } } });
    await prisma.objetivoDesenvolvimento.deleteMany({ where: { userId: liderado.id, criadoEm: { gte: inicio } } });
    await prisma.liderancaPessoa.deleteMany({ where: { id: { in: criadas } } });
    await prisma.notificacao.deleteMany({ where: { createdAt: { gte: inicio }, titulo: { startsWith: "1:1 atrasado" } } });
    console.log("(limpeza: liderança, 1:1, objetivo e avisos de teste apagados)");
  }
  console.log(falhas === 0 ? "\nSMOKE OK" : `\nSMOKE FALHOU (${falhas})`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
