/**
 * Smoke da Onda 3 contra o banco de dev: ponto (sessões → rateio por projeto,
 * troca de projeto contabiliza tempo), chat (#geral exclui freelancer/cliente,
 * membership barra não-membro). Idempotente.
 *
 * Uso: npm run smoke:onda3
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { rateioMes, minutosSessao } from "../src/modules/ponto/queries";
import { ensureCanalGeral, getOrCreateDM } from "../src/modules/chat/service";

async function main() {
  const tag = `SMK3_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const clt = await prisma.user.create({
    data: { name: `${tag}_clt`, email: `${tag}_clt@t.local`, role: "clt", ativo: true },
  });
  const freela = await prisma.user.create({
    data: { name: `${tag}_free`, email: `${tag}_free@t.local`, role: "freelancer", ativo: true },
  });
  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_prj`, clienteId: cliente.id },
    });
  });

  // 1) Ponto: duas sessões fechadas no mês (troca de projeto)
  const hoje = new Date();
  const s1ini = new Date(hoje.getFullYear(), hoje.getMonth(), 10, 8, 0, 0);
  const s1fim = new Date(hoje.getFullYear(), hoje.getMonth(), 10, 10, 0, 0); // 120 min
  const s2ini = s1fim;
  const s2fim = new Date(hoje.getFullYear(), hoje.getMonth(), 10, 11, 30, 0); // 90 min
  await prisma.sessaoTrabalho.createMany({
    data: [
      { userId: clt.id, projetoId: projeto.id, inicio: s1ini, fim: s1fim },
      { userId: clt.id, projetoId: projeto.id, inicio: s2ini, fim: s2fim },
    ],
  });
  check("minutosSessao soma janela fechada", minutosSessao(s1ini, s1fim) === 120);

  const rateio = await rateioMes(hoje.getFullYear(), hoje.getMonth() + 1);
  const totalProjeto = rateio.porProjeto.find((p) => p.projeto.startsWith(projeto.codigo))?.minutos ?? 0;
  check("rateio soma as duas sessões do projeto (210 min)", totalProjeto >= 210);

  // 2) Chat: #geral inclui CLT, exclui freelancer
  const geral = await ensureCanalGeral();
  const membrosGeral = await prisma.canalMembro.findMany({
    where: { canalId: geral.id },
    select: { userId: true },
  });
  const setGeral = new Set(membrosGeral.map((m) => m.userId));
  check("#geral inclui CLT", setGeral.has(clt.id));
  check("#geral exclui freelancer (regra de negócio)", !setGeral.has(freela.id));

  // 3) DM idempotente: mesma dupla → mesmo canal
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  const dm1 = await getOrCreateDM(admin!.id, clt.id);
  const dm2 = await getOrCreateDM(clt.id, admin!.id);
  check("getOrCreateDM retorna o mesmo canal para a dupla", dm1.id === dm2.id);

  // 4) Membership barra não-membro
  const ehMembro = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId: dm1.id, userId: freela.id } },
  });
  check("freelancer não é membro da DM alheia", ehMembro === null);

  // Limpeza
  await prisma.sessaoTrabalho.deleteMany({ where: { userId: clt.id } });
  await prisma.canalMembro.deleteMany({ where: { userId: { in: [clt.id, freela.id] } } });
  await prisma.canal.deleteMany({ where: { id: dm1.id } });
  await prisma.projeto.delete({ where: { id: projeto.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });

  console.log(ok ? "\nSMOKE ONDA 3: OK" : "\nSMOKE ONDA 3: FALHOU");
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
