/**
 * Smoke da conversa do cliente com a coordenação pelo portal (spec
 * docs/superpowers/specs/2026-11-21-portal-mensagens-coordenacao-design.md) contra o banco de dev, sem o servidor no ar.
 *
 * Cenário próprio (clientes, projetos, contas e internos com sufixo do smoke), apagado no fim. Sino, e-mail e emissão
 * Socket.io são falsos (`deps` gravam em listas); a reserva do e-mail e o opt-out são os de verdade.
 *
 * Confere: a conversa nasce na primeira mensagem; audiência do escritório (projetista, coordenador de outro projeto e
 * perfil Coordenador sem ver o projeto ficam fora da leitura, da escrita e dos avisos; gestor global lê sem ser membro);
 * conta de outro cliente e de cliente inativo recusam; quem é avisado (coordenador membro; sem coordenador, os globais;
 * nunca o autor); e-mail um por vez até ler; duas mensagens simultâneas = uma conversa e um e-mail; opt-outs; decisão
 * (marca, marca de novo, desmarca, histórico, "Registrada pela coordenação" no portal, sem nome de quem marcou);
 * texto vazio sem anexo; anexos (só o autor, só em mensagem com anexos, janela de 15 min, até 5 — dois ao mesmo tempo no
 * quinto = um —, tipo fora da lista; quem baixa: coordenador, gestor e contas do cliente sim, projetista, coordenador de
 * outro projeto e outro cliente não; conta com troca de senha pendente não; janela medida no começo da requisição); e-mail
 * que falha devolve a reserva (a próxima mensagem avisa); a aba Cliente diz quando nenhuma conta do cliente lê.
 *
 * Uso: npm run smoke:portal-mensagens
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";
import {
  audienciaDoProjeto,
  contasDoClienteDoProjeto,
  definirAvisoPortalMensagem,
  desmarcarDecisao,
  anexoParaUsuario,
  enviarMensagem,
  exigirMensagemAnexavel,
  gravarAnexo,
  marcarDecisao,
  marcarLida,
  podeVerConversaDoProjeto,
  type Autor,
} from "../src/modules/portal/mensagens/service";
import { conversaParaCliente, conversaParaEquipe, conversasDaEquipe } from "../src/modules/portal/mensagens/queries";
import { avisarMensagemNova, type AvisarMensagem } from "../src/modules/portal/mensagens/avisos";
import { coordenadoresDoProjeto } from "../src/modules/projetos/coordenacao-queries";
import {
  MOTIVO_ANEXOS_MAX,
  MOTIVO_DECISAO_JA_MARCADA,
  MOTIVO_JANELA_ANEXO,
  MOTIVO_TIPO_ANEXO,
  MOTIVO_DECISAO_NAO_MARCADA,
  MOTIVO_NAO_ENCONTRADA,
  MOTIVO_TEXTO_VAZIO,
  ROTULO_DECISAO_PORTAL,
} from "../src/modules/portal/mensagens/regras";

async function main() {
  const tag = `SMKMENSAGENS_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };
  const motivoDe = async (f: () => Promise<unknown>): Promise<string | null> => {
    try {
      await f();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];

  // Avisos falsos: gravam em listas. O opt-out por categoria é aplicado pelo próprio `avisarMensagemNova`.
  const sinos: { userId: string; titulo: string; corpo: string; href: string; categoria: string | null }[] = [];
  const emails: { to: string; slug: string; vars: Record<string, string> }[] = [];
  const emitidos: { userId: string; evento: string; payload: unknown }[] = [];
  const deps: AvisarMensagem = {
    notificar: async (ids, n, o) => {
      for (const userId of ids) sinos.push({ userId, ...n, categoria: o?.categoria ?? null });
    },
    enviarEmail: async (to, slug, vars) => {
      emails.push({ to, slug, vars });
      return true;
    },
    emitir: (userId, evento, payload) => {
      emitidos.push({ userId, evento, payload });
    },
  };
  const limpar = () => {
    sinos.length = 0;
    emails.length = 0;
    emitidos.length = 0;
  };
  const sinosDe = (id: string) => sinos.filter((s) => s.userId === id).length;
  const emailsPara = (email: string) => emails.filter((e) => e.to === email).length;
  const emitidoPara = (id: string) => emitidos.some((e) => e.userId === id);

  try {
    const novoCliente = async (sufixo: string, ativo = true) => {
      const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}`, ativo } });
      clientes.push(c.id);
      return c;
    };
    const novoProjeto = async (clienteId: string, sufixo: string) => {
      const p = await prisma.$transaction(async (tx) => {
        const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
        return tx.projeto.create({
          data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${sufixo}`, clienteId },
        });
      });
      projetos.push(p.id);
      return p;
    };
    const tipoTermo = tipoTermoPorTipo("externo");
    const novaConta = async (clienteId: string, sufixo: string) => {
      const u = await prisma.user.create({
        data: { name: `Mariana ${sufixo} Souza`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "externo", clienteId },
      });
      usuarios.push(u.id);
      await prisma.aceiteTermo.create({
        data: { userId: u.id, tipo: tipoTermo, versao: TERMOS[tipoTermo].versao, conteudoHash: `${tag}_hash` },
      });
      return u;
    };
    const novoInterno = async (sufixo: string, perfilId: string | null = null) => {
      const u = await prisma.user.create({
        data: { name: `Interno ${sufixo} ${tag}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "interno", perfilId },
      });
      usuarios.push(u.id);
      return u;
    };
    const override = (userId: string, recurso: string, acao: string, permitido: boolean) =>
      prisma.permissaoUsuario.create({ data: { userId, recurso, acao, permitido, motivo: `smoke ${tag}` } });
    const membro = (projetoId: string, userId: string) => prisma.projetoMembro.create({ data: { projetoId, userId } });

    const cliA = await novoCliente("cliA");
    const cliB = await novoCliente("cliB");
    const cliInativo = await novoCliente("inativo", false);
    const projP = await novoProjeto(cliA.id, "P");
    const projQ = await novoProjeto(cliA.id, "Q");
    const projSemCoord = await novoProjeto(cliA.id, "semcoord");
    const projCorrida = await novoProjeto(cliA.id, "corrida");
    const projInativo = await novoProjeto(cliInativo.id, "inativo");
    const cliSemConta = await novoCliente("semconta");
    const projSemConta = await novoProjeto(cliSemConta.id, "semconta");

    const contaA1 = await novaConta(cliA.id, "a1");
    const contaA2 = await novaConta(cliA.id, "a2");
    const contaB = await novaConta(cliB.id, "b1");
    const contaInativo = await novaConta(cliInativo.id, "inat");

    const perfilCoord = await prisma.perfilAcesso.findUnique({ where: { chave: "coordenador" }, select: { id: true } });
    if (!perfilCoord) throw new Error("perfil 'coordenador' não existe no banco de dev (rode npm run db:seed)");

    // Coordenação = perfil Coordenador que enxerga o projeto (`projetos/coordenacao.ts`).
    const coord = await novoInterno("coord", perfilCoord.id);
    const projetista = await novoInterno("projetista");
    const coordOutro = await novoInterno("coordoutro", perfilCoord.id);
    // Perfil Coordenador sem escopo global (override nega): vê só o que o escopo de dados mostra.
    const perfilSemVer = await novoInterno("perfilsemver", perfilCoord.id);
    const perfilVendo = await novoInterno("perfilvendo", perfilCoord.id);
    for (const u of [perfilSemVer, perfilVendo, coord, projetista, coordOutro]) {
      await override(u.id, "escopo", "global", false);
      await override(u.id, "notificacoes", "gestao", false);
    }
    const gestor = await novoInterno("gestor");
    await override(gestor.id, "escopo", "global", true);
    await override(gestor.id, "notificacoes", "gestao", true);
    const coordCorrida = await novoInterno("coordcorrida", perfilCoord.id);
    await override(coordCorrida.id, "escopo", "global", false);
    await override(coordCorrida.id, "notificacoes", "gestao", false);

    // Um Coordenador com escopo global no banco coordena todos os projetos (decisão do dono, 2026-11-27): entra nas
    // contas como `globais` (nenhum usuário do smoke tem escopo global como Coordenador).
    const globais = await coordenadoresDoProjeto(projSemCoord.id);
    await membro(projP.id, coord.id);
    await membro(projP.id, projetista.id);
    await membro(projP.id, perfilVendo.id);
    await membro(projQ.id, coordOutro.id);
    await membro(projSemCoord.id, projetista.id);
    await membro(projCorrida.id, coordCorrida.id);

    const cliente = (u: { id: string; name: string }): Autor => ({ userId: u.id, nome: u.name, lado: "cliente" });
    const equipe = (u: { id: string; name: string }): Autor => ({ userId: u.id, nome: u.name, lado: "equipe" });
    const enviar = (projetoId: string, autor: Autor, texto: string, comAnexos = false) =>
      enviarMensagem({ projetoId, autor, texto, comAnexos });

    // ── conversa nasce ──────────────────────────────────────────────────────────────────────
    const antesConversa = await prisma.conversaPortal.count({ where: { projetoId: projP.id } });
    const m1 = await enviar(projP.id, cliente(contaA1), "  Podemos trocar o revestimento da fachada?  ");
    const conv = await prisma.conversaPortal.findUnique({ where: { projetoId: projP.id } });
    const m1Db = await prisma.mensagemPortal.findUnique({ where: { id: m1.mensagemId } });
    const leituraAutor = await prisma.leituraConversaPortal.findUnique({
      where: { conversaId_userId: { conversaId: m1.conversaId, userId: contaA1.id } },
    });
    check(
      "[conversa] cliente envia e a conversa nasce: texto aparado, lado cliente, última = cliente, autor já leu até a própria",
      antesConversa === 0 &&
        conv?.id === m1.conversaId &&
        conv.ultimoLado === "cliente" &&
        m1Db?.texto === "Podemos trocar o revestimento da fachada?" &&
        m1Db.lado === "cliente" &&
        m1Db.autorNome === contaA1.name &&
        conv.ultimaMensagemEm?.getTime() === m1Db.criadaEm.getTime() &&
        leituraAutor?.lidaAte?.getTime() === m1Db.criadaEm.getTime(),
    );

    // ── avisos: cliente escreve ─────────────────────────────────────────────────────────────
    limpar();
    const r1 = await avisarMensagemNova(m1.mensagemId, deps);
    check(
      "[avisos] cliente escreve: a coordenação (perfil Coordenador que enxerga o projeto) recebe sino e e-mail (template equipe→cliente certo, sem o texto)",
      [coord, perfilVendo].every(
        (u) =>
          sinosDe(u.id) === 1 &&
          sinos.find((s) => s.userId === u.id)?.categoria === "mensagem_cliente" &&
          sinos.find((s) => s.userId === u.id)?.href === `/projetos/${projP.id}/cliente` &&
          emailsPara(u.email) === 1,
      ) &&
        emails.every(
          (e) =>
            e.slug === "portal-mensagem-cliente" &&
            e.vars.autor === contaA1.name &&
            e.vars.projeto === projP.nome &&
            e.vars.url.endsWith(`/projetos/${projP.id}/cliente`),
        ) &&
        !JSON.stringify(emails).includes("revestimento") &&
        !JSON.stringify(sinos).includes("revestimento") &&
        r1.sinos === 2 + globais.length &&
        r1.emails === 2 + globais.length,
    );
    check(
      "[avisos] projetista, coordenador de outro projeto, perfil Coordenador sem ver o projeto e o próprio autor: sem sino nem e-mail",
      [projetista, coordOutro, perfilSemVer, contaA1, contaA2, gestor].every((u) => sinosDe(u.id) === 0 && emailsPara(u.email) === 0),
    );
    check(
      "[socket] 'portal-conversa' com só o projetoId para a audiência e as contas do cliente; nunca projetista, outro coordenador, perfil sem ver ou outro cliente",
      emitidos.every((e) => e.evento === "portal-conversa" && JSON.stringify(e.payload) === JSON.stringify({ projetoId: projP.id })) &&
        [coord, gestor, perfilVendo, contaA1, contaA2].every((u) => emitidoPara(u.id)) &&
        [projetista, coordOutro, perfilSemVer, contaB, contaInativo].every((u) => !emitidoPara(u.id)) &&
        r1.emitidos === emitidos.length,
    );

    // ── audiência ───────────────────────────────────────────────────────────────────────────
    const audiencia = await audienciaDoProjeto(projP.id);
    check(
      "[audiência] coordenador membro, gestor global e perfil Coordenador que vê o projeto estão; projetista, coordenador de outro projeto, perfil sem ver e contas externas não",
      [coord, gestor, perfilVendo].every((u) => audiencia.includes(u.id)) &&
        [projetista, coordOutro, perfilSemVer, contaA1, contaB].every((u) => !audiencia.includes(u.id)),
    );
    const leiturasFora = [
      await conversaParaEquipe(projP.id, projetista.id),
      await conversaParaEquipe(projP.id, coordOutro.id),
      await conversaParaEquipe(projP.id, perfilSemVer.id),
      await conversaParaEquipe(projP.id, contaA1.id),
    ];
    const escritasFora = [
      await motivoDe(() => enviar(projP.id, equipe(projetista), "oi")),
      await motivoDe(() => enviar(projP.id, equipe(coordOutro), "oi")),
      await motivoDe(() => enviar(projP.id, equipe(perfilSemVer), "oi")),
      await motivoDe(() => marcarLida({ projetoId: projP.id, userId: projetista.id, ate: new Date() })),
    ];
    check(
      "[audiência] projetista, coordenador de outro projeto e perfil Coordenador sem ver o projeto: leitura nula e escrita 'Conversa não encontrada.'",
      leiturasFora.every((l) => l === null) && escritasFora.every((m) => m === MOTIVO_NAO_ENCONTRADA),
    );
    const doGestor = await conversaParaEquipe(projP.id, gestor.id);
    check(
      "[audiência] gestor global lê sem ser membro (e o perfil Coordenador que vê o projeto também)",
      doGestor !== null &&
        doGestor.mensagens.length === 1 &&
        doGestor.naoLidas === 1 &&
        (await conversaParaEquipe(projP.id, perfilVendo.id)) !== null &&
        (await podeVerConversaDoProjeto(gestor.id, projP.id)) &&
        !(await podeVerConversaDoProjeto(projetista.id, projP.id)),
    );

    // ── outro cliente e cliente inativo ─────────────────────────────────────────────────────
    const doOutroCliente = await conversaParaCliente(projP.id, contaB.id);
    const enviarOutroCliente = await motivoDe(() => enviar(projP.id, cliente(contaB), "oi"));
    const doInativo = await conversaParaCliente(projInativo.id, contaInativo.id);
    const enviarInativo = await motivoDe(() => enviar(projInativo.id, cliente(contaInativo), "oi"));
    const internoComoCliente = await motivoDe(() => enviar(projP.id, cliente(coord), "oi"));
    check(
      "[cliente] conta de outro cliente e de cliente inativo: leitura nula e escrita 'Conversa não encontrada.'; interno não escreve como cliente",
      doOutroCliente === null &&
        enviarOutroCliente === MOTIVO_NAO_ENCONTRADA &&
        doInativo === null &&
        enviarInativo === MOTIVO_NAO_ENCONTRADA &&
        internoComoCliente === MOTIVO_NAO_ENCONTRADA &&
        (await prisma.conversaPortal.count({ where: { projetoId: projInativo.id } })) === 0 &&
        (await contasDoClienteDoProjeto(projInativo.id)).length === 0,
    );

    // ── sem coordenador: os globais ─────────────────────────────────────────────────────────
    const mSem = await enviar(projSemCoord.id, cliente(contaA2), "Quando sai a próxima entrega?");
    limpar();
    await avisarMensagemNova(mSem.mensagemId, deps);
    check(
      globais.length === 0
        ? "[avisos] projeto sem coordenador: o gestor global recebe; projetista e o autor não"
        : "[avisos] projeto sem ninguém da coordenação na equipe: o Coordenador de escopo global (o banco tem) recebe, não o gestor; projetista e o autor não",
      (globais.length === 0
        ? sinosDe(gestor.id) === 1 && emailsPara(gestor.email) === 1
        : globais.every((id) => sinosDe(id) === 1) && sinosDe(gestor.id) === 0) &&
        sinosDe(projetista.id) === 0 &&
        sinosDe(contaA2.id) === 0,
    );

    // ── dez mensagens da equipe = um e-mail por conta ───────────────────────────────────────
    limpar();
    let ultimaEquipe: { mensagemId: string } | null = null;
    for (let i = 0; i < 10; i += 1) {
      ultimaEquipe = await enviar(projP.id, equipe(coord), `Resposta ${i + 1}`);
      await avisarMensagemNova(ultimaEquipe.mensagemId, deps);
    }
    check(
      "[e-mail] dez mensagens da equipe: dez sinos e UM e-mail por conta do cliente; o autor nunca",
      sinosDe(contaA1.id) === 10 &&
        sinosDe(contaA2.id) === 10 &&
        sinos.find((s) => s.userId === contaA1.id)?.categoria === null &&
        sinos.find((s) => s.userId === contaA1.id)?.href === `/portal/${projP.id}#mensagens` &&
        emailsPara(contaA1.email) === 1 &&
        emailsPara(contaA2.email) === 1 &&
        emails.every((e) => e.slug === "portal-mensagem-equipe" && e.vars.nome === "Mariana") &&
        sinosDe(coord.id) === 0 &&
        emailsPara(coord.email) === 0,
    );

    // Abrir a conversa marca lida até a última mensagem CARREGADA (a criadaEm dela, não "agora").
    const vistaA1 = await conversaParaCliente(projP.id, contaA1.id);
    const ultimaCarregada = vistaA1?.mensagens.at(-1);
    await marcarLida({ projetoId: projP.id, userId: contaA1.id, ate: new Date(ultimaCarregada?.criadaEm ?? 0) });
    const vistaA1Depois = await conversaParaCliente(projP.id, contaA1.id);
    limpar();
    const m11 = await enviar(projP.id, equipe(coord), "Mais uma");
    await avisarMensagemNova(m11.mensagemId, deps);
    check(
      "[e-mail] depois de ler (até a última carregada), a próxima mensagem gera outro e-mail; quem não leu não recebe",
      vistaA1?.naoLidas === 10 &&
        vistaA1Depois?.naoLidas === 0 &&
        emailsPara(contaA1.email) === 1 &&
        emailsPara(contaA2.email) === 0 &&
        sinosDe(contaA2.id) === 1,
    );

    // marcarLida nunca recua e não passa de agora.
    const antesRecuo = await prisma.leituraConversaPortal.findUniqueOrThrow({
      where: { conversaId_userId: { conversaId: m1.conversaId, userId: contaA1.id } },
    });
    await marcarLida({ projetoId: projP.id, userId: contaA1.id, ate: new Date(2000, 0, 1) });
    const depoisRecuo = await prisma.leituraConversaPortal.findUniqueOrThrow({
      where: { conversaId_userId: { conversaId: m1.conversaId, userId: contaA1.id } },
    });
    const futuro = new Date(Date.now() + 365 * 86_400_000);
    await marcarLida({ projetoId: projP.id, userId: contaA2.id, ate: futuro });
    const leituraA2 = await prisma.leituraConversaPortal.findUniqueOrThrow({
      where: { conversaId_userId: { conversaId: m1.conversaId, userId: contaA2.id } },
    });
    check(
      "[leitura] marcarLida nunca recua lidaAte e um 'ate' no futuro vira agora",
      depoisRecuo.lidaAte?.getTime() === antesRecuo.lidaAte?.getTime() &&
        leituraA2.lidaAte !== null &&
        leituraA2.lidaAte.getTime() <= Date.now(),
    );

    // ── opt-out do cliente: e-mail cai, sino fica ───────────────────────────────────────────
    await definirAvisoPortalMensagem(contaA2.id, false);
    limpar();
    const mOpt = await enviar(projP.id, equipe(coord), "Combinado: fachada em cinza.");
    await avisarMensagemNova(mOpt.mensagemId, deps);
    check(
      "[opt-out] 'portal_mensagem' desligado: a conta perde o e-mail e mantém o sino",
      sinosDe(contaA2.id) === 1 && emailsPara(contaA2.email) === 0,
    );

    // ── opt-out da equipe: sino e e-mail caem ───────────────────────────────────────────────
    await marcarLida({ projetoId: projP.id, userId: coord.id, ate: new Date() });
    await prisma.userPreference.upsert({
      where: { userId: coord.id },
      create: { userId: coord.id, dados: { notif_mensagem_cliente: false } },
      update: { dados: { notif_mensagem_cliente: false } },
    });
    limpar();
    const mOptEquipe = await enviar(projP.id, cliente(contaA1), "Ok, obrigada.");
    await avisarMensagemNova(mOptEquipe.mensagemId, deps);
    check(
      "[opt-out] 'mensagem_cliente' desligado: o coordenador perde sino e e-mail (e continua recebendo o evento da tela)",
      sinosDe(coord.id) === 0 && emailsPara(coord.email) === 0 && emitidoPara(coord.id),
    );

    // ── duas mensagens simultâneas na primeira conversa ─────────────────────────────────────
    limpar();
    const [c1, c2] = await Promise.all([
      enviar(projCorrida.id, cliente(contaA1), "Primeira ao mesmo tempo"),
      enviar(projCorrida.id, cliente(contaA2), "Segunda ao mesmo tempo"),
    ]);
    await Promise.all([avisarMensagemNova(c1.mensagemId, deps), avisarMensagemNova(c2.mensagemId, deps)]);
    const convCorrida = await prisma.conversaPortal.findMany({ where: { projetoId: projCorrida.id } });
    const msgsCorrida = await prisma.mensagemPortal.findMany({
      where: { conversaId: { in: convCorrida.map((c) => c.id) } },
      orderBy: { criadaEm: "desc" },
    });
    check(
      "[corrida] duas mensagens ao mesmo tempo: uma conversa, última = a mais recente, e o coordenador recebe UM e-mail (dois sinos)",
      convCorrida.length === 1 &&
        c1.conversaId === c2.conversaId &&
        msgsCorrida.length === 2 &&
        convCorrida[0].ultimaMensagemEm?.getTime() === msgsCorrida[0].criadaEm.getTime() &&
        convCorrida[0].ultimoLado === msgsCorrida[0].lado &&
        emailsPara(coordCorrida.email) === 1 &&
        sinosDe(coordCorrida.id) === 2,
    );

    // ── decisão ─────────────────────────────────────────────────────────────────────────────
    const marcar1 = await motivoDe(() => marcarDecisao({ mensagemId: mOpt.mensagemId, userId: gestor.id, resumo: "  Fachada em cinza  " }));
    const marcar2 = await motivoDe(() => marcarDecisao({ mensagemId: mOpt.mensagemId, userId: coord.id, resumo: null }));
    const marcarProjetista = await motivoDe(() => marcarDecisao({ mensagemId: m1.mensagemId, userId: projetista.id, resumo: null }));
    const marcarCliente = await motivoDe(() => marcarDecisao({ mensagemId: m1.mensagemId, userId: contaA1.id, resumo: null }));
    const desmarcarProjetista = await motivoDe(() => desmarcarDecisao({ mensagemId: mOpt.mensagemId, userId: projetista.id }));
    const vistaEquipe = await conversaParaEquipe(projP.id, coord.id);
    const vistaCliente = await conversaParaCliente(projP.id, contaA1.id);
    const decisaoNaEquipe = vistaEquipe?.mensagens.find((m) => m.id === mOpt.mensagemId)?.decisao;
    const decisaoNoPortal = vistaCliente?.mensagens.find((m) => m.id === mOpt.mensagemId)?.decisao;
    check(
      "[decisão] marca (resumo aparado), marcar de novo recusa, projetista e cliente não marcam nem desmarcam",
      marcar1 === null &&
        marcar2 === MOTIVO_DECISAO_JA_MARCADA &&
        marcarProjetista === MOTIVO_NAO_ENCONTRADA &&
        marcarCliente === MOTIVO_NAO_ENCONTRADA &&
        desmarcarProjetista === MOTIVO_NAO_ENCONTRADA &&
        decisaoNaEquipe?.resumo === "Fachada em cinza" &&
        decisaoNaEquipe.marcadaPor === gestor.name &&
        vistaEquipe?.decisoes.length === 1 &&
        vistaEquipe.decisoes[0].marcadaPor === gestor.name,
    );
    check(
      "[decisão] portal mostra 'Registrada pela coordenação' e o resumo, sem o nome de quem marcou em lugar nenhum",
      decisaoNoPortal?.marcadaPor === ROTULO_DECISAO_PORTAL &&
        decisaoNoPortal.resumo === "Fachada em cinza" &&
        vistaCliente?.decisoes.length === 1 &&
        vistaCliente.decisoes[0].marcadaPor === ROTULO_DECISAO_PORTAL &&
        vistaCliente.decisoes[0].trecho.startsWith("Combinado") &&
        !JSON.stringify(vistaCliente).includes(gestor.name),
    );
    const desmarcar1 = await motivoDe(() => desmarcarDecisao({ mensagemId: mOpt.mensagemId, userId: coord.id }));
    const desmarcar2 = await motivoDe(() => desmarcarDecisao({ mensagemId: mOpt.mensagemId, userId: coord.id }));
    const remarcar = await motivoDe(() => marcarDecisao({ mensagemId: mOpt.mensagemId, userId: coord.id, resumo: "" }));
    const historico = await prisma.decisaoMensagemPortal.findMany({ where: { mensagemId: mOpt.mensagemId } });
    const vistaDepois = await conversaParaEquipe(projP.id, coord.id);
    check(
      "[decisão] desmarca, desmarcar de novo recusa, marca de novo: histórico com 2 linhas, 1 removida (com quem e quando), uma ativa",
      desmarcar1 === null &&
        desmarcar2 === MOTIVO_DECISAO_NAO_MARCADA &&
        remarcar === null &&
        historico.length === 2 &&
        historico.filter((h) => h.removidaEm !== null && h.removidaPorId === coord.id).length === 1 &&
        historico.filter((h) => h.removidaEm === null).length === 1 &&
        vistaDepois?.decisoes.length === 1 &&
        vistaDepois.decisoes[0].resumo === null,
    );

    // ── lista da equipe ─────────────────────────────────────────────────────────────────────
    const listaCoord = await conversasDaEquipe(coord.id, { soMinhas: true });
    const listaGestor = await conversasDaEquipe(gestor.id, { soMinhas: false });
    const listaProjetista = await conversasDaEquipe(projetista.id, { soMinhas: false });
    const doGestorSem = listaGestor.find((c) => c.projetoId === projSemCoord.id);
    const primeiraRespondida = listaGestor.findIndex((c) => !c.aguardando);
    check(
      "[lista] coordenador vê só o seu projeto; gestor vê os três, aguardando primeiro; projetista não vê nenhum",
      listaCoord.length === 1 &&
        listaCoord[0].projetoId === projP.id &&
        listaCoord[0].aguardando &&
        listaCoord[0].codigo === projP.codigo &&
        doGestorSem?.aguardando === true &&
        doGestorSem.naoLidas === 1 &&
        listaGestor.some((c) => c.projetoId === projP.id) &&
        (primeiraRespondida === -1 || listaGestor.slice(primeiraRespondida).every((c) => !c.aguardando)) &&
        listaGestor.filter((c) => c.projetoId === projCorrida.id).length === 1 &&
        listaProjetista.every((c) => ![projP.id, projSemCoord.id, projCorrida.id].includes(c.projetoId)),
    );

    // ── anexos ──────────────────────────────────────────────────────────────────────────────
    const doCliente = await enviar(projP.id, cliente(contaA1), "Segue a planta com as mudanças.", true);
    const anexar = (mensagemId: string, userId: string, nome = "planta.pdf") =>
      gravarAnexo({ mensagemId, userId, caminho: `portal/mensagens/smoke/${tag}/${nome}`, nome, tamanho: 1234, tipo: "application/pdf" });
    const primeiro = await anexar(doCliente.mensagemId, contaA1.id);
    const deOutraConta = await motivoDe(() => anexar(doCliente.mensagemId, contaA2.id));
    const daEquipeNoCliente = await motivoDe(() => anexar(doCliente.mensagemId, coord.id));
    const tipoErrado = await motivoDe(() => anexar(doCliente.mensagemId, contaA1.id, "virus.exe"));
    for (let i = 0; i < 3; i += 1) await anexar(doCliente.mensagemId, contaA1.id, `folha-${i}.pdf`);
    // Quatro gravados: dois ao mesmo tempo disputam o quinto — a trava da mensagem deixa passar um.
    const corridaAnexo = await Promise.all([
      motivoDe(() => anexar(doCliente.mensagemId, contaA1.id, "corrida-1.pdf")),
      motivoDe(() => anexar(doCliente.mensagemId, contaA1.id, "corrida-2.pdf")),
    ]);
    const sexto = await motivoDe(() => anexar(doCliente.mensagemId, contaA1.id, "sexto.pdf"));
    const anexosGravados = await prisma.anexoMensagemPortal.count({ where: { mensagemId: doCliente.mensagemId } });
    check(
      "[anexo] autor anexa; outra conta, a equipe e tipo fora da lista recusam; dois ao mesmo tempo no quinto = um; sexto recusa",
      typeof primeiro.anexoId === "string" &&
        deOutraConta === MOTIVO_NAO_ENCONTRADA &&
        daEquipeNoCliente === MOTIVO_NAO_ENCONTRADA &&
        tipoErrado === MOTIVO_TIPO_ANEXO &&
        corridaAnexo.filter((m) => m === null).length === 1 &&
        corridaAnexo.filter((m) => m === MOTIVO_ANEXOS_MAX).length === 1 &&
        sexto === MOTIVO_ANEXOS_MAX &&
        anexosGravados === 5,
    );
    const semAnexos = await enviar(projP.id, cliente(contaA1), "Sem arquivo.");
    const emSemAnexos = await motivoDe(() => anexar(semAnexos.mensagemId, contaA1.id));
    // Mensagem de 16 minutos atrás (criada direto no banco só para o teste da janela).
    const criadaVelha = new Date(Date.now() - 16 * 60_000);
    const velha = await prisma.mensagemPortal.create({
      data: {
        conversaId: doCliente.conversaId,
        autorId: contaA1.id,
        autorNome: contaA1.name,
        lado: "cliente",
        texto: "Antiga",
        comAnexos: true,
        criadaEm: criadaVelha,
      },
      select: { id: true },
    });
    const foraDaJanela = await motivoDe(() => anexar(velha.id, contaA1.id));
    // A rota mede a janela no COMEÇO da requisição (`agora`): o envio que começou no minuto 10 entra, mesmo que o corpo
    // termine de chegar depois dos 15 minutos.
    const comecouNoPrazo = new Date(criadaVelha.getTime() + 10 * 60_000);
    const portaNoPrazo = await motivoDe(() => exigirMensagemAnexavel({ mensagemId: velha.id, userId: contaA1.id, agora: comecouNoPrazo }));
    const gravouNoPrazo = await motivoDe(() =>
      gravarAnexo({
        mensagemId: velha.id,
        userId: contaA1.id,
        caminho: `portal/mensagens/smoke/${tag}/lento.pdf`,
        nome: "lento.pdf",
        tamanho: 1234,
        tipo: "application/pdf",
        agora: comecouNoPrazo,
      }),
    );
    check(
      "[anexo] janela medida no começo da requisição: começou no minuto 10, entra (porta e gravação sob a trava)",
      portaNoPrazo === null && gravouNoPrazo === null,
    );
    const daEquipe = await enviar(projP.id, equipe(coord), "Segue o detalhe.", true);
    const anexoEquipe = await motivoDe(() => anexar(daEquipe.mensagemId, coord.id, "detalhe.png"));
    const projetistaNaEquipe = await motivoDe(() => anexar(daEquipe.mensagemId, projetista.id));
    const inexistente = await motivoDe(() => anexar("nao-existe", contaA1.id));
    check(
      "[anexo] mensagem sem anexos e mensagem inexistente = 'não encontrada'; fora da janela de 15 min recusa; coordenador anexa à própria; projetista não",
      emSemAnexos === MOTIVO_NAO_ENCONTRADA &&
        inexistente === MOTIVO_NAO_ENCONTRADA &&
        foraDaJanela === MOTIVO_JANELA_ANEXO &&
        anexoEquipe === null &&
        projetistaNaEquipe === MOTIVO_NAO_ENCONTRADA,
    );
    const quem = (u: { id: string; tipo: "interno" | "externo" }) =>
      anexoParaUsuario(primeiro.anexoId, { id: u.id, tipo: u.tipo, mustChangePassword: false });
    const baixa = {
      coord: await quem({ id: coord.id, tipo: "interno" }),
      gestor: await quem({ id: gestor.id, tipo: "interno" }),
      contaA1: await quem({ id: contaA1.id, tipo: "externo" }),
      contaA2: await quem({ id: contaA2.id, tipo: "externo" }),
      projetista: await quem({ id: projetista.id, tipo: "interno" }),
      coordOutro: await quem({ id: coordOutro.id, tipo: "interno" }),
      perfilSemVer: await quem({ id: perfilSemVer.id, tipo: "interno" }),
      contaB: await quem({ id: contaB.id, tipo: "externo" }),
      contaInativo: await quem({ id: contaInativo.id, tipo: "externo" }),
      // Conta externa que se diz interna (e o contrário) não passa pela porta do outro lado.
      contaComoInterno: await quem({ id: contaA1.id, tipo: "interno" }),
      coordComoExterno: await quem({ id: coord.id, tipo: "externo" }),
    };
    const inexistenteBaixa = await anexoParaUsuario("nao-existe", { id: coord.id, tipo: "interno", mustChangePassword: false });
    // Troca de senha pendente: pela sessão e pelo banco (sessão velha que ainda diz que não).
    const trocaNaSessao = await anexoParaUsuario(primeiro.anexoId, { id: contaA1.id, tipo: "externo", mustChangePassword: true });
    await prisma.user.update({ where: { id: contaA2.id }, data: { mustChangePassword: true } });
    const trocaNoBanco = await anexoParaUsuario(primeiro.anexoId, { id: contaA2.id, tipo: "externo", mustChangePassword: false });
    await prisma.user.update({ where: { id: contaA2.id }, data: { mustChangePassword: false } });
    check(
      "[anexo] conta externa com troca de senha pendente (na sessão ou no banco) recebe null",
      trocaNaSessao === null && trocaNoBanco === null,
    );
    check(
      "[anexo] baixar: coordenador, gestor global e as contas do cliente recebem o caminho; projetista, outro coordenador, perfil sem ver, outro cliente e inativo recebem null",
      [baixa.coord, baixa.gestor, baixa.contaA1, baixa.contaA2].every(
        (b) => b?.caminho === `portal/mensagens/smoke/${tag}/planta.pdf` && b.nome === "planta.pdf" && b.tipo === "application/pdf",
      ) &&
        [baixa.projetista, baixa.coordOutro, baixa.perfilSemVer, baixa.contaB, baixa.contaInativo, baixa.contaComoInterno, baixa.coordComoExterno].every(
          (b) => b === null,
        ) &&
        inexistenteBaixa === null,
    );

    // ── e-mail que falha devolve a reserva ──────────────────────────────────────────────────
    const depsFalha: AvisarMensagem = { ...deps, enviarEmail: async () => false };
    limpar();
    const mFalha = await enviar(projQ.id, equipe(coordOutro), "Primeira do projeto Q.");
    await avisarMensagemNova(mFalha.mensagemId, depsFalha);
    const leituraFalha = await prisma.leituraConversaPortal.findUnique({
      where: { conversaId_userId: { conversaId: mFalha.conversaId, userId: contaA1.id } },
      select: { emailAvisadoEm: true },
    });
    limpar();
    const mDepois = await enviar(projQ.id, equipe(coordOutro), "Segunda do projeto Q.");
    await avisarMensagemNova(mDepois.mensagemId, deps);
    check(
      "[e-mail] envio que devolve false libera a reserva (emailAvisadoEm volta a nulo) e a próxima mensagem e-maila de novo",
      leituraFalha !== null && leituraFalha.emailAvisadoEm === null && emailsPara(contaA1.email) === 1,
    );

    // ── a aba Cliente diz quando ninguém do cliente lê ──────────────────────────────────────
    const leP = await conversaParaEquipe(projP.id, coord.id);
    const leInativo = await conversaParaEquipe(projInativo.id, gestor.id);
    const leSemConta = await conversaParaEquipe(projSemConta.id, gestor.id);
    check(
      "[equipe] clienteLe: projeto com conta ativa do cliente sim; cliente inativo e cliente sem conta do portal não",
      leP?.clienteLe === true && leInativo?.clienteLe === false && leSemConta?.clienteLe === false,
    );

    // ── texto vazio ─────────────────────────────────────────────────────────────────────────
    const vazio = await motivoDe(() => enviar(projP.id, cliente(contaA1), "   ", false));
    const vazioComAnexo = await motivoDe(() => enviar(projP.id, cliente(contaA1), "   ", true));
    check(
      "[texto] vazio sem anexo recusa; vazio com anexo passa",
      vazio === MOTIVO_TEXTO_VAZIO && vazioComAnexo === null,
    );
  } finally {
    const remover = async (rotulo: string, id: string, apagar: () => Promise<unknown>) => {
      try {
        await apagar();
      } catch (e) {
        console.error(`[limpeza] não removeu ${rotulo} ${id}:`, e);
      }
    };
    // O projeto leva conversa, mensagens, leituras, decisões e membros (cascade).
    for (const id of projetos) await remover("projeto", id, () => prisma.projeto.delete({ where: { id } }));
    for (const id of usuarios) await remover("usuário", id, () => prisma.user.delete({ where: { id } }));
    for (const id of clientes) await remover("cliente", id, () => prisma.cliente.delete({ where: { id } }));
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
