/**
 * Smoke do e-mail de acompanhamento do projeto (Lote 3), contra o banco de dev, SEM SMTP: o envio é
 * trocado por um falso injetado no serviço (o mesmo código do envio real roda).
 *
 *   1. Destinatários: contato com optOut fora; e-mail repetido entra uma vez.
 *   2. Só a revisão com o controle "Enviado ao cliente" ativo vai na lista.
 *   3. Primeiro envio sem In-Reply-To; o segundo responde ao primeiro e referencia o primeiro.
 *   4. Falha no envio não grava (o "último e-mail" não avança).
 *   5. Revisão que perdeu o controle depois de listada é recusada.
 *   6. "Novos desde o último e-mail" separa pelo envio anterior.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { dadosDoAcompanhamento } from "../src/modules/projetos/acompanhamento/queries";
import { enviarAcompanhamento } from "../src/modules/projetos/acompanhamento/service";
import { separarItens } from "../src/modules/projetos/acompanhamento/regras";

const tag = `SMKACO_${Date.now()}`;
let falhas = 0;
function check(nome: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`  FALHA  ${nome}`, extra ?? "");
  }
}

type Enviado = { to: string; subject: string; html: string; bcc?: string; replyTo?: string; messageId?: string; inReplyTo?: string; references?: string };

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true, email: true, name: true } });
  if (!admin) throw new Error("Sem usuário admin no banco de dev — rode npm run db:seed.");

  const cliente = await prisma.cliente.create({
    data: {
      nome: `${tag}-cliente`,
      contatos: {
        create: [
          { nome: "Ana", email: "Ana@Cliente.com", principal: true },
          { nome: "Bruno", email: "bruno@cliente.com", optOut: true },
          { nome: "Sem e-mail" },
        ],
      },
    },
  });
  const projeto = await prisma.projeto.create({
    data: {
      codigo: `${Date.now()}`.slice(-6),
      ano: new Date().getFullYear(),
      sequencial: Number(`${Date.now()}`.slice(-5)),
      nome: `${tag}-projeto`,
      clienteId: cliente.id,
    },
  });
  const disc = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: "Estrutural" } });
  const doc = await prisma.documentoDisciplina.create({
    data: { disciplinaId: disc.id, chave: `${tag}/planta.pdf`, nomeArquivo: "planta.pdf", titulo: "Planta de forma" },
  });
  const rev1 = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: 1 } });
  const rev2 = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: 2 } });
  const semControle = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: 3 } });
  const ctl1 = await prisma.controleRevisao.create({
    data: { revisaoId: rev1.id, tipo: "enviado_cliente", motivo: "smoke", aplicadoEm: new Date(Date.now() - 3_600_000) },
  });
  await prisma.controleRevisao.create({ data: { revisaoId: rev2.id, tipo: "enviado_cliente", motivo: "smoke" } });

  const enviados: Enviado[] = [];
  const usuario = { id: admin.id, email: admin.email, name: admin.name };
  const falso = (ok: boolean) => ({
    smtpConfigurado: () => true,
    enviar: async (o: Enviado) => {
      if (ok) enviados.push(o);
      return ok;
    },
  });

  try {
    // 1/2 — destinatários e lista
    const dados = await dadosDoAcompanhamento(projeto.id);
    check("contato com optOut e sem e-mail ficam fora da lista de contatos", dados.contatos.length === 1 && dados.contatos[0].email === "ana@cliente.com", dados.contatos);
    check("só revisão com o controle ativo entra na lista", dados.itens.length === 2 && !dados.itens.some((i) => i.revisaoId === semControle.id), dados.itens.map((i) => i.rotulo));
    check("rótulo traz revisão, título e disciplina", dados.itens[0].rotulo.startsWith("R01 · Planta de forma"), dados.itens[0].rotulo);

    // 3 — primeiro envio
    const r1 = await enviarAcompanhamento(
      { projetoId: projeto.id, usuario, destinatarios: ["ana@cliente.com", " ANA@cliente.com "], revisaoIds: [rev1.id], copiaParaMim: true },
      falso(true),
    );
    check("primeiro envio: um destinatário só (repetido entra uma vez)", enviados[0]?.to === "ana@cliente.com", enviados[0]?.to);
    check("primeiro envio sem In-Reply-To/References", enviados[0]?.inReplyTo === undefined && enviados[0]?.references === undefined);
    check("cópia oculta e Reply-To vão para quem enviou", enviados[0]?.bcc === admin.email && enviados[0]?.replyTo === admin.email);
    check("assunto fixo por projeto", enviados[0]?.subject.startsWith("Acompanhamento — ") === true, enviados[0]?.subject);
    check("corpo traz a revisão enviada e não a outra", enviados[0]?.html.includes("Planta de forma") === true && !enviados[0]?.html.includes("R02"));
    check("registro gravado", r1.itens === 1 && (await prisma.emailAcompanhamento.count({ where: { projetoId: projeto.id } })) === 1);

    // 6 — novos desde o último envio (o controle de rev2 foi aplicado agora, depois do envio? não: antes) — força a data
    await prisma.controleRevisao.updateMany({ where: { revisaoId: rev2.id }, data: { aplicadoEm: new Date(Date.now() + 60_000) } });
    const depois = await dadosDoAcompanhamento(projeto.id);
    const { novos, anteriores } = separarItens(depois.itens, depois.ultimoEnvioEm);
    check("depois do envio, só o que foi marcado depois é novo", novos.length === 1 && novos[0].revisaoId === rev2.id && anteriores.length === 1, { novos: novos.length, anteriores: anteriores.length });

    // 3 — segundo envio encadeado
    await enviarAcompanhamento(
      { projetoId: projeto.id, usuario, destinatarios: ["ana@cliente.com"], revisaoIds: [rev2.id], copiaParaMim: false },
      falso(true),
    );
    const primeiroId = enviados[0].messageId;
    check(
      "segundo envio responde ao primeiro e o referencia",
      enviados[1]?.inReplyTo === primeiroId && enviados[1]?.references === primeiroId,
      { inReplyTo: enviados[1]?.inReplyTo, references: enviados[1]?.references, primeiroId },
    );
    check("sem cópia pedida, sem Cco", enviados[1]?.bcc === undefined);

    // 4 — falha de envio não grava
    const antes = await prisma.emailAcompanhamento.count({ where: { projetoId: projeto.id } });
    let falhou = false;
    try {
      await enviarAcompanhamento(
        { projetoId: projeto.id, usuario, destinatarios: ["ana@cliente.com"], revisaoIds: [rev1.id], copiaParaMim: false },
        falso(false),
      );
    } catch {
      falhou = true;
    }
    check("falha de envio levanta erro e não grava", falhou && (await prisma.emailAcompanhamento.count({ where: { projetoId: projeto.id } })) === antes);

    // 5 — controle removido depois de listado
    await prisma.controleRevisao.update({ where: { id: ctl1.id }, data: { removidoEm: new Date(), motivoRemocao: "smoke" } });
    let recusada = false;
    try {
      await enviarAcompanhamento(
        { projetoId: projeto.id, usuario, destinatarios: ["ana@cliente.com"], revisaoIds: [rev1.id], copiaParaMim: false },
        falso(true),
      );
    } catch {
      recusada = true;
    }
    check("revisão que perdeu o controle é recusada", recusada);

    // sem destinatário válido
    let semDest = false;
    try {
      await enviarAcompanhamento(
        { projetoId: projeto.id, usuario, destinatarios: ["lixo"], revisaoIds: [rev2.id], copiaParaMim: false },
        falso(true),
      );
    } catch {
      semDest = true;
    }
    check("sem destinatário válido é recusado", semDest);
  } finally {
    await prisma.emailAcompanhamento.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.controleRevisao.deleteMany({ where: { revisao: { documentoId: doc.id } } });
    await prisma.documentoRevisao.deleteMany({ where: { documentoId: doc.id } });
    await prisma.documentoDisciplina.deleteMany({ where: { id: doc.id } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
