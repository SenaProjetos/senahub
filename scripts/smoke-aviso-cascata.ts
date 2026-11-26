/**
 * Smoke do aviso em cascata (pool de recursos, parte 3 — decisões C, D, E, F, 8 e 9) contra o banco de dev. Monta os
 * projetos, confere e apaga. Usa o dia de HOJE (data real não aceita futuro), por isso as datas vêm do motor.
 *
 *   1. Data real: o início real atrasado de uma linha do P (aprovado) empurra a Mireli para cima do Q (aprovado) e do W
 *      (rascunho). Novo: lista os dois; avisa só a coordenação do Q, sem quem gravou e sem a coordenação do P; o W não
 *      avisa ninguém; o Q não muda de data.
 *   2. Gravar de novo o mesmo conflito não é novo (decisão F); só o % (mesmas datas reais) não dispara (decisão 9).
 *   3. Data de Status: o trabalho não feito do X anda para depois dela e o João encosta no Y — novo, avisa o Y; a mesma Data de
 *      Status de novo não dispara.
 *   4. Sem recursos:ver, quem gravou vê "outro projeto", sem nome nem tarefa.
 *   5. Coordenação que desligou a categoria: ninguém recebe e a tela não diz "foi avisada".
 *
 * Uso: npm run smoke:aviso-cascata
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { notificarMuitos } from "../src/lib/notificar";
import { diaLocal } from "../src/modules/ponto/engine";
import { planoDoProjeto } from "../src/modules/planejamento/agenda";
import { avisarCascata, fotoAntesDaDataReal, fotoAntesDaDataStatus } from "../src/modules/planejamento/cascata-service";
import { registrarExecucaoNaLinha } from "../src/modules/planejamento/execucao-service";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-cascata-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const somar = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Envio = { userIds: string[]; titulo: string; corpo?: string; href?: string; categoria?: string };
const envios: Envio[] = [];
const enviar: typeof notificarMuitos = async (userIds, n, opts) => {
  envios.push({ userIds: [...userIds].sort(), titulo: n.titulo, corpo: n.corpo, href: n.href, categoria: opts?.categoria });
};

async function fimDaLinha(projetoId: string, linhaId: string) {
  const plano = await planoDoProjeto(projetoId);
  return plano?.resultado.linhas.get(linhaId) ?? null;
}

async function main() {
  const hoje = diaLocal(new Date());
  const usuario = (sufixo: string) =>
    prisma.user.create({ data: { name: `${tag}-${sufixo}`, email: `${tag}-${sufixo}@teste.local`, tipo: "interno", contratacao: "pj", emailVerified: false } });
  const mireli = await usuario("mireli");
  const autor = await usuario("autor");
  const coordP = await usuario("coordP");
  const coordQ = await usuario("coordQ");
  const coordW = await usuario("coordW");
  // A Data de Status (parte 3) usa outra pessoa, para não cruzar com o conflito da parte 1.
  const joao = await usuario("joao");
  const pessoas = [mireli, autor, coordP, coordQ, coordW, joao].map((u) => u.id);
  await prisma.recurso.createMany({ data: [{ userId: mireli.id, capacidade: 1 }, { userId: joao.id, capacidade: 1 }] });

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  let n = 0;
  const novoProjeto = async (sufixo: string) => {
    n++;
    const p = await prisma.projeto.create({
      data: {
        codigo: `${Date.now() + n}`.slice(-6),
        ano: 2026,
        sequencial: Number(`${Date.now() + n}`.slice(-5)),
        nome: `${tag}-${sufixo}`,
        clienteId: cliente.id,
      },
    });
    return p;
  };
  const P = await novoProjeto("P");
  const Q = await novoProjeto("Q");
  const W = await novoProjeto("W");
  const X = await novoProjeto("X");
  const Y = await novoProjeto("Y");
  const projetos = [P.id, Q.id, W.id, X.id, Y.id];
  await prisma.projetoMembro.createMany({
    data: [
      { projetoId: P.id, userId: coordP.id, papel: "coordenador" },
      { projetoId: Q.id, userId: coordQ.id, papel: "coordenador" },
      // Quem grava também coordena o Q: não recebe o aviso do que ele mesmo fez.
      { projetoId: Q.id, userId: autor.id, papel: "coordenador" },
      { projetoId: W.id, userId: coordW.id, papel: "coordenador" },
      { projetoId: Y.id, userId: coordQ.id, papel: "Coordenação" },
    ],
  });

  const linha = async (projetoId: string, nome: string, duracaoDias: number, horas: number, quem = mireli.id) => {
    const l = await prisma.eapTarefa.create({ data: { projetoId, nome, tipoEap: "atv", duracaoDias, ordem: n++, inicioPrevisto: d(hoje), fimPrevisto: d(hoje) } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: l.id, userId: quem, papel: "pro", horasPrevistas: horas, principal: true } });
    return l;
  };

  try {
    // ── 1. Data real ────────────────────────────────────────────────────────
    // P aprovado: "Modelagem" planejada para começar há uma semana, 10 dias úteis, 8 h por dia; ainda sem início real.
    await prisma.cronogramaProjeto.create({ data: { projetoId: P.id, inicioProjeto: d(somar(hoje, -7)), aprovado: true } });
    const L = await linha(P.id, "Modelagem", 10, 80);
    const antesL = await fimDaLinha(P.id, L.id);
    if (!antesL) throw new Error("o motor não agendou a linha do P");
    // Q (aprovado) e W (rascunho em andamento) começam no dia seguinte ao fim planejado da Modelagem: sem conflito hoje.
    const depoisDoFim = somar(antesL.fim, 1);
    await prisma.cronogramaProjeto.create({ data: { projetoId: Q.id, inicioProjeto: d(depoisDoFim), aprovado: true } });
    const LQ = await linha(Q.id, "Revisão interna", 10, 80);
    await prisma.cronogramaProjeto.create({ data: { projetoId: W.id, inicioProjeto: d(depoisDoFim), aprovado: false } });
    await linha(W.id, "Estudo preliminar", 2, 4);
    const inicioQAntes = (await fimDaLinha(Q.id, LQ.id))?.inicio;

    check("só o % (mesmas datas reais) não tira foto: não dispara (decisão 9)", (await fotoAntesDaDataReal(L.id, { inicioReal: null, fimReal: null })) === null);

    const antes = await fotoAntesDaDataReal(L.id, { inicioReal: hoje, fimReal: null });
    check("data real nova: foto de antes sem conflito", antes != null && antes.sobrecargas.length === 0, antes?.sobrecargas);
    await registrarExecucaoNaLinha({ id: L.id, inicioReal: hoje, fimReal: null, hoje, autorId: autor.id });
    const aviso = await avisarCascata({ antes, origem: "data_real", autorId: autor.id, verCargaDaEquipe: async () => true, enviar });
    const comQ = aviso?.conflitos.find((c) => c.outro?.codigo === Q.codigo);
    const comW = aviso?.conflitos.find((c) => c.outro?.codigo === W.codigo);
    check("a Modelagem atrasada encosta no Q: conflito novo da Mireli com o Q", comQ != null && comQ.nome === mireli.name && comQ.dias.length > 0, aviso);
    check("e no W: listado como rascunho (decisão 8)", comW != null && comW.outroRascunho === true && comW.coordenacaoAvisada === false, comW);
    check("tarefas dos dois lados no aviso", comQ?.linhasDeste.includes("Modelagem") === true && comQ?.outro?.linhas.includes("Revisão interna") === true, comQ);
    check("a coordenação do Q foi avisada (e a tela diz isso)", comQ?.coordenacaoAvisada === true, comQ);
    check(
      "um aviso só, para a coordenação do Q, sem quem gravou e sem a coordenação do P e do W",
      envios.length === 1 && JSON.stringify(envios[0].userIds) === JSON.stringify([coordQ.id]),
      envios,
    );
    check(
      "categoria conflito_recurso, link para o cronograma do Q, sem mudar a data dele",
      envios[0]?.categoria === "conflito_recurso" && envios[0]?.href === `/planejamento/${Q.id}` && /Nenhuma data do .* mudou/.test(envios[0]?.corpo ?? ""),
      envios[0],
    );
    check("o Q continua com as mesmas datas (D18)", (await fimDaLinha(Q.id, LQ.id))?.inicio === inicioQAntes);

    // ── 2. O mesmo conflito de novo não é novo ──────────────────────────────
    envios.length = 0;
    const deNovo = await fotoAntesDaDataReal(L.id, { inicioReal: somar(hoje, -1), fimReal: null });
    await registrarExecucaoNaLinha({ id: L.id, inicioReal: somar(hoje, -1), fimReal: null, hoje, autorId: autor.id });
    const avisoDeNovo = await avisarCascata({ antes: deNovo, origem: "data_real", autorId: autor.id, verCargaDaEquipe: async () => true, enviar });
    const diasNovos = avisoDeNovo?.conflitos.find((c) => c.outro?.codigo === Q.codigo)?.dias ?? [];
    check(
      "um dia a menos de atraso: o conflito que já existia não volta (decisão F) e ninguém é avisado de novo",
      diasNovos.length === 0 && envios.length === 0,
      { avisoDeNovo, envios },
    );

    // ── 3. Data de Status ───────────────────────────────────────────────────
    envios.length = 0;
    await prisma.cronogramaProjeto.create({ data: { projetoId: X.id, inicioProjeto: d(hoje), aprovado: true } });
    const X1 = await linha(X.id, "Quadro de cargas", 3, 24, joao.id);
    const antesX1 = await fimDaLinha(X.id, X1.id);
    if (!antesX1) throw new Error("o motor não agendou a linha do X");
    await prisma.cronogramaProjeto.create({ data: { projetoId: Y.id, inicioProjeto: d(somar(antesX1.fim, 1)), aprovado: true } });
    await linha(Y.id, "Compatibilização", 10, 80, joao.id);

    const antesDs = await fotoAntesDaDataStatus(X.id, hoje);
    await prisma.cronogramaProjeto.update({ where: { projetoId: X.id }, data: { dataStatus: d(hoje) } });
    const depoisX1 = await fimDaLinha(X.id, X1.id);
    check("a Data de Status de hoje empurra o trabalho não feito do X para depois dela", depoisX1 != null && depoisX1.inicio > antesX1.inicio, { antesX1, depoisX1 });
    const avisoDs = await avisarCascata({ antes: antesDs, origem: "data_status", autorId: autor.id, verCargaDaEquipe: async () => true, enviar });
    check(
      "o X encosta no Y: conflito novo, origem Data de Status, coordenação do Y (papel \"Coordenação\") avisada",
      avisoDs?.origem === "data_status" && avisoDs.conflitos.some((c) => c.outro?.codigo === Y.codigo && c.coordenacaoAvisada) &&
        envios.length === 1 && envios[0].href === `/planejamento/${Y.id}` && JSON.stringify(envios[0].userIds) === JSON.stringify([coordQ.id]),
      { avisoDs, envios },
    );
    check("a mesma Data de Status de novo não dispara", (await fotoAntesDaDataStatus(X.id, hoje)) === null);

    // ── 4. Sem recursos:ver ─────────────────────────────────────────────────
    envios.length = 0;
    await prisma.cronogramaProjeto.update({ where: { projetoId: X.id }, data: { dataStatus: null } });
    const antesSem = await fotoAntesDaDataStatus(X.id, hoje);
    await prisma.cronogramaProjeto.update({ where: { projetoId: X.id }, data: { dataStatus: d(hoje) } });
    const avisoSem = await avisarCascata({ antes: antesSem, origem: "data_status", autorId: autor.id, verCargaDaEquipe: async () => false, enviar });
    check(
      "quem grava sem recursos:ver vê o conflito sem o nome nem as tarefas do outro projeto",
      (avisoSem?.conflitos.length ?? 0) > 0 && avisoSem!.conflitos.every((c) => c.outro === null),
      avisoSem,
    );
    check(
      "o aviso à coordenação sem recursos:ver não cita o projeto de origem",
      envios.length === 1 && /em outro cronograma/.test(envios[0].corpo ?? "") && !(envios[0].corpo ?? "").includes(X.codigo),
      envios,
    );

    // ── 5. Coordenação que desligou o aviso ─────────────────────────────────
    envios.length = 0;
    await prisma.userPreference.create({ data: { userId: coordQ.id, dados: { notif_conflito_recurso: false } } });
    await prisma.cronogramaProjeto.update({ where: { projetoId: X.id }, data: { dataStatus: null } });
    const antesOpt = await fotoAntesDaDataStatus(X.id, hoje);
    await prisma.cronogramaProjeto.update({ where: { projetoId: X.id }, data: { dataStatus: d(hoje) } });
    const avisoOpt = await avisarCascata({ antes: antesOpt, origem: "data_status", autorId: autor.id, verCargaDaEquipe: async () => true, enviar });
    check(
      "a única coordenação desligou o aviso: ninguém recebe e a tela não diz \"foi avisada\"",
      (avisoOpt?.conflitos.length ?? 0) > 0 && avisoOpt!.conflitos.every((c) => !c.coordenacaoAvisada) && envios.length === 0,
      { avisoOpt, envios },
    );
  } finally {
    await prisma.userPreference.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.notificacao.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.eapAtribuicao.deleteMany({ where: { tarefa: { projetoId: { in: projetos } } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projetoMembro.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.recurso.deleteMany({ where: { userId: { in: pessoas } } });
    await prisma.user.deleteMany({ where: { id: { in: pessoas } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
