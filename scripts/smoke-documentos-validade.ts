/**
 * Smoke de documentos com validade (Gestão de Pessoas F5) contra o banco de dev: aviso por faixa,
 * uma vez por faixa, renovar rearma, sem validade nunca avisa. APAGA o que criou.
 *
 *   npm run smoke:documentos-validade
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { avisarDocumentosVencendo } from "@/modules/rh/documentos/lembrete";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};

async function main() {
  const inicio = new Date();
  const pessoa = await prisma.user.findFirst({ where: { ativo: true, role: { in: ["clt", "estagiario"] } }, select: { id: true, name: true } });
  if (!pessoa) throw new Error("Nenhuma pessoa CLT ativa no banco de dev.");
  const hoje = inicioDoDiaUtc();
  const em = (dias: number) => new Date(hoje.getTime() + dias * 86_400_000);
  const base = { userId: pessoa.id, caminho: "rh/funcionarios/smoke-inexistente.pdf", nomeArquivo: "smoke.pdf", mime: "application/pdf", tamanho: 1, hashSha256: "x", autorId: pessoa.id };
  const ids: string[] = [];
  try {
    const aso = await prisma.funcionarioDocumento.create({ data: { ...base, tipo: "aso", nome: "ASO smoke", validadeEm: em(20) } });
    const semValidade = await prisma.funcionarioDocumento.create({ data: { ...base, tipo: "contrato", nome: "Contrato smoke" } });
    ids.push(aso.id, semValidade.id);

    await avisarDocumentosVencendo(hoje);
    ok((await prisma.funcionarioDocumento.findUniqueOrThrow({ where: { id: aso.id } })).avisoFaixa === 30, "ASO vencendo em 20 dias: aviso da faixa de 30");
    ok((await prisma.funcionarioDocumento.findUniqueOrThrow({ where: { id: semValidade.id } })).avisoFaixa === null, "documento sem validade não gera aviso");
    const avisos1 = await prisma.notificacao.count({ where: { createdAt: { gte: inicio }, corpo: { contains: "ASO smoke" } } });
    ok(avisos1 >= 1, `aviso foi para a pessoa e o RH (${avisos1})`);

    await avisarDocumentosVencendo(hoje);
    const avisos2 = await prisma.notificacao.count({ where: { createdAt: { gte: inicio }, corpo: { contains: "ASO smoke" } } });
    ok(avisos2 === avisos1, "segunda execução na mesma faixa não repete");

    await prisma.funcionarioDocumento.update({ where: { id: aso.id }, data: { validadeEm: em(-1) } });
    await avisarDocumentosVencendo(hoje);
    ok((await prisma.funcionarioDocumento.findUniqueOrThrow({ where: { id: aso.id } })).avisoFaixa === 0, "venceu: aviso de vencido, uma vez");

    await prisma.funcionarioDocumento.update({ where: { id: aso.id }, data: { validadeEm: em(365), avisoFaixa: null } });
    await avisarDocumentosVencendo(hoje);
    ok((await prisma.funcionarioDocumento.findUniqueOrThrow({ where: { id: aso.id } })).avisoFaixa === null, "renovado para daqui a um ano: sem aviso, faixa rearmada");
  } finally {
    await prisma.funcionarioDocumento.deleteMany({ where: { id: { in: ids } } });
    await prisma.notificacao.deleteMany({ where: { createdAt: { gte: inicio }, corpo: { contains: " smoke" } } });
    console.log("(limpeza: documentos e avisos de teste apagados)");
  }
  console.log(falhas === 0 ? "\nSMOKE OK" : `\nSMOKE FALHOU (${falhas})`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
