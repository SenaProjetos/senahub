/**
 * Smoke do "Esqueci minha senha" por link no e-mail, contra o banco de dev.
 *
 * Verifica o que o vitest não alcança (better-auth + banco): pedir o link pelo endpoint grava o
 * token e, sem SMTP, avisa os admins; e-mail desconhecido não grava nada; o link vai para
 * APP_URL/redefinir-senha; a trava por pessoa apaga o token excedente; acesso encerrado não
 * recebe; salvar a senha pelo link troca a senha, tira a troca obrigatória, derruba as sessões,
 * invalida os outros links e resolve o pedido; o mesmo link não serve duas vezes; o reset pelo
 * admin invalida links pendentes; a trava por IP. Cria um usuário descartável e apaga no fim.
 *
 * Uso: npm run smoke:redefinir-senha
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";

// Sem SMTP: o envio real devolve false (caminho do aviso aos admins). O caminho de sucesso usa um
// enviador falso passado ao serviço.
delete process.env.SMTP_HOST;

import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";
import { criarUsuarioComCredencial, resetarSenha } from "../src/lib/auth-admin";
import {
  enviarLinkPeloAdmin,
  enviarLinkDeRedefinicao,
  limitarGravacaoPorIp,
  limitarPedidoPorIp,
  linkDeRedefinicaoValido,
} from "../src/modules/auth/redefinir-senha-service";
import {
  MAX_GRAVACOES_POR_IP,
  MAX_LINKS_POR_PESSOA,
  MAX_LINKS_POR_PESSOA_E_IP,
  MAX_PEDIDOS_POR_IP,
  MOTIVO_LINK_CONTA_INATIVA,
  MOTIVO_LINK_FALHOU,
  MOTIVO_LINK_MUITOS,
  MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA,
  MOTIVO_LINK_SEM_ENDERECO,
  PREFIXO_TOKEN,
} from "../src/modules/auth/redefinir-senha";

let ok = true;
const check = (nome: string, cond: boolean) => {
  console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
  if (!cond) ok = false;
};

const novoToken = () => randomBytes(18).toString("base64url");

async function gravarToken(userId: string, opts: { expirado?: boolean } = {}): Promise<string> {
  const token = novoToken();
  await prisma.verification.create({
    data: {
      identifier: `${PREFIXO_TOKEN}${token}`,
      value: userId,
      expiresAt: new Date(Date.now() + (opts.expirado ? -60_000 : 3_600_000)),
    },
  });
  return token;
}

const tokensDe = (userId: string) =>
  prisma.verification.count({ where: { identifier: { startsWith: PREFIXO_TOKEN }, value: userId } });

async function esperar<T>(fn: () => Promise<T | null>, ms = 5000): Promise<T | null> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function main() {
  const tag = `smkreset${Date.now()}`;
  const email = `${tag}@exemplo.test`;
  const ipBase = `203.0.113.${Math.floor(Math.random() * 200)}`;
  const [ipA, ipB, ipC, ipD, ipE] = ["a", "b", "c", "d", "e"].map((s) => `${ipBase}-${s}`);
  const { id: userId, senhaTemporaria } = await criarUsuarioComCredencial({
    name: `Smoke Reset ${tag}`,
    email,
    tipo: "interno",
  });
  const ctx = await auth.$context;
  const senhaGravada = async () =>
    (await prisma.account.findFirstOrThrow({ where: { userId, providerId: "credential" } })).password!;

  try {
    // 1. Pedido pelo endpoint (sem SMTP): token gravado, envio falha, admins avisados.
    await auth.api.requestPasswordReset({ body: { email } });
    const auditEnvio = await esperar(() =>
      prisma.auditLog.findFirst({ where: { userId, acao: "enviar-link-nova-senha" } }),
    );
    check("pedido pelo endpoint grava 1 token", (await tokensDe(userId)) === 1);
    check("sem SMTP o envio é registrado como falha", auditEnvio?.resultado === "falha");
    // O envio roda solto (sem await no better-auth): o aviso sai depois da auditoria.
    const aviso = await esperar(() =>
      prisma.notificacao.findFirst({
        where: { titulo: "Link de nova senha não foi enviado", corpo: { contains: email } },
      }),
    );
    check("sem SMTP os admins são avisados", aviso !== null);

    // 2. E-mail desconhecido: mesma resposta, nada gravado.
    const antes = await prisma.verification.count({ where: { identifier: { startsWith: PREFIXO_TOKEN } } });
    const r = await auth.api.requestPasswordReset({ body: { email: `nao-existe-${tag}@exemplo.test` } });
    const depois = await prisma.verification.count({ where: { identifier: { startsWith: PREFIXO_TOKEN } } });
    check("e-mail desconhecido responde igual e não grava token", r.status === true && antes === depois);

    // 3. Caminho de sucesso com enviador falso: link na origem pública, variáveis do modelo.
    const enviados: { to: string; slug: string; vars: Record<string, unknown> }[] = [];
    const falso = async (to: string, slug: string, vars: Record<string, unknown>) => {
      enviados.push({ to, slug, vars });
      return true;
    };
    const t2 = await gravarToken(userId);
    const res2 = await enviarLinkDeRedefinicao({ userId, token: t2, ip: ipA }, falso);
    const link = String(enviados[0]?.vars.link ?? "");
    check("link enviado", res2 === "enviado" && enviados[0]?.to === email);
    check("modelo redefinir-senha com nome e validade", enviados[0]?.slug === "redefinir-senha" && enviados[0]?.vars.nome === "Smoke" && enviados[0]?.vars.validade === "1 hora");
    check(
      "link aponta para APP_URL/redefinir-senha com o token",
      link === `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/redefinir-senha?token=${t2}`,
    );

    // 4. Cota por pessoa+IP: o mesmo IP manda 3; o 4º é barrado e o token some; outro IP (a própria
    //    pessoa) ainda recebe — quem conhece o e-mail não consegue impedir o dono de receber.
    for (let i = 2; i <= MAX_LINKS_POR_PESSOA_E_IP; i++) {
      check(`${i}º link do mesmo IP sai`, (await enviarLinkDeRedefinicao({ userId, token: await gravarToken(userId), ip: ipA }, falso)) === "enviado");
    }
    const t4 = await gravarToken(userId);
    check("link além da cota do IP é barrado", (await enviarLinkDeRedefinicao({ userId, token: t4, ip: ipA }, falso)) === "limite");
    check("token barrado é apagado", !(await linkDeRedefinicaoValido(t4)));
    check("barrado não envia e-mail", enviados.length === MAX_LINKS_POR_PESSOA_E_IP);
    check("de outro IP a pessoa ainda recebe", (await enviarLinkDeRedefinicao({ userId, token: await gravarToken(userId), ip: ipB }, falso)) === "enviado");

    // 4b. Teto da pessoa somando IPs.
    const extras = MAX_LINKS_POR_PESSOA - (await tokensDe(userId));
    for (let i = 0; i < extras; i++) await gravarToken(userId);
    const tTeto = await gravarToken(userId);
    check("teto da pessoa (todos os IPs) barra", (await enviarLinkDeRedefinicao({ userId, token: tTeto, ip: ipC }, falso)) === "limite");
    const envioAposTeto = enviados.length;

    // 4c. Sem APP_URL: não sai link relativo; admins não recebem um segundo aviso no mesmo dia.
    const appUrl = process.env.APP_URL;
    delete process.env.APP_URL;
    await prisma.verification.deleteMany({ where: { value: userId, identifier: { startsWith: PREFIXO_TOKEN } } });
    const avisosAntes = await prisma.notificacao.count({ where: { corpo: { contains: email } } });
    const semUrl = await enviarLinkDeRedefinicao({ userId, token: await gravarToken(userId), ip: ipC }, falso);
    process.env.APP_URL = appUrl;
    check("sem APP_URL o envio falha sem chamar o e-mail", semUrl === "falhou" && enviados.length === envioAposTeto);
    check(
      "aviso aos admins não repete no mesmo dia",
      (await prisma.notificacao.count({ where: { corpo: { contains: email } } })) === avisosAntes,
    );

    // 5. Validade do link na tela (as cotas acima já apagaram os tokens anteriores).
    const tLink = await gravarToken(userId);
    await gravarToken(userId); // outro link pendente, que a troca deve invalidar
    check("link válido abre o formulário", await linkDeRedefinicaoValido(tLink));
    const vencido = await gravarToken(userId, { expirado: true });
    check("link vencido não abre", !(await linkDeRedefinicaoValido(vencido)));
    check("token malformado não abre", !(await linkDeRedefinicaoValido("x'; --")));

    // 6. Salvar a senha pelo link.
    const sessaoToken = novoToken();
    await prisma.session.create({
      data: { userId, token: sessaoToken, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await prisma.solicitacaoResetSenha.create({ data: { email, userId } });
    const novaSenha = `Nova-${tag}`;
    await auth.api.resetPassword({ body: { token: tLink, newPassword: novaSenha } });
    const hash = await senhaGravada();
    check("senha nova vale", await ctx.password.verify({ hash, password: novaSenha }));
    check("senha temporária deixou de valer", !(await ctx.password.verify({ hash, password: senhaTemporaria })));
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    check("troca obrigatória desligada", u.mustChangePassword === false);
    check("sessões derrubadas", (await prisma.session.count({ where: { userId } })) === 0);
    check("outros links da pessoa invalidados", (await tokensDe(userId)) === 0);
    check(
      "pedido de reset resolvido",
      (await prisma.solicitacaoResetSenha.count({ where: { userId, resolvida: false } })) === 0,
    );
    check(
      "troca auditada",
      (await prisma.auditLog.count({ where: { userId, acao: "redefinir-senha-por-link" } })) === 1,
    );

    // 7. O mesmo link não serve duas vezes.
    let reusoRecusado = false;
    try {
      await auth.api.resetPassword({ body: { token: tLink, newPassword: "Outra-senha-123" } });
    } catch {
      reusoRecusado = true;
    }
    check("link usado é recusado", reusoRecusado && (await ctx.password.verify({ hash: await senhaGravada(), password: novaSenha })));

    // 8. Acesso encerrado não recebe link.
    await prisma.verification.deleteMany({ where: { value: userId } });
    await prisma.user.update({ where: { id: userId }, data: { ativo: false } });
    const tb = await gravarToken(userId);
    const antesB = enviados.length;
    const resB = await enviarLinkDeRedefinicao({ userId, token: tb, ip: ipB }, falso);
    check("usuário desativado: bloqueado, sem e-mail, token apagado", resB === "bloqueado" && enviados.length === antesB && !(await linkDeRedefinicaoValido(tb)));
    await prisma.user.update({ where: { id: userId }, data: { ativo: true } });

    // 9. Reset pelo admin invalida link pendente.
    const ta = await gravarToken(userId);
    const senhaDoAdmin = await resetarSenha(userId);
    check("reset pelo admin invalida o link pendente", !(await linkDeRedefinicaoValido(ta)));

    // 9b. Admin manda o link pela tela de usuários (envio aguardado, motivo na recusa).
    const comSmtp = { smtpConfigurado: true, enviar: falso };
    const antesAdm = enviados.length;
    const adm = await enviarLinkPeloAdmin(userId, comSmtp);
    const linkAdm = String(enviados.at(-1)?.vars.link ?? "");
    const tokenAdm = new URL(linkAdm || "http://x/").searchParams.get("token");
    check("admin: link enviado e válido", adm.ok && enviados.length === antesAdm + 1 && (await linkDeRedefinicaoValido(tokenAdm)));
    check("admin: senha atual continua valendo até usar o link", await ctx.password.verify({ hash: await senhaGravada(), password: senhaDoAdmin }));
    // O token montado por nós precisa ser o que o better-auth consome (formato acoplado à versão).
    await auth.api.resetPassword({ body: { token: tokenAdm!, newPassword: `Admin-${tag}` } });
    check("admin: o link vale no better-auth (senha nova gravada)", await ctx.password.verify({ hash: await senhaGravada(), password: `Admin-${tag}` }));
    const lancou = await enviarLinkPeloAdmin(userId, { smtpConfigurado: true, enviar: async () => { throw new Error("modelo"); } });
    check("admin: envio que lança vira o motivo e não deixa token", !lancou.ok && lancou.motivo === MOTIVO_LINK_FALHOU && (await tokensDe(userId)) === 0);
    const semSmtp = await enviarLinkPeloAdmin(userId, { smtpConfigurado: false, enviar: falso });
    check("admin sem e-mail do sistema: recusa com o motivo", !semSmtp.ok && semSmtp.motivo === MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA);
    const urlGuardada = process.env.APP_URL;
    delete process.env.APP_URL;
    const semEndereco = await enviarLinkPeloAdmin(userId, comSmtp);
    process.env.APP_URL = urlGuardada;
    check("admin sem APP_URL: recusa com o motivo", !semEndereco.ok && semEndereco.motivo === MOTIVO_LINK_SEM_ENDERECO);
    const tokensAntesFalha = await tokensDe(userId);
    const falhou = await enviarLinkPeloAdmin(userId, { smtpConfigurado: true, enviar: async () => false });
    check("admin: e-mail que não sai recusa e não deixa token", !falhou.ok && falhou.motivo === MOTIVO_LINK_FALHOU && (await tokensDe(userId)) === tokensAntesFalha);
    for (let i = await tokensDe(userId); i < MAX_LINKS_POR_PESSOA; i++) await gravarToken(userId);
    const muitos = await enviarLinkPeloAdmin(userId, comSmtp);
    check("admin: teto da pessoa recusa com o motivo", !muitos.ok && muitos.motivo === MOTIVO_LINK_MUITOS);
    await prisma.verification.deleteMany({ where: { value: userId, identifier: { startsWith: PREFIXO_TOKEN } } });
    await prisma.user.update({ where: { id: userId }, data: { ativo: false } });
    const inativoAdm = await enviarLinkPeloAdmin(userId, comSmtp);
    await prisma.user.update({ where: { id: userId }, data: { ativo: true } });
    check("admin: conta desativada recusa com o motivo", !inativoAdm.ok && inativoAdm.motivo === MOTIVO_LINK_CONTA_INATIVA);

    // 10. Trava por IP do pedido (em memória, síncrona) e da gravação.
    let passaram = 0;
    for (let i = 0; i < MAX_PEDIDOS_POR_IP; i++) if (limitarPedidoPorIp(ipD).permitido) passaram++;
    check(`${MAX_PEDIDOS_POR_IP} pedidos do mesmo IP passam`, passaram === MAX_PEDIDOS_POR_IP);
    const barrado = limitarPedidoPorIp(ipD);
    check("pedido além do limite do IP é barrado (1º bloqueio marcado)", !barrado.permitido && barrado.primeiroBloqueio);
    check("outro IP segue livre", limitarPedidoPorIp(ipE).permitido);
    for (let i = 0; i < MAX_GRAVACOES_POR_IP; i++) limitarGravacaoPorIp(ipD);
    check("gravação além do limite do IP é barrada", !limitarGravacaoPorIp(ipD).permitido);
  } finally {
    await prisma.verification.deleteMany({ where: { value: userId, identifier: { startsWith: PREFIXO_TOKEN } } });
    await prisma.notificacao.deleteMany({ where: { corpo: { contains: email } } });
    await prisma.solicitacaoResetSenha.deleteMany({ where: { email: { contains: tag } } });
    await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }

  console.log(ok ? "\nSmoke redefinir-senha: tudo certo." : "\nSmoke redefinir-senha: FALHOU.");
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
