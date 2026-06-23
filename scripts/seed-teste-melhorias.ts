/**
 * Seed de dados FICTÍCIOS para exercitar as melhorias (dev only).
 * - dataNascimento (com aniversariante de hoje) + alguns campos de cadastro
 * - 1 sócio (testa acesso elevado de leitura)
 * - 3 Pessoas Jurídicas + vínculo de projetistas
 * - ponto (SessaoTrabalho), tarefas concluídas e entregas ao longo de ~10 semanas
 *
 * Idempotente: a parte volátil (ponto/tarefas/pagamentos) só roda se ainda não houver
 * a PJ-marcador; o resto é upsert. Rode com:
 *   npx tsx --tsconfig tsconfig.server.json scripts/seed-teste-melhorias.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { PROJETO_MEMBRO_ROLES, PJ_ROLES, CADASTRO_ROLES, type Role } from "../src/lib/roles";

const CNPJ_MARKER = "11.111.111/0001-11";

function diasAtras(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
function emDia(base: Date, hora: number, dur: number): { inicio: Date; fim: Date } {
  const inicio = new Date(base);
  inicio.setHours(hora, 0, 0, 0);
  const fim = new Date(inicio.getTime() + dur * 3_600_000);
  return { inicio, fim };
}

async function main() {
  const hoje = new Date();

  // ── 1. Cadastro: dataNascimento (1 aniversariante hoje) + campos básicos ──
  const colaboradores = await prisma.user.findMany({
    where: { ativo: true, role: { in: CADASTRO_ROLES } },
    select: { id: true, name: true, role: true, dataNascimento: true },
    orderBy: { name: "asc" },
  });

  const cidades = [["São Paulo", "SP"], ["Rio de Janeiro", "RJ"], ["Belo Horizonte", "MG"], ["Curitiba", "PR"]];
  const cargos = ["Projetista", "Coordenador BIM", "Engenheiro", "Arquiteto", "Estagiário"];
  let aniv = 0;
  for (let i = 0; i < colaboradores.length; i++) {
    const c = colaboradores[i];
    // primeiro colaborador faz aniversário HOJE; os 2 seguintes neste mês; demais espalhados
    let nasc: Date;
    if (i === 0) nasc = new Date(Date.UTC(1990, hoje.getMonth(), hoje.getDate()));
    else if (i <= 2) nasc = new Date(Date.UTC(1992, hoje.getMonth(), ((i * 7) % 27) + 1));
    else nasc = new Date(Date.UTC(1988 + (i % 6), (hoje.getMonth() + i) % 12, ((i * 5) % 27) + 1));
    if (i <= 2) aniv++;
    const [cidade, uf] = cidades[i % cidades.length];
    await prisma.user.update({
      where: { id: c.id },
      data: {
        dataNascimento: nasc,
        cpf: `${String(100 + i).padStart(3, "0")}.${String(200 + i).padStart(3, "0")}.${String(300 + i).padStart(3, "0")}-${String(i % 100).padStart(2, "0")}`,
        telefone: `(11) 9${String(8000 + i).padStart(4, "0")}-${String(1000 + i).padStart(4, "0")}`,
        cargo: cargos[i % cargos.length],
        enderecoCidade: cidade,
        enderecoUf: uf,
        nacionalidade: "Brasileira",
      },
    });
  }
  console.log(`✓ ${colaboradores.length} colaboradores com nascimento/cadastro (${aniv} neste mês, 1 hoje).`);

  // ── 2. Sócio (acesso elevado) ──
  const candidatoSocio =
    colaboradores.find((c) => c.role === "projetista_pj") ?? colaboradores.find((c) => c.role === "clt") ?? colaboradores[0];
  if (candidatoSocio) {
    await prisma.socio.upsert({
      where: { userId: candidatoSocio.id },
      update: { ativo: true },
      create: { userId: candidatoSocio.id, percentual: 30, ativo: true },
    });
    console.log(`✓ Sócio: ${candidatoSocio.name} (${candidatoSocio.role}) — testa acesso elevado.`);
  }

  // ── 3. Pessoas Jurídicas + vínculo ──
  const pjsData = [
    { cnpj: CNPJ_MARKER, razaoSocial: "Studio BIM Engenharia LTDA", nomeFantasia: "Studio BIM", email: "contato@studiobim.com.br" },
    { cnpj: "22.222.222/0001-22", razaoSocial: "Traço & Forma Projetos LTDA", nomeFantasia: "Traço & Forma" },
    { cnpj: "33.333.333/0001-33", razaoSocial: "Vértice Consultoria LTDA", nomeFantasia: "Vértice" },
  ];
  const pjs = [];
  for (const d of pjsData) {
    pjs.push(
      await prisma.pessoaJuridica.upsert({ where: { cnpj: d.cnpj }, update: { razaoSocial: d.razaoSocial }, create: d }),
    );
  }
  const pjUsers = colaboradores.filter((c) => PJ_ROLES.includes(c.role as Role));
  for (let i = 0; i < pjUsers.length; i++) {
    await prisma.user.update({ where: { id: pjUsers[i].id }, data: { pjId: pjs[i % pjs.length].id } });
  }
  console.log(`✓ ${pjs.length} PJs; ${pjUsers.length} projetistas vinculados.`);

  // ── Parte volátil: só na 1ª execução (evita duplicar ponto/tarefas/entregas) ──
  // Marcador confiável: tarefas "[seed]". Evita duplicar em re-execução.
  const seedTarefa = await prisma.tarefa.findFirst({ where: { titulo: { startsWith: "[seed]" } }, select: { id: true } });
  if (seedTarefa) {
    console.log("• Parte volátil já populada — pulando ponto/tarefas/entregas.");
    return;
  }

  const projetistas = colaboradores.filter((c) => PROJETO_MEMBRO_ROLES.includes(c.role as Role)).slice(0, 5);
  const projeto = await prisma.projeto.findFirst({ select: { id: true } });
  const statusConcluido = await prisma.tarefaStatus.findFirst({ where: { concluido: true }, select: { id: true } });
  const disciplinas = await prisma.disciplina.findMany({ take: 6, select: { id: true } });

  // ── 4. Ponto (SessaoTrabalho) — 10 semanas, com semanas de queda ──
  let nSessoes = 0;
  for (let p = 0; p < projetistas.length; p++) {
    for (let semana = 0; semana < 10; semana++) {
      // semanas 3 e 6 com baixa produção para um par de projetistas (queda)
      const queda = (semana === 3 || semana === 6) && p % 2 === 0;
      const diasTrabalho = queda ? 1 : 3 + ((p + semana) % 3);
      for (let d = 0; d < diasTrabalho; d++) {
        const base = diasAtras(semana * 7 + d + 1);
        const { inicio, fim } = emDia(base, 9, queda ? 3 : 6 + ((d + p) % 3));
        await prisma.sessaoTrabalho.create({
          data: { userId: projetistas[p].id, projetoId: projeto?.id ?? null, inicio, fim },
        });
        nSessoes++;
      }
    }
  }
  console.log(`✓ ${nSessoes} sessões de ponto em 10 semanas.`);

  // ── 5. Tarefas concluídas (concluidaEm espalhado) ──
  let nTarefas = 0;
  if (statusConcluido) {
    for (let p = 0; p < projetistas.length; p++) {
      for (let semana = 0; semana < 10; semana++) {
        const queda = (semana === 3 || semana === 6) && p % 2 === 0;
        const qtd = queda ? 0 : 1 + ((p + semana) % 3);
        for (let k = 0; k < qtd; k++) {
          await prisma.tarefa.create({
            data: {
              titulo: `[seed] Tarefa ${p}-${semana}-${k}`,
              statusId: statusConcluido.id,
              criadorId: projetistas[p].id,
              projetoId: projeto?.id ?? null,
              concluidaEm: diasAtras(semana * 7 + (k % 5) + 1),
              responsaveis: { create: [{ userId: projetistas[p].id }] },
            },
          });
          nTarefas++;
        }
      }
    }
  }
  console.log(`✓ ${nTarefas} tarefas concluídas.`);

  // ── 6. Entregas (PagamentoProjetista) ──
  let nPag = 0;
  if (disciplinas.length > 0) {
    for (let p = 0; p < Math.min(projetistas.length, 3); p++) {
      for (let semana = 0; semana < 10; semana += 2) {
        await prisma.pagamentoProjetista.create({
          data: {
            disciplinaId: disciplinas[(p + semana) % disciplinas.length].id,
            projetistaId: projetistas[p].id,
            valor: 1500 + (p * 100 + semana * 50),
            tipoProfissional: projetistas[p].role,
            status: "pendente",
            liberadoEm: diasAtras(semana * 7 + 2),
          },
        });
        nPag++;
      }
    }
  }
  console.log(`✓ ${nPag} entregas (pagamentos a projetista).`);

  console.log("\n✅ Seed de teste concluído.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERRO no seed:", e);
    process.exit(1);
  });
