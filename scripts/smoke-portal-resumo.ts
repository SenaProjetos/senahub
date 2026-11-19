/**
 * Smoke do resumo diário do portal (spec docs/superpowers/specs/2026-11-19-portal-resumo-diario-design.md) contra o
 * banco de dev, sem SMTP: `enviar` e `notificar` falsos gravam em listas. Exercita o MESMO `rodarResumoDiario` do job,
 * restrito aos projetos throwaway (`somenteProjetos`) para não tocar nos dados de verdade. Confere: uma conta recebe um
 * e-mail e um sino; o dia avaliado não volta; a reserva impede o duplicado; dias perdidos viram um e-mail; opt-out;
 * falha libera a reserva; quem não recebe (cliente desativado, conta inativa, outro cliente, sem conta); configuração
 * desligada; primeira rodada; sem SMTP.
 *
 * Guarda a configuração `portal.resumoDiario` de antes e a devolve no fim. Apaga tudo o que criou.
 *
 * Uso: npm run smoke:portal-resumo
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { CHAVE_CONFIG_RESUMO, type ConfigResumo } from "../src/modules/portal/resumo-diario";
import { getConfigResumo, rodarResumoDiario, salvarConfigResumo, type EnviarEmailResumo } from "../src/modules/portal/resumo-service";

type Email = { para: string; vars: Parameters<EnviarEmailResumo>[1] };
type Sino = { userId: string; titulo: string; corpo: string; href: string };

async function main() {
  const tag = `SMKRESUMO_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const autor = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!autor) throw new Error("Banco de dev sem usuário ativo.");
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", ativo: true, projetoId: null }, select: { id: true } });
  if (!fase) throw new Error("Banco de dev sem fase no catálogo.");

  const configAntes = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_RESUMO } });
  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];

  const novoCliente = async (sufixo: string) => {
    const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}` } });
    clientes.push(c.id);
    return c;
  };
  const novoProjeto = async (clienteId: string, sufixo: string) => {
    const p = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${sufixo}`, clienteId, disciplinas: { create: [{ disciplinaTextoLegado: "Estrutural", ordem: 0 }] } },
        include: { disciplinas: true },
      });
    });
    projetos.push(p.id);
    return { ...p, disciplinaId: p.disciplinas[0].id };
  };
  const novaConta = async (clienteId: string, sufixo: string, extra: { ativo?: boolean } = {}) => {
    const u = await prisma.user.create({
      data: {
        name: `Mariana ${tag}`,
        email: `${tag.toLowerCase()}_${sufixo}@smoke.local`,
        tipo: "externo",
        clienteId,
        ativo: extra.ativo ?? true,
        createdAt: new Date("2026-11-01T12:00:00Z"),
      },
    });
    usuarios.push(u.id);
    return u;
  };
  /** Prancha compartilhada fora do ciclo, com o evento de marcação na data dada. */
  const marcar = async (disciplinaId: string, nome: string, em: string) => {
    const doc = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-${nome}.pdf`, nomeArquivo: `${tag}-${nome}.pdf`, faseId: fase.id },
    });
    const rev = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: 1, createdById: autor.id } });
    await prisma.upload.create({
      data: {
        disciplinaId,
        documentoId: doc.id,
        revisaoId: rev.id,
        pacote: "A",
        nomeArquivo: `${tag}-${nome}.pdf`,
        caminho: `smoke/${tag}-${nome}.pdf`,
        tamanho: 10,
        hashSha256: "0".repeat(64),
        autorId: autor.id,
        validado: true,
      },
    });
    await prisma.documentoDisciplina.update({ where: { id: doc.id }, data: { revisaoCompartilhadaId: rev.id } });
    await prisma.documentoEvento.create({
      data: { documentoId: doc.id, tipo: "situacao_marcada", categoria: "alteracao", userId: autor.id, detalhe: { pasta: "Compartilhado", revisao: 1 }, createdAt: new Date(em) },
    });
    return doc;
  };

  const emails: Email[] = [];
  const sinos: Sino[] = [];
  let falharEnvio = false;
  const enviar: EnviarEmailResumo = async (para, vars) => {
    if (falharEnvio) return false;
    emails.push({ para, vars });
    return true;
  };
  const notificar = async (userId: string, n: { titulo: string; corpo: string; href: string }) => {
    sinos.push({ userId, ...n });
  };
  const limpar = () => {
    emails.length = 0;
    sinos.length = 0;
  };
  const HOJE = "2026-11-20";
  const rodar = (somenteProjetos: string[], comSmtp = true) =>
    rodarResumoDiario({ hoje: HOJE, enviar: comSmtp ? enviar : null, notificar, somenteProjetos });
  const config = (c: Partial<ConfigResumo>) => salvarConfigResumo({ ativo: true, desde: "2026-11-01", ultimoDia: "2026-11-18", ...c });

  try {
    const cliente = await novoCliente("cli");
    const p1 = await novoProjeto(cliente.id, "p1");
    const conta = await novaConta(cliente.id, "a");
    await marcar(p1.disciplinaId, "a", "2026-11-19T15:00:00Z");

    // 1. Rodada normal: ontem (19) tem andamento.
    await config({});
    let r = await rodar([p1.id]);
    const meus = emails.filter((e) => e.para === conta.email);
    check("uma conta do portal recebe 1 e-mail e 1 sino", meus.length === 1 && sinos.filter((s) => s.userId === conta.id).length === 1);
    check(
      "e-mail: lista, período e link do projeto",
      meus[0]?.vars.lista.includes("1 prancha compartilhada com você") === true &&
        meus[0]?.vars.periodo === "19/11/2026" &&
        meus[0]?.vars.url.endsWith(`/portal/${p1.id}`) === true &&
        meus[0]?.vars.nome === "Mariana",
    );
    check("sino aponta para o projeto e sem push", sinos[0]?.href === `/portal/${p1.id}` && sinos[0]?.titulo.startsWith("Novidades em"));
    check("ultimoDia avança para 2026-11-19", (await getConfigResumo()).ultimoDia === "2026-11-19");

    // 2. Segunda rodada no mesmo dia: o dia já foi avaliado.
    limpar();
    r = await rodar([p1.id]);
    check("segunda rodada no mesmo dia não manda nada", emails.length === 0 && sinos.length === 0 && r.dias.length === 0);

    // 3. ultimoDia volta (rodada que caiu no meio): as reservas impedem o duplicado.
    limpar();
    await config({});
    r = await rodar([p1.id]);
    check("reservas impedem duplicado", emails.length === 0 && sinos.length === 0 && r.duplicados > 0);

    // 4. Dois dias perdidos viram um e-mail.
    await marcar(p1.disciplinaId, "b", "2026-11-18T15:00:00Z");
    await prisma.avisoPortalEnviado.deleteMany({ where: { projetoId: p1.id } });
    limpar();
    await config({ ultimoDia: "2026-11-17" });
    r = await rodar([p1.id]);
    check("dois dias perdidos viram um e-mail", emails.length === 1 && emails[0].vars.periodo === "18/11/2026 a 19/11/2026" && sinos.length === 1);

    // 5. Opt-out: sino sim, e-mail não.
    await prisma.avisoPortalEnviado.deleteMany({ where: { projetoId: p1.id } });
    await prisma.userPreference.upsert({
      where: { userId: conta.id },
      create: { userId: conta.id, dados: { notif_portal_resumo: false } },
      update: { dados: { notif_portal_resumo: false } },
    });
    limpar();
    await config({});
    r = await rodar([p1.id]);
    check("opt-out: sino sim, e-mail não", emails.length === 0 && sinos.length === 1 && r.optOut === 1);
    await prisma.userPreference.delete({ where: { userId: conta.id } });

    // 6. Falha no envio libera a reserva do e-mail (o sino fica).
    await prisma.avisoPortalEnviado.deleteMany({ where: { projetoId: p1.id } });
    limpar();
    falharEnvio = true;
    await config({});
    r = await rodar([p1.id]);
    falharEnvio = false;
    const reservasEmail = await prisma.avisoPortalEnviado.count({ where: { projetoId: p1.id, canal: "email" } });
    check("falha no envio libera a reserva", r.falhas === 1 && reservasEmail === 0 && sinos.length === 1);

    // 7. Sem SMTP: só sino.
    await prisma.avisoPortalEnviado.deleteMany({ where: { projetoId: p1.id } });
    limpar();
    await config({});
    await rodar([p1.id], false);
    check("sem SMTP: só sino", emails.length === 0 && sinos.length === 1);

    // 8. Quem não recebe.
    const inativa = await novaConta(cliente.id, "inativa", { ativo: false });
    const outro = await novoCliente("outro");
    const contaOutro = await novaConta(outro.id, "outro");
    await prisma.avisoPortalEnviado.deleteMany({ where: { projetoId: p1.id } });
    limpar();
    await config({});
    await rodar([p1.id]);
    check("conta inativa não recebe", !emails.some((e) => e.para === inativa.email) && !sinos.some((s) => s.userId === inativa.id));
    check("outro cliente não recebe", !emails.some((e) => e.para === contaOutro.email) && !sinos.some((s) => s.userId === contaOutro.id));

    await prisma.cliente.update({ where: { id: cliente.id }, data: { ativo: false } });
    await prisma.avisoPortalEnviado.deleteMany({ where: { projetoId: p1.id } });
    limpar();
    await config({});
    await rodar([p1.id]);
    check("cliente desativado não recebe", emails.length === 0 && sinos.length === 0);
    await prisma.cliente.update({ where: { id: cliente.id }, data: { ativo: true } });

    const semConta = await novoCliente("semconta");
    const p2 = await novoProjeto(semConta.id, "p2");
    await marcar(p2.disciplinaId, "c", "2026-11-19T15:00:00Z");
    limpar();
    await config({});
    r = await rodar([p2.id]);
    check("projeto sem conta do portal: nada e sem erro", emails.length === 0 && sinos.length === 0 && (await prisma.avisoPortalEnviado.count({ where: { projetoId: p2.id } })) === 0);

    // 9. Configuração desligada.
    await prisma.avisoPortalEnviado.deleteMany({ where: { projetoId: p1.id } });
    limpar();
    await config({ ativo: false });
    r = await rodar([p1.id]);
    check("config desligada: nada", emails.length === 0 && sinos.length === 0 && (await getConfigResumo()).ultimoDia === "2026-11-18");

    // 10. Primeira rodada (desde nulo): grava desde = ontem e manda só ontem (o 18 tem andamento e fica fora).
    await prisma.avisoPortalEnviado.deleteMany({ where: { projetoId: p1.id } });
    limpar();
    await salvarConfigResumo({ ativo: true, desde: null, ultimoDia: null });
    r = await rodar([p1.id]);
    const cfg = await getConfigResumo();
    check(
      "primeira rodada com desde nulo grava desde = ontem e manda só ontem",
      cfg.desde === "2026-11-19" && emails.length === 1 && emails[0].vars.periodo === "19/11/2026",
    );
  } finally {
    for (const id of projetos) await prisma.projeto.delete({ where: { id } });
    for (const id of usuarios) await prisma.user.delete({ where: { id } });
    for (const id of clientes) await prisma.cliente.delete({ where: { id } });
    if (configAntes) {
      await prisma.configSistema.update({ where: { chave: CHAVE_CONFIG_RESUMO }, data: { valor: configAntes.valor ?? {} } });
    } else {
      await prisma.configSistema.deleteMany({ where: { chave: CHAVE_CONFIG_RESUMO } });
    }
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
