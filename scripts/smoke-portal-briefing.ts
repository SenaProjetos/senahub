/**
 * Smoke do briefing no portal do cliente (spec docs/superpowers/specs/2026-11-21-portal-briefing-design.md) contra o
 * banco de dev, sem SMTP: `notificar` e `enviarEmail` falsos gravam em listas. Exercita o MESMO serviço das ações
 * (pedir/encerrar, `gravarRespostasBriefing`, `gravarRespostasExtras`) e a leitura do portal. Confere: recusas do pedido
 * (sem conta, cliente inativo), quem recebe o aviso, dois pedidos simultâneos, nome de quem preencheu, acesso de outro
 * cliente / cliente inativo, campo oculto que não sai, janela do aviso à equipe, encerrar, reabrir, link sem pedido e
 * pergunta extra removida.
 *
 * O aviso à equipe usa o `notificarPreenchimentoInput` de verdade (audiência real do banco de dev): as notificações são
 * contadas pelo `href` do projeto throwaway e apagadas no fim. Apaga tudo o que criou.
 *
 * Uso: npm run smoke:portal-briefing
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { resolverModeloDoProjeto } from "../src/modules/inputs/modelo-queries";
import { gravarRespostasBriefing } from "../src/modules/inputs/briefing-service";
import { gravarRespostasExtras } from "../src/modules/inputs/extras-service";
import { notificarPreenchimentoInput } from "../src/modules/inputs/notificar-preenchimento";
import {
  encerrarBriefingNoPortal,
  pedirBriefingNoPortal,
  type AvisarPedido,
} from "../src/modules/inputs/portal-pedido-service";
import {
  MOTIVO_CLIENTE_INATIVO,
  MOTIVO_ENCERRADO,
  MOTIVO_JA_PEDIDO,
  MOTIVO_NAO_PEDIDO,
  MOTIVO_SEM_CONTA_PORTAL,
} from "../src/modules/inputs/portal-pedido";
import { acessoDoUsuarioAoProjetoDoPortal } from "../src/modules/portal/acesso";
import { briefingDoPortal } from "../src/modules/portal/briefing-queries";

type Sino = { userId: string; titulo: string; corpo: string; href: string };
type Email = { to: string; slug: string; vars: Record<string, string> };

async function main() {
  const tag = `SMKBRIEFING_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const autor = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!autor) throw new Error("Banco de dev sem usuário ativo.");

  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];

  const novoCliente = async (sufixo: string, ativo = true) => {
    const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}`, ativo } });
    clientes.push(c.id);
    return c;
  };
  const novoProjeto = async (clienteId: string, sufixo: string) => {
    const p = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${sufixo}`, clienteId, disciplinas: { create: [{ disciplinaTextoLegado: "Estrutural", ordem: 0 }] } },
      });
    });
    projetos.push(p.id);
    return p;
  };
  const novaConta = async (clienteId: string, sufixo: string, ativo = true) => {
    const u = await prisma.user.create({
      data: { name: `Mariana ${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "externo", clienteId, ativo },
    });
    usuarios.push(u.id);
    return u;
  };

  const sinos: Sino[] = [];
  const emails: Email[] = [];
  const deps: AvisarPedido = {
    notificar: async (userId, n) => {
      sinos.push({ userId, ...n });
    },
    enviarEmail: async (to, slug, vars) => {
      emails.push({ to, slug, vars });
      return true;
    },
  };
  const limpar = () => {
    sinos.length = 0;
    emails.length = 0;
  };
  const erroDe = (r: { ok: boolean } & Record<string, unknown>) => (r.ok ? null : (r.erro as string));
  const avisosDaEquipe = (projetoId: string) => prisma.notificacao.count({ where: { href: `/projetos/${projetoId}/inputs` } });

  try {
    const cliente = await novoCliente("cli");
    const outro = await novoCliente("outro");
    const semConta = await novoCliente("semconta");
    const inativo = await novoCliente("inativo", false);

    const contaA = await novaConta(cliente.id, "a");
    const contaB = await novaConta(cliente.id, "b");
    await novaConta(cliente.id, "inativa", false);
    const contaOutro = await novaConta(outro.id, "outro");
    const contaDoInativo = await novaConta(inativo.id, "doinativo");

    const pA = await novoProjeto(cliente.id, "pA");
    const pB = await novoProjeto(cliente.id, "pB");
    const pC = await novoProjeto(cliente.id, "pC");
    const pSemConta = await novoProjeto(semConta.id, "semconta");
    const pInativo = await novoProjeto(inativo.id, "inativo");

    // Formulário pequeno no projeto A: só dois obrigatórios visíveis (e-mail e nome). O endereço da obra recebe
    // resposta ANTES de ser ocultado (check 6).
    const modelo = await resolverModeloDoProjeto(pA.id, null);
    const gravouEndereco = await gravarRespostasBriefing(pA.id, { enderecoObra: "Rua Oculta, 10" }, "Equipe", "equipe");
    const secoesOcultas = modelo.secoes.filter((s) => s.id !== "dados-gerais").map((s) => s.id);
    const camposOcultos = (modelo.secoes.find((s) => s.id === "dados-gerais")?.campos ?? [])
      .map((c) => c.chave)
      .filter((c) => c !== "emailContato" && c !== "nomeCompleto");
    await prisma.briefingProjeto.update({ where: { projetoId: pA.id }, data: { secoesOcultas, camposOcultos } });

    // 1. Pedido recusado: sem conta ativa e cliente inativo.
    const semContaR = await pedirBriefingNoPortal(pSemConta.id, autor.id, deps);
    const inativoR = await pedirBriefingNoPortal(pInativo.id, autor.id, deps);
    check("pedir sem conta ativa recusa com o motivo da regra", erroDe(semContaR) === MOTIVO_SEM_CONTA_PORTAL);
    check("pedir com cliente inativo recusa com o motivo da regra", erroDe(inativoR) === MOTIVO_CLIENTE_INATIVO);
    check("pedido recusado não avisa ninguém", sinos.length === 0 && emails.length === 0);

    // 2. Pedido: 2 contas ativas recebem sino + e-mail; a inativa e a de outro cliente não.
    const pedido = await pedirBriefingNoPortal(pA.id, autor.id, deps);
    check("pedir avisa as 2 contas ativas (2 sinos, 2 e-mails)", pedido.ok && pedido.avisadas === 2 && pedido.emails === 2 && sinos.length === 2 && emails.length === 2);
    check(
      "sino e e-mail só das contas ativas do cliente",
      new Set(sinos.map((s) => s.userId)).size === 2 &&
        sinos.every((s) => s.userId === contaA.id || s.userId === contaB.id) &&
        emails.every((e) => e.to === contaA.email || e.to === contaB.email),
    );
    check(
      "e-mail usa o modelo portal-briefing-pedido e o link /portal/<id>/briefing",
      emails.every((e) => e.slug === "portal-briefing-pedido" && e.vars.url.endsWith(`/portal/${pA.id}/briefing`)) &&
        sinos.every((s) => s.href === `/portal/${pA.id}/briefing`),
    );

    // 3. Dois pedidos simultâneos (projeto B): um vence, o outro é "já pedido", e o aviso sai uma vez.
    limpar();
    const duplo = await Promise.all([pedirBriefingNoPortal(pB.id, autor.id, deps), pedirBriefingNoPortal(pB.id, autor.id, deps)]);
    const vencedores = duplo.filter((r) => r.ok).length;
    check(
      "dois pedidos simultâneos: um ok, um 'já foi pedido', 2 e-mails no total",
      vencedores === 1 && duplo.filter((r) => erroDe(r) === MOTIVO_JA_PEDIDO).length === 1 && emails.length === 2,
    );

    // 4. O cliente grava pelo portal e o nome de quem preencheu fica no registro.
    const grav = await gravarRespostasBriefing(pA.id, { emailContato: "fulano@exemplo.com.br" }, "Fulano Cliente", "portal");
    const linha = await prisma.briefingProjeto.findUnique({ where: { projetoId: pA.id }, select: { preenchidoPor: true } });
    check("gravar pelo portal grava e guarda o nome de quem preencheu", grav.ok && linha?.preenchidoPor === "Fulano Cliente");

    // 5. Acesso: conta de outro cliente e conta de cliente inativo não abrem o projeto.
    const acessoOutro = await acessoDoUsuarioAoProjetoDoPortal({ id: contaOutro.id, tipo: "externo", mustChangePassword: false }, pA.id);
    const acessoInativo = await acessoDoUsuarioAoProjetoDoPortal({ id: contaDoInativo.id, tipo: "externo", mustChangePassword: false }, pInativo.id);
    check("conta de outro cliente não acessa o projeto", !acessoOutro.ok);
    check("conta de cliente inativo não acessa o projeto", !acessoInativo.ok);

    // 6. Campo oculto pela equipe, com resposta guardada, não sai para o portal.
    const guardada = ((await prisma.briefingProjeto.findUnique({ where: { projetoId: pA.id }, select: { respostasJson: true } }))?.respostasJson ?? {}) as Record<string, unknown>;
    const doPortal = await briefingDoPortal(pA.id);
    check(
      "resposta de campo oculto fica guardada mas não aparece no portal",
      gravouEndereco.ok &&
        guardada.enderecoObra === "Rua Oculta, 10" &&
        doPortal !== null &&
        !("enderecoObra" in doPortal.respostas) &&
        doPortal.respostas.emailContato === "fulano@exemplo.com.br",
    );

    // 7. Aviso à equipe: a ação chama `parcial` a cada salvamento e `completo` na transição. Janela de 6 h por projeto.
    const marca = async () => (await prisma.briefingProjeto.findUnique({ where: { projetoId: pA.id }, select: { avisoEquipeEm: true } }))?.avisoEquipeEm ?? null;
    await notificarPreenchimentoInput(pA.id, "parcial", "portal");
    const t1 = await marca();
    const c1 = await avisosDaEquipe(pA.id);
    const segundo = await gravarRespostasBriefing(pA.id, { emailContato: "fulano2@exemplo.com.br" }, "Fulano Cliente", "portal");
    await notificarPreenchimentoInput(pA.id, "parcial", "portal");
    const t2 = await marca();
    const c2 = await avisosDaEquipe(pA.id);
    check(
      "dois salvamentos parciais pelo portal = 1 aviso na janela",
      segundo.ok && t1 !== null && t2 !== null && t2.getTime() === t1.getTime() && c2 === c1,
    );
    const completo = await gravarRespostasBriefing(pA.id, { nomeCompleto: "Fulano de Tal" }, "Fulano Cliente", "portal");
    const concluiu = completo.ok && completo.status === "completo" && completo.statusAnterior !== "completo";
    await notificarPreenchimentoInput(pA.id, concluiu ? "completo" : "parcial", "portal");
    const t3 = await marca();
    const c3 = await avisosDaEquipe(pA.id);
    check(
      "a passagem para completo avisa de novo (fura a janela)",
      concluiu && t1 !== null && t3 !== null && t3.getTime() > t1.getTime() && c3 === c1 * 2,
    );
    if (c1 === 0) console.log("[AVISO] a audiência gestao_operacional do banco de dev está vazia: contagem de sinos não prova nada.");

    // 8. Encerrar: portal e link recusam; a equipe grava.
    const extraAtiva = await prisma.inputProjeto.create({ data: { projetoId: pA.id, disciplina: null, pergunta: `${tag} extra ativa`, ordem: 900 } });
    const extraRemovida = await prisma.inputProjeto.create({ data: { projetoId: pA.id, disciplina: null, pergunta: `${tag} extra removida`, ordem: 901, removidoEm: new Date() } });
    const enc = await encerrarBriefingNoPortal(pA.id, autor.id);
    const viaPortal = await gravarRespostasBriefing(pA.id, { nomeCompleto: "X" }, "Fulano Cliente", "portal");
    const viaLink = await gravarRespostasBriefing(pA.id, { nomeCompleto: "X" }, "Fulano Cliente", "link");
    const extrasLink = await gravarRespostasExtras(pA.id, [{ id: extraAtiva.id, resposta: "x" }], "link");
    const extrasPortal = await gravarRespostasExtras(pA.id, [{ id: extraAtiva.id, resposta: "x" }], "portal");
    const viaEquipe = await gravarRespostasBriefing(pA.id, { nomeCompleto: "Pela equipe" }, "Equipe", "equipe");
    const extrasEquipe = await gravarRespostasExtras(pA.id, [{ id: extraAtiva.id, resposta: "pela equipe" }], "equipe");
    check(
      "encerrado: portal e link recusam o briefing e as perguntas extras",
      enc.ok && erroDe(viaPortal) === MOTIVO_ENCERRADO && erroDe(viaLink) === MOTIVO_ENCERRADO && erroDe(extrasLink) === MOTIVO_ENCERRADO && erroDe(extrasPortal) === MOTIVO_ENCERRADO,
    );
    check("encerrado: a equipe continua gravando", viaEquipe.ok && extrasEquipe.ok && extrasEquipe.salvas === 1);

    // 9. Reabrir: avisa de novo ("reabriu"), e link e portal voltam a gravar.
    limpar();
    const reaberto = await pedirBriefingNoPortal(pA.id, autor.id, deps);
    const volta = await gravarRespostasBriefing(pA.id, { nomeCompleto: "Depois de reabrir" }, "Fulano Cliente", "portal");
    const voltaLink = await gravarRespostasBriefing(pA.id, { nomeCompleto: "Depois de reabrir" }, "Fulano Cliente", "link");
    check(
      "reabrir avisa de novo (2 sinos 'A equipe reabriu…', 2 e-mails)",
      reaberto.ok && reaberto.reaberto && sinos.length === 2 && emails.length === 2 && sinos.every((s) => s.titulo.startsWith("A equipe reabriu")),
    );
    check("reabrir: portal e link voltam a gravar", volta.ok && voltaLink.ok);

    // 10. Projeto sem pedido pelo portal: o link grava como sempre e o portal recusa.
    const linkSemPedido = await gravarRespostasBriefing(pC.id, { emailContato: "link@exemplo.com.br" }, "Fulano Cliente", "link");
    const portalSemPedido = await gravarRespostasBriefing(pC.id, { emailContato: "portal@exemplo.com.br" }, "Fulano Cliente", "portal");
    check("sem pedido: o link grava", linkSemPedido.ok);
    check("sem pedido: o portal recusa", erroDe(portalSemPedido) === MOTIVO_NAO_PEDIDO);

    // 11. Pergunta extra removida no meio do preenchimento: o portal a ignora e grava só a ativa.
    const extras = await gravarRespostasExtras(
      pA.id,
      [
        { id: extraRemovida.id, resposta: "não deve gravar" },
        { id: extraAtiva.id, resposta: "resposta do cliente" },
      ],
      "portal",
    );
    const removida = await prisma.inputProjeto.findUnique({ where: { id: extraRemovida.id }, select: { resposta: true } });
    check("pergunta extra removida: portal devolve ignoradas 1 e não grava nela", extras.ok && extras.ignoradas === 1 && extras.salvas === 1 && removida?.resposta === null);
  } finally {
    if (projetos.length > 0) {
      await prisma.notificacao.deleteMany({ where: { href: { in: projetos.map((id) => `/projetos/${id}/inputs`) } } });
      await prisma.notificacao.deleteMany({ where: { userId: { in: usuarios } } });
    }
    for (const id of projetos) await prisma.projeto.delete({ where: { id } });
    for (const id of usuarios) await prisma.user.delete({ where: { id } });
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
