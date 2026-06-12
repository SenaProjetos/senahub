/**
 * Smoke 3e/3f/3g contra o banco de dev: folha CLT (criar → holerite →
 * fechar → lançamento 2.03 confirmado), onboarding (template → processo →
 * progresso), NF de PJ (enviar → aprovar). Idempotente: limpa o que cria.
 *
 * Uso: npm run smoke:onda3efg
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const tag = `SMK3E_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Admin não encontrado (rode o seed).");

  // ── 3e: Folha CLT ────────────────────────────────────────────
  const clt = await prisma.user.create({
    data: { name: `${tag}_clt`, email: `${tag}@t.local`, role: "clt", ativo: true },
  });
  const folha = await prisma.folhaPagamento.create({ data: { ano: 2099, mes: 1 } });

  const holerite = await prisma.holerite.create({
    data: {
      folhaId: folha.id,
      userId: clt.id,
      itens: {
        create: [
          { descricao: "Salário base", tipo: "provento", valor: 3000 },
          { descricao: "INSS", tipo: "desconto", valor: 330 },
        ],
      },
    },
    include: { itens: true },
  });
  const liquido = holerite.itens.reduce(
    (s, it) => s + (it.tipo === "provento" ? Number(it.valor) : -Number(it.valor)),
    0,
  );
  check("líquido do holerite = proventos - descontos (2670)", liquido === 2670);

  // Fechar (núcleo de fecharFolha): lançamento 2.03 confirmado
  const cat = await prisma.categoriaFinanceira.findUnique({ where: { codigo: "2.03" } });
  check("categoria 2.03 (Folha CLT) existe", !!cat);

  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    const lanc = await tx.lancamento.create({
      data: {
        tipo: "despesa",
        descricao: `${tag}_folha_fechada`,
        valor: liquido,
        status: "confirmado",
        data: agora,
        dataConfirmacao: agora,
        categoriaId: cat!.id,
        autorId: admin.id,
      },
    });
    await tx.folhaPagamento.update({
      where: { id: folha.id },
      data: { status: "fechada", fechadaEm: agora, lancamentoId: lanc.id },
    });
  });
  const folhaFechada = await prisma.folhaPagamento.findUnique({ where: { id: folha.id } });
  check("folha fechada com lançamento vinculado", folhaFechada?.status === "fechada" && !!folhaFechada?.lancamentoId);

  const lancFolha = await prisma.lancamento.findUnique({ where: { id: folhaFechada!.lancamentoId! } });
  check("lançamento da folha confirmado na 2.03", lancFolha?.status === "confirmado" && lancFolha?.categoriaId === cat!.id);

  // Reabrir: lançamento removido
  await prisma.$transaction(async (tx) => {
    await tx.folhaPagamento.update({
      where: { id: folha.id },
      data: { status: "aberta", fechadaEm: null, lancamentoId: null },
    });
    await tx.lancamento.delete({ where: { id: lancFolha!.id } });
  });
  const lancAposReabrir = await prisma.lancamento.findUnique({ where: { id: lancFolha!.id } });
  check("reabrir folha remove o lançamento", lancAposReabrir === null);

  // ── 3f: Onboarding ───────────────────────────────────────────
  const tpl = await prisma.onboardingTemplate.findFirst({ include: { itens: true } });
  check("template de onboarding semeado com itens", !!tpl && tpl.itens.length > 0);

  const proc = await prisma.onboardingProcesso.create({
    data: {
      userId: clt.id,
      templateId: tpl!.id,
      itens: { create: tpl!.itens.map((it) => ({ descricao: it.descricao, ordem: it.ordem })) },
    },
    include: { itens: true },
  });
  check("processo copia itens do template", proc.itens.length === tpl!.itens.length);

  await prisma.onboardingItem.update({
    where: { id: proc.itens[0].id },
    data: { concluido: true, concluidoEm: new Date() },
  });
  const concluidos = await prisma.onboardingItem.count({
    where: { processoId: proc.id, concluido: true },
  });
  check("progresso do onboarding contabiliza concluídos", concluidos === 1);

  // ── 3g: NF de PJ ─────────────────────────────────────────────
  const pj = await prisma.user.create({
    data: { name: `${tag}_pj`, email: `${tag}_pj@t.local`, role: "projetista_pj", ativo: true },
  });
  const nf = await prisma.notaFiscalPJ.create({
    data: {
      userId: pj.id,
      numero: "123",
      valor: 1500,
      arquivoPath: `nf-pj/${tag}/nf.pdf`,
      arquivoNome: "nf.pdf",
    },
  });
  check("NF criada com status enviada", nf.status === "enviada");

  await prisma.notaFiscalPJ.update({
    where: { id: nf.id },
    data: { status: "aprovada", validadoPorId: admin.id, validadoEm: new Date() },
  });
  const nfAprovada = await prisma.notaFiscalPJ.findUnique({ where: { id: nf.id } });
  check("NF aprovada com validador registrado", nfAprovada?.status === "aprovada" && nfAprovada?.validadoPorId === admin.id);

  // Limpeza
  await prisma.notaFiscalPJ.delete({ where: { id: nf.id } });
  await prisma.onboardingProcesso.delete({ where: { id: proc.id } });
  await prisma.folhaPagamento.delete({ where: { id: folha.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });

  console.log(ok ? "\nSMOKE ONDA 3E/3F/3G: OK" : "\nSMOKE ONDA 3E/3F/3G: FALHOU");
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
