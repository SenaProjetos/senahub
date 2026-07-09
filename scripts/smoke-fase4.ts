/**
 * Smoke da Fase 4 (self-edit de cadastro com validação) contra o banco de dev:
 * grava um pendente no UserPreference e verifica as leituras (pendente próprio +
 * fila do RH com diff atual×novo). Cria 1 usuário temporário e remove ao final.
 *
 * Uso: tsx --tsconfig tsconfig.server.json scripts/smoke-fase4.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { minhaAlteracaoPendente, alteracoesPendentes } from "../src/modules/rh/cadastro/queries";

async function main() {
  const tag = `SMK4_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const u = await prisma.user.create({
    data: { name: `${tag}`, email: `${tag}@t.local`, role: "clt", ativo: true, telefone: "1111" },
  });

  try {
    // Sem pendente ainda.
    check("sem pendente => null", (await minhaAlteracaoPendente(u.id)) === null);

    // Grava um pendente (como a action faria).
    await prisma.userPreference.upsert({
      where: { userId: u.id },
      create: { userId: u.id, dados: { cadastroPendente: { alteracoes: { telefone: "2222", banco: "Itau" }, propostoEm: new Date().toISOString() } } },
      update: { dados: { cadastroPendente: { alteracoes: { telefone: "2222", banco: "Itau" }, propostoEm: new Date().toISOString() } } },
    });

    const meu = await minhaAlteracaoPendente(u.id);
    check("minhaAlteracaoPendente != null", meu !== null);
    check("pendente tem telefone=2222", meu?.alteracoes.telefone === "2222");

    const fila = await alteracoesPendentes();
    const meuNaFila = fila.find((p) => p.userId === u.id);
    check("usuário aparece na fila do RH", !!meuNaFila);
    const difTel = meuNaFila?.alteracoes.find((a) => a.campo === "telefone");
    check("diff telefone: atual=1111 novo=2222", difTel?.atual === "1111" && difTel?.novo === "2222");
    const difBanco = meuNaFila?.alteracoes.find((a) => a.campo === "banco");
    check("diff banco: atual=null novo=Itau", difBanco?.atual === null && difBanco?.novo === "Itau");

    // Simula aprovação: limpa o pendente.
    await prisma.userPreference.update({ where: { userId: u.id }, data: { dados: {} } });
    check("após limpar => sem pendente", (await minhaAlteracaoPendente(u.id)) === null);
  } finally {
    await prisma.user.delete({ where: { id: u.id } });
  }

  console.log(ok ? "\nSMOKE FASE4 OK" : "\nSMOKE FASE4 FALHOU");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
