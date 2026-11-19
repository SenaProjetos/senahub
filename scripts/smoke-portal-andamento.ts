/**
 * Smoke do andamento por fase e da linha do tempo do portal do cliente (spec
 * docs/superpowers/specs/2026-11-19-portal-andamento-linha-do-tempo-design.md) contra o banco de dev. A regra é pura
 * e está em `modules/portal/andamento.test.ts`; aqui vai a ligação com o banco: fases da disciplina, documento de cada
 * upload, data da marcação pelo evento (fora do ciclo) e pelo controle (dentro do ciclo), prancha retirada saindo,
 * lista igual ao detalhe e outro cliente nunca aparecendo.
 *
 * Cria clientes + projetos + documentos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:portal-andamento
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { andamentoDoPortal } from "../src/modules/portal/andamento-queries";
import { projetosDoCliente } from "../src/modules/portal/queries";

async function main() {
  const tag = `SMKANDAMENTO_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const usuario = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem usuário ativo.");
  const fases = await prisma.pranchaCatalogo.findMany({
    where: { categoria: "fase", ativo: true, projetoId: null },
    orderBy: { sigla: "asc" },
    take: 2,
    select: { id: true, sigla: true },
  });
  if (fases.length < 2) throw new Error("Banco de dev sem duas fases no catálogo.");
  const [faseA, faseB] = fases;

  const clientes: string[] = [];
  const projetos: string[] = [];
  const novoCliente = async (sufixo: string) => {
    const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}` } });
    clientes.push(c.id);
    return c;
  };
  const novoProjeto = async (clienteId: string, sufixo: string) => {
    const p = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: {
          ano,
          sequencial,
          codigo,
          tipo: "particular",
          nome: `${tag}_${sufixo}`,
          clienteId,
          disciplinas: { create: [{ disciplinaTextoLegado: "Estrutural", ordem: 0 }] },
        },
        include: { disciplinas: true },
      });
    });
    projetos.push(p.id);
    return { ...p, disciplinaId: p.disciplinas[0].id };
  };
  /** Documento da fase com uma revisão e um PDF validado, posto em "Compartilhado". */
  const entrega = async (disciplinaId: string, nome: string, faseId: string) => {
    const doc = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-${nome}.pdf`, nomeArquivo: `${tag}-${nome}.pdf`, faseId },
    });
    const rev = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: 1, createdById: usuario.id } });
    for (const ext of ["pdf", "dwg"]) {
      await prisma.upload.create({
        data: {
          disciplinaId,
          documentoId: doc.id,
          revisaoId: rev.id,
          pacote: "A",
          nomeArquivo: `${tag}-${nome}.${ext}`,
          caminho: `smoke/${tag}-${nome}.${ext}`,
          tamanho: 10,
          hashSha256: "0".repeat(64),
          autorId: usuario.id,
          validado: true,
        },
      });
    }
    await prisma.documentoDisciplina.update({ where: { id: doc.id }, data: { revisaoCompartilhadaId: rev.id } });
    return { doc, rev };
  };

  try {
    const cliente = await novoCliente("cli");
    const p1 = await novoProjeto(cliente.id, "p1");
    await prisma.disciplinaEtapa.create({
      data: { disciplinaId: p1.disciplinaId, etapaId: faseA.id, status: "aprovado", entregueEm: new Date("2026-10-05T12:00:00Z"), percentual: 40, ordem: 0 },
    });
    await prisma.disciplinaEtapa.create({
      data: { disciplinaId: p1.disciplinaId, etapaId: faseB.id, status: "em_andamento", percentual: 60, ordem: 1 },
    });

    // Fase A: prancha fora do ciclo, data pelo evento "situacao_marcada" (PDF + DWG = uma prancha).
    const a = await entrega(p1.disciplinaId, "a", faseA.id);
    await prisma.documentoEvento.create({
      data: {
        documentoId: a.doc.id,
        tipo: "situacao_marcada",
        categoria: "alteracao",
        userId: usuario.id,
        detalhe: { pasta: "Compartilhado", revisao: 1 },
        createdAt: new Date("2026-10-02T15:00:00Z"),
      },
    });
    // Fase B: prancha com controle "enviado ao cliente" — a data vem do controle.
    const b = await entrega(p1.disciplinaId, "b", faseB.id);
    await prisma.controleRevisao.create({
      data: { revisaoId: b.rev.id, tipo: "enviado_cliente", motivo: "smoke", aplicadoPorId: usuario.id, aplicadoEm: new Date("2026-10-07T15:00:00Z") },
    });

    const r1 = await andamentoDoPortal(p1);
    const fasesP1 = r1.andamento.disciplinas[0]?.fases ?? [];
    const fA = fasesP1.find((f) => f.faseId === faseA.id);
    const fB = fasesP1.find((f) => f.faseId === faseB.id);
    check(`fase ${faseA.sigla} concluída em 2026-10-05`, fA?.situacao === "concluida" && fA.concluidaEm === "2026-10-05");
    check(`fase ${faseB.sigla} em andamento (prancha enviada, fase não aprovada)`, fB?.situacao === "em_andamento");
    check("percentual = percentual da fase concluída", r1.andamento.percentual === 40);
    const textos = r1.linha.map((i) => `${i.dia} ${i.texto}`);
    check("linha do tempo: prancha compartilhada na data do evento", textos.includes("2026-10-02 1 prancha compartilhada com você"));
    check("linha do tempo: data vem do controle dentro do ciclo", textos.includes("2026-10-07 1 prancha compartilhada com você"));
    check(`linha do tempo: fase ${faseA.sigla} concluída`, textos.includes(`2026-10-05 Fase ${faseA.sigla} concluída`));

    const lista = await projetosDoCliente(cliente.id);
    check("percentual da lista igual ao do detalhe", lista.find((p) => p.id === p1.id)?.progresso === r1.andamento.percentual);

    // Outro cliente: o projeto dele nunca entra na lista deste.
    const outro = await novoCliente("outro");
    const p2 = await novoProjeto(outro.id, "p2");
    check("projeto de outro cliente não aparece", !(await projetosDoCliente(cliente.id)).some((p) => p.id === p2.id));

    // Retirar a prancha da fase A da pasta do cliente: some da linha do tempo e a fase volta a em andamento.
    await prisma.documentoDisciplina.update({ where: { id: a.doc.id }, data: { revisaoCompartilhadaId: null } });
    const r2 = await andamentoDoPortal(p1);
    const fA2 = r2.andamento.disciplinas[0]?.fases.find((f) => f.faseId === faseA.id);
    check("prancha retirada: fase volta a em andamento", fA2?.situacao === "em_andamento");
    check("prancha retirada: sai da linha do tempo", !r2.linha.some((i) => i.dia === "2026-10-02" || i.tipo === "fase_concluida"));
  } finally {
    for (const id of projetos) await prisma.projeto.delete({ where: { id } });
    for (const id of clientes) await prisma.cliente.delete({ where: { id } });
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
