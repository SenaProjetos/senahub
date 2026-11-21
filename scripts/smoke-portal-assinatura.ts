/**
 * Smoke da assinatura de contrato pelo portal do cliente (spec
 * docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md) contra o banco de dev.
 *
 * Seção "miolo": o `assinarVersaoNoTx` que o Jurídico (`registrarAceite`) e o portal usam. Confere a trava do documento
 * (duas assinaturas simultâneas = uma transição e recebíveis uma vez), a idempotência por pessoa e o autor dos
 * recebíveis (o `autorFinanceiroId`, não quem assina).
 *
 * Seções "pedido" e "portal": o pedido de assinatura (`modules/portal/contratos/service.ts`) e as leituras do portal e do
 * Jurídico, sem SMTP — `notificar` e `enviarEmail` falsos gravam em listas. Recusas sem gravar, alçada em quem pede,
 * quem recebe o aviso, dois pedidos simultâneos, outro cliente, versão nova, duas contas assinando juntas, equipe ×
 * cliente ao mesmo tempo, cliente inativo, cancelar e o assinado que fica no portal.
 *
 * Apaga tudo o que criou (inclusive o PDF gravado no storage) e devolve o limite de alçada do banco como estava.
 *
 * Uso: npm run smoke:portal-assinatura
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";
import { rm } from "node:fs/promises";
import { removerArquivo, resolverCaminho, salvarArquivo } from "../src/lib/storage";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { assinarVersaoNoTx, hashDaVersao, type ResultadoAssinatura } from "../src/modules/juridico/assinatura/assinar-service";
import { comRetentativaDeConflito } from "../src/modules/juridico/assinatura/service";
import { CHAVE_LIMITE_APROVACAO_CONTRATO } from "../src/modules/juridico/config";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";
import { contaDoPortalParaCliente, type ContaDoPortal } from "../src/modules/portal/contratos/acesso";
import {
  assinarPedidoNoPortal,
  cancelarPedidoAssinatura,
  pedirAssinaturaNoPortal,
  type AvisarAssinatura,
} from "../src/modules/portal/contratos/service";
import { contratosDoPortal } from "../src/modules/portal/contratos/queries";
import { portalDosDocumentos } from "../src/modules/portal/contratos/equipe-queries";
import {
  MOTIVO_CANCELADO,
  MOTIVO_CLIENTE_INATIVO,
  MOTIVO_JA_ASSINADO,
  MOTIVO_JA_PEDIDO,
  MOTIVO_MUDOU,
  MOTIVO_NAO_AGUARDANDO,
  MOTIVO_NAO_CONTRATUAL,
  MOTIVO_NAO_ENCONTRADO,
  MOTIVO_NAO_PDF,
  MOTIVO_SEM_CONTA,
  MOTIVO_VERSAO_NAO_VIGENTE,
  MOTIVO_VERSAO_SUBSTITUIDA,
} from "../src/modules/portal/contratos/regras";

const PDF_MINIMO = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

async function main() {
  const tag = `SMKASSINATURA_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];
  const documentos: string[] = [];
  const arquivos: string[] = [];
  // Limite de alçada do banco antes do smoke: a seção "alçada" liga um limite e devolve este.
  const limiteAntes = await prisma.configSistema.findUnique({ where: { chave: CHAVE_LIMITE_APROVACAO_CONTRATO } });
  const devolverLimite = async () => {
    if (limiteAntes) {
      await prisma.configSistema.update({
        where: { chave: CHAVE_LIMITE_APROVACAO_CONTRATO },
        data: { valor: limiteAntes.valor as Prisma.InputJsonValue },
      });
    } else {
      await prisma.configSistema.deleteMany({ where: { chave: CHAVE_LIMITE_APROVACAO_CONTRATO } });
    }
  };

  const novoUsuario = async (sufixo: string) => {
    const u = await prisma.user.create({
      data: { name: `Assinante ${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "interno" },
    });
    usuarios.push(u.id);
    return u;
  };

  try {
    const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
    clientes.push(cliente.id);
    const projeto = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_proj`, clienteId: cliente.id },
      });
    });
    projetos.push(projeto.id);

    const userA = await novoUsuario("a");
    const userB = await novoUsuario("b");
    const financeiro = await novoUsuario("fin");

    // ── Seção "miolo" ────────────────────────────────────────────────────────────────────────
    const primeiroVencimento = new Date();
    primeiroVencimento.setUTCHours(0, 0, 0, 0);
    primeiroVencimento.setUTCDate(primeiroVencimento.getUTCDate() + 30);
    const doc = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} contrato`,
        tipo: "contrato",
        statusContrato: "rascunho",
        clienteId: cliente.id,
        projetoId: projeto.id,
        valor: 1000,
        parcelas: 2,
        primeiroVencimento,
        formaCobranca: "por_data",
      },
    });
    documentos.push(doc.id);
    const caminho = `juridico/smoke_${tag}/v1.pdf`;
    await salvarArquivo(caminho, PDF_MINIMO);
    arquivos.push(caminho);
    const versao = await prisma.docJuridicoVersao.create({
      data: { documentoId: doc.id, numero: 1, arquivoPath: caminho, arquivoNome: "v1.pdf", autorId: userA.id },
    });

    const hash = await hashDaVersao(versao.id);
    const assinar = (ator: { id: string; name: string }) =>
      prisma.$transaction((tx) =>
        assinarVersaoNoTx(tx, {
          versaoId: versao.id,
          ator: { id: ator.id, nome: ator.name },
          autorFinanceiroId: financeiro.id,
          hashArquivo: hash,
          ip: "127.0.0.1",
          userAgent: "smoke",
        }),
      );

    const [rA, rB]: ResultadoAssinatura[] = await Promise.all([assinar(userA), assinar(userB)]);
    const aceites = await prisma.aceiteDocumento.count({ where: { versaoId: versao.id } });
    const docDepois = await prisma.documentoJuridico.findUniqueOrThrow({ where: { id: doc.id } });
    const parcelas = await prisma.lancamento.count({ where: { contratoId: doc.id, status: { not: "previsao" } } });
    const eventos = await prisma.eventoAssinatura.findMany({ where: { versaoId: versao.id }, orderBy: { sequencia: "asc" } });
    check(
      "[miolo] duas assinaturas simultâneas (usuários diferentes): dois aceites, uma transição, assinado, parcelas uma vez",
      aceites === 2 &&
        [rA, rB].filter((r) => r.transicao).length === 1 &&
        !rA.jaAssinado &&
        !rB.jaAssinado &&
        docDepois.statusContrato === "assinado" &&
        docDepois.assinadoEm != null &&
        parcelas === 2,
    );
    check(
      "[miolo] trilha encadeada: dois eventos 'assinado' em sequência 1 e 2",
      eventos.length === 2 && eventos.every((e) => e.tipo === "assinado") && eventos[0].sequencia === 1 && eventos[1].sequencia === 2,
    );

    const rDeNovo = await assinar(userA);
    const aceitesDeNovo = await prisma.aceiteDocumento.count({ where: { versaoId: versao.id } });
    check(
      "[miolo] mesma pessoa de novo: jaAssinado, sem transição, aceites continuam 2, mesmo aceite",
      rDeNovo.jaAssinado && !rDeNovo.transicao && aceitesDeNovo === 2 && rDeNovo.aceiteId === rA.aceiteId,
    );

    const lancs = await prisma.lancamento.findMany({ where: { contratoId: doc.id }, select: { autorId: true } });
    check(
      "[miolo] recebíveis com autor financeiro (não quem assinou)",
      lancs.length === 2 && lancs.every((l) => l.autorId === financeiro.id),
    );
    check(
      "[miolo] resultado traz o documento (forma, projeto, sem vínculo)",
      rA.documento.id === doc.id && rA.documento.projetoId === projeto.id && rA.documento.vinculoId === null && rA.documento.formaCobranca === "por_data",
    );

    // ── Seções "pedido" e "portal" ───────────────────────────────────────────────────────────
    // Um PDF só no storage, compartilhado por todas as versões que serão assinadas.
    const pdfComum = `juridico/smoke_${tag}/comum.pdf`;
    await salvarArquivo(pdfComum, PDF_MINIMO);
    arquivos.push(pdfComum);

    const sinos: { userId: string; titulo: string; corpo: string; href: string }[] = [];
    const emails: { to: string; slug: string; vars: Record<string, string> }[] = [];
    const deps: AvisarAssinatura = {
      notificar: async (userId, n) => {
        sinos.push({ userId, ...n });
      },
      enviarEmail: async (to, slug, vars) => {
        emails.push({ to, slug, vars });
        return true;
      },
    };
    const limparAvisos = () => {
      sinos.length = 0;
      emails.length = 0;
    };
    const motivoDe = async (f: () => Promise<unknown>): Promise<string | null> => {
      try {
        await f();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };

    const novoCliente = async (sufixo: string, ativo = true) => {
      const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}`, ativo } });
      clientes.push(c.id);
      return c;
    };
    const tipoTermo = tipoTermoPorTipo("externo");
    const novaConta = async (clienteId: string, sufixo: string, ativo = true) => {
      const u = await prisma.user.create({
        data: { name: `Mariana ${sufixo} Souza`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "externo", clienteId, ativo },
      });
      usuarios.push(u.id);
      await prisma.aceiteTermo.create({
        data: { userId: u.id, tipo: tipoTermo, versao: TERMOS[tipoTermo].versao, conteudoHash: `${tag}_hash` },
      });
      return u;
    };
    const novoDocumento = async (e: {
      clienteId: string;
      projetoId: string | null;
      tipo?: string;
      sufixo: string;
      valor?: number;
      porData?: boolean;
    }) => {
      const d = await prisma.documentoJuridico.create({
        data: {
          titulo: `${tag} ${e.sufixo}`,
          tipo: e.tipo ?? "contrato",
          statusContrato: (e.tipo ?? "contrato") === "contrato" ? "rascunho" : null,
          clienteId: e.clienteId,
          projetoId: e.projetoId,
          valor: e.valor ?? null,
          parcelas: e.porData ? 2 : null,
          primeiroVencimento: e.porData ? primeiroVencimento : null,
          formaCobranca: "por_data",
        },
      });
      documentos.push(d.id);
      return d;
    };
    const novaVersao = (documentoId: string, numero: number, arquivoNome = `v${numero}.pdf`) =>
      prisma.docJuridicoVersao.create({
        data: { documentoId, numero, arquivoPath: pdfComum, arquivoNome, autorId: userA.id },
      });

    const cliA = await novoCliente("cliA");
    const cliB = await novoCliente("cliB");
    const cliSemConta = await novoCliente("semconta");
    const cliInativo = await novoCliente("inativo", false);
    const contaA1 = await novaConta(cliA.id, "a1");
    const contaA2 = await novaConta(cliA.id, "a2");
    const contaA3 = await novaConta(cliA.id, "a3", false);
    const contaB1 = await novaConta(cliB.id, "b1");
    await novaConta(cliInativo.id, "inat1");
    const projA = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({ data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_projA`, clienteId: cliA.id } });
    });
    projetos.push(projA.id);
    const socio = await novoUsuario("socio");
    const naoSocio = await novoUsuario("naosocio");
    const porSocio = { id: socio.id, nome: socio.name, superUsuario: false, ehSocio: true };
    const porNaoSocio = { id: naoSocio.id, nome: naoSocio.name, superUsuario: false, ehSocio: false };
    const pedir = (documentoId: string, versaoId: string, por = porSocio) =>
      pedirAssinaturaNoPortal({ documentoId, versaoId, por }, deps);
    const contaDoPortal = (u: { id: string; name: string }, clienteId: string): ContaDoPortal => ({
      userId: u.id,
      nome: u.name,
      clienteId,
    });
    const assinarPortal = (pedidoId: string, conta: ContaDoPortal) =>
      assinarPedidoNoPortal({ pedidoId, conta, ip: "127.0.0.1", userAgent: "smoke-portal" }, deps);
    const sessao = (u: { id: string }) => ({ id: u.id, tipo: "externo" as const, mustChangePassword: false });

    // [pedido] recusas sem gravar
    const procuracao = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, tipo: "procuracao", sufixo: "procuracao" });
    const vProc = await novaVersao(procuracao.id, 1);
    const docSemConta = await novoDocumento({ clienteId: cliSemConta.id, projetoId: null, sufixo: "semconta" });
    const vSemConta = await novaVersao(docSemConta.id, 1);
    const docInativo = await novoDocumento({ clienteId: cliInativo.id, projetoId: null, sufixo: "inativo" });
    const vInativo = await novaVersao(docInativo.id, 1);
    const docDuasVersoes = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, sufixo: "duasversoes" });
    const vAntiga = await novaVersao(docDuasVersoes.id, 1);
    await novaVersao(docDuasVersoes.id, 2);
    const docDocx = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, sufixo: "docx" });
    const vDocx = await novaVersao(docDocx.id, 1, "contrato.docx");
    const recusas = [
      await motivoDe(() => pedir(procuracao.id, vProc.id)),
      await motivoDe(() => pedir(docSemConta.id, vSemConta.id)),
      await motivoDe(() => pedir(docInativo.id, vInativo.id)),
      await motivoDe(() => pedir(docDuasVersoes.id, vAntiga.id)),
      await motivoDe(() => pedir(docDocx.id, vDocx.id)),
    ];
    const pedidosRecusados = await prisma.pedidoAssinaturaPortal.count({
      where: { documentoId: { in: [procuracao.id, docSemConta.id, docInativo.id, docDuasVersoes.id, docDocx.id] } },
    });
    check(
      "[pedido] recusas sem gravar: procuração, sem conta, cliente inativo, versão não vigente, .docx",
      recusas[0] === MOTIVO_NAO_CONTRATUAL &&
        recusas[1] === MOTIVO_SEM_CONTA &&
        recusas[2] === MOTIVO_CLIENTE_INATIVO &&
        recusas[3] === MOTIVO_VERSAO_NAO_VIGENTE &&
        recusas[4] === MOTIVO_NAO_PDF &&
        pedidosRecusados === 0 &&
        sinos.length === 0 &&
        emails.length === 0,
    );

    // [pedido] alçada: limite ligado só durante esta seção.
    const docAlcada = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, sufixo: "alcada", valor: 1000 });
    const vAlcada = await novaVersao(docAlcada.id, 1);
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_LIMITE_APROVACAO_CONTRATO },
      create: { chave: CHAVE_LIMITE_APROVACAO_CONTRATO, valor: 500 },
      update: { valor: 500 },
    });
    let pedidoAlcadaId = "";
    let resultadoAlcada: { avisadas: number; emails: number } | null = null;
    let recusaAlcada: string | null = null;
    try {
      recusaAlcada = await motivoDe(() => pedir(docAlcada.id, vAlcada.id, porNaoSocio));
      const r = await pedir(docAlcada.id, vAlcada.id, porSocio);
      pedidoAlcadaId = r.pedidoId;
      resultadoAlcada = r;
    } finally {
      await devolverLimite();
    }
    check(
      "[pedido] alçada: não-sócio recusado com a mensagem da alçada; sócio cria",
      !!recusaAlcada && recusaAlcada.includes("exige aprovação de um sócio") && pedidoAlcadaId !== "",
    );

    // [pedido] avisos
    const hrefProjA = `/portal/${projA.id}#contratos`;
    check(
      "[pedido] avisos: 2 sinos e 2 e-mails só para as contas ativas do cliente, com o nome do projeto",
      resultadoAlcada?.avisadas === 2 &&
        resultadoAlcada?.emails === 2 &&
        sinos.length === 2 &&
        new Set(sinos.map((s) => s.userId)).size === 2 &&
        sinos.every((s) => [contaA1.id, contaA2.id].includes(s.userId) && s.href === hrefProjA) &&
        emails.length === 2 &&
        emails.every(
          (e) =>
            e.slug === "portal-contrato-assinatura" &&
            e.vars.projeto === projA.nome &&
            e.vars.documento === docAlcada.titulo &&
            e.vars.nome === "Mariana" &&
            e.vars.url.endsWith(hrefProjA),
        ) &&
        !emails.some((e) => e.to === contaA3.email),
    );
    limparAvisos();
    const docSemProjeto = await novoDocumento({ clienteId: cliA.id, projetoId: null, sufixo: "semprojeto" });
    const vSemProjeto = await novaVersao(docSemProjeto.id, 1);
    const pSemProjeto = await pedir(docSemProjeto.id, vSemProjeto.id);
    check(
      "[pedido] documento sem projeto: projeto vazio no e-mail e link para /portal#contratos",
      emails.length === 2 && emails.every((e) => e.vars.projeto === "") && sinos.every((s) => s.href === "/portal#contratos"),
    );

    // [pedido] dois pedidos simultâneos
    const docDuplo = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, sufixo: "duplo" });
    const vDuplo = await novaVersao(docDuplo.id, 1);
    const duplos = await Promise.allSettled([pedir(docDuplo.id, vDuplo.id), pedir(docDuplo.id, vDuplo.id)]);
    const aguardandoDuplo = await prisma.pedidoAssinaturaPortal.count({ where: { documentoId: docDuplo.id, status: "aguardando" } });
    check(
      "[pedido] dois pedidos simultâneos: um passa, o outro 'já há pedido'; 1 aguardando",
      duplos.filter((d) => d.status === "fulfilled").length === 1 &&
        duplos.some((d) => d.status === "rejected" && d.reason instanceof Error && d.reason.message === MOTIVO_JA_PEDIDO) &&
        aguardandoDuplo === 1,
    );

    // [portal] leitura
    const lidosA = await contratosDoPortal(cliA.id, projA.id);
    const lidosB = await contratosDoPortal(cliB.id, projA.id);
    const lidosSemProjeto = await contratosDoPortal(cliA.id, null);
    const itemAlcada = lidosA.find((c) => c.pedidoId === pedidoAlcadaId);
    check(
      "[portal] leitura: o pedido aparece no projeto do cliente; outro cliente vazio; sem projeto só o documento sem projeto",
      itemAlcada?.situacao === "aguardando" &&
        itemAlcada.titulo === docAlcada.titulo &&
        itemAlcada.tipoRotulo === "Contrato" &&
        itemAlcada.versaoNumero === 1 &&
        itemAlcada.pedidoPorNome === socio.name &&
        lidosB.length === 0 &&
        lidosSemProjeto.length === 1 &&
        lidosSemProjeto[0].pedidoId === pSemProjeto.pedidoId,
    );

    // [portal] outro cliente não assina
    const aceitesAntes = await prisma.aceiteDocumento.count({ where: { versaoId: vAlcada.id } });
    const outroCliente = await motivoDe(() => assinarPortal(pedidoAlcadaId, contaDoPortal(contaB1, cliB.id)));
    // Conta de B dizendo ser de A (cliente forjado): o serviço confere a conta no banco.
    const forjado = await motivoDe(() => assinarPortal(pedidoAlcadaId, contaDoPortal(contaB1, cliA.id)));
    const acessoB = await contaDoPortalParaCliente(sessao(contaB1), cliA.id);
    const acessoA1 = await contaDoPortalParaCliente(sessao(contaA1), cliA.id);
    const acessoA3 = await contaDoPortalParaCliente(sessao(contaA3), cliA.id);
    check(
      "[portal] outro cliente não assina: 'Pedido não encontrado.', sem aceite; acesso de B ao cliente A recusado (404)",
      outroCliente === MOTIVO_NAO_ENCONTRADO &&
        forjado === MOTIVO_NAO_ENCONTRADO &&
        (await prisma.aceiteDocumento.count({ where: { versaoId: vAlcada.id } })) === aceitesAntes &&
        !acessoB.ok &&
        acessoB.status === 404,
    );
    check(
      "[portal] acesso: conta ativa do cliente passa; conta inativa não",
      acessoA1.ok && acessoA1.conta.userId === contaA1.id && acessoA1.conta.clienteId === cliA.id && !acessoA3.ok,
    );

    // [portal] versão nova
    const docVersao = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, sufixo: "versao", valor: 1000, porData: true });
    const v1 = await novaVersao(docVersao.id, 1);
    const p1 = await pedir(docVersao.id, v1.id);
    const v2 = await novaVersao(docVersao.id, 2);
    const lidosDepoisV2 = await contratosDoPortal(cliA.id, projA.id);
    const assinarV1 = await motivoDe(() => assinarPortal(p1.pedidoId, contaDoPortal(contaA1, cliA.id)));
    const equipeV2 = (await portalDosDocumentos([docVersao.id]))[docVersao.id];
    check(
      "[portal] versão nova: some do portal, assinar recusa, o Jurídico mostra 'versão substituída' e deixa pedir",
      !lidosDepoisV2.some((c) => c.pedidoId === p1.pedidoId) &&
        assinarV1 === MOTIVO_VERSAO_SUBSTITUIDA &&
        equipeV2?.pedidosPorVersao[v1.id]?.[0]?.situacao === "versao_substituida" &&
        equipeV2?.pedidosPorVersao[v1.id]?.[0]?.rotulo === "Versão substituída" &&
        equipeV2?.motivoParaNaoPedir === null &&
        equipeV2?.contasAtivas === 2,
    );
    const p2 = await pedir(docVersao.id, v2.id);
    const p1Depois = await prisma.pedidoAssinaturaPortal.findUniqueOrThrow({ where: { id: p1.pedidoId } });
    const aguardandoVersao = await prisma.pedidoAssinaturaPortal.findMany({ where: { documentoId: docVersao.id, status: "aguardando" } });
    check(
      "[portal] pedir na versão nova cancela o pedido da antiga (quem pede) e deixa 1 aguardando (v2)",
      p1Depois.status === "cancelado" &&
        p1Depois.canceladoPorId === socio.id &&
        aguardandoVersao.length === 1 &&
        aguardandoVersao[0].id === p2.pedidoId &&
        aguardandoVersao[0].versaoId === v2.id,
    );

    // [portal] duas contas assinando ao mesmo tempo
    limparAvisos();
    const duas = await Promise.allSettled([
      assinarPortal(p2.pedidoId, contaDoPortal(contaA1, cliA.id)),
      assinarPortal(p2.pedidoId, contaDoPortal(contaA2, cliA.id)),
    ]);
    const aceitesV2 = await prisma.aceiteDocumento.findMany({ where: { versaoId: v2.id } });
    const docVersaoDepois = await prisma.documentoJuridico.findUniqueOrThrow({ where: { id: docVersao.id } });
    const lancsVersao = await prisma.lancamento.findMany({
      where: { contratoId: docVersao.id, status: { not: "previsao" } },
      select: { autorId: true },
    });
    const p2Depois = await prisma.pedidoAssinaturaPortal.findUniqueOrThrow({ where: { id: p2.pedidoId } });
    const recusada = duas.find((d) => d.status === "rejected");
    check(
      "[portal] duas contas ao mesmo tempo: um aceite, assinado, parcelas uma vez (autor = quem pediu), pedido assinado, sino para quem pediu",
      duas.filter((d) => d.status === "fulfilled").length === 1 &&
        recusada?.status === "rejected" &&
        recusada.reason instanceof Error &&
        [MOTIVO_JA_ASSINADO, MOTIVO_MUDOU].includes(recusada.reason.message) &&
        aceitesV2.length === 1 &&
        [contaA1.id, contaA2.id].includes(aceitesV2[0].userId) &&
        docVersaoDepois.statusContrato === "assinado" &&
        lancsVersao.length === 2 &&
        lancsVersao.every((l) => l.autorId === socio.id) &&
        p2Depois.status === "assinado" &&
        p2Depois.aceiteId === aceitesV2[0].id &&
        p2Depois.assinadoPorId === aceitesV2[0].userId &&
        !!p2Depois.assinadoPorNome &&
        p2Depois.assinadoEm != null &&
        sinos.length === 1 &&
        sinos[0].userId === socio.id &&
        sinos[0].href === "/juridico",
    );

    // [portal] assinado fica, mesmo com versão nova
    await novaVersao(docVersao.id, 3);
    const lidosDepoisV3 = await contratosDoPortal(cliA.id, projA.id);
    const itemAssinado = lidosDepoisV3.find((c) => c.pedidoId === p2.pedidoId);
    check(
      "[portal] assinado fica no portal depois de uma versão nova (assinado por, versão 2)",
      itemAssinado?.situacao === "assinado" &&
        itemAssinado.versaoNumero === 2 &&
        itemAssinado.assinadoPorNome === p2Depois.assinadoPorNome &&
        !!itemAssinado.assinadoEm,
    );

    // [portal] equipe × cliente ao mesmo tempo
    const docEquipe = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, sufixo: "equipe", valor: 1000, porData: true });
    const vEquipe = await novaVersao(docEquipe.id, 1);
    const pEquipe = await pedir(docEquipe.id, vEquipe.id);
    const hashEquipe = await hashDaVersao(vEquipe.id);
    const [rEquipe] = await Promise.all([
      comRetentativaDeConflito(() =>
        prisma.$transaction((tx) =>
          assinarVersaoNoTx(tx, {
            versaoId: vEquipe.id,
            ator: { id: socio.id, nome: socio.name },
            autorFinanceiroId: socio.id,
            hashArquivo: hashEquipe,
            ip: "127.0.0.1",
            userAgent: "smoke-juridico",
          }),
        ),
      ),
      assinarPortal(pEquipe.pedidoId, contaDoPortal(contaA1, cliA.id)),
    ]);
    const aceitesEquipe = await prisma.aceiteDocumento.count({ where: { versaoId: vEquipe.id } });
    const lancsEquipe = await prisma.lancamento.count({ where: { contratoId: docEquipe.id, status: { not: "previsao" } } });
    const pEquipeDepois = await prisma.pedidoAssinaturaPortal.findUniqueOrThrow({ where: { id: pEquipe.pedidoId } });
    const docEquipeDepois = await prisma.documentoJuridico.findUniqueOrThrow({ where: { id: docEquipe.id } });
    check(
      "[portal] equipe × cliente ao mesmo tempo: 2 aceites, assinado, parcelas uma vez, pedido assinado",
      !rEquipe.jaAssinado &&
        aceitesEquipe === 2 &&
        docEquipeDepois.statusContrato === "assinado" &&
        lancsEquipe === 2 &&
        pEquipeDepois.status === "assinado",
    );

    // [portal] cancelar
    const docCancelar = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, sufixo: "cancelar" });
    const vCancelar = await novaVersao(docCancelar.id, 1);
    const pCancelar = await pedir(docCancelar.id, vCancelar.id);
    await cancelarPedidoAssinatura({ pedidoId: pCancelar.pedidoId, porId: socio.id });
    const lidosCancelado = await contratosDoPortal(cliA.id, projA.id);
    const cancelarDeNovo = await motivoDe(() => cancelarPedidoAssinatura({ pedidoId: pCancelar.pedidoId, porId: socio.id }));
    const assinarCancelado = await motivoDe(() => assinarPortal(pCancelar.pedidoId, contaDoPortal(contaA1, cliA.id)));
    const pCanceladoDepois = await prisma.pedidoAssinaturaPortal.findUniqueOrThrow({ where: { id: pCancelar.pedidoId } });
    check(
      "[portal] cancelar: some do portal, cancelar de novo recusa, assinar recusa",
      !lidosCancelado.some((c) => c.pedidoId === pCancelar.pedidoId) &&
        pCanceladoDepois.status === "cancelado" &&
        pCanceladoDepois.canceladoPorId === socio.id &&
        cancelarDeNovo === MOTIVO_NAO_AGUARDANDO &&
        assinarCancelado === MOTIVO_CANCELADO,
    );

    // [portal] cliente inativo (por último: inativa o cliente A)
    const docInativar = await novoDocumento({ clienteId: cliA.id, projetoId: projA.id, sufixo: "inativar" });
    const vInativar = await novaVersao(docInativar.id, 1);
    const pInativar = await pedir(docInativar.id, vInativar.id);
    await prisma.cliente.update({ where: { id: cliA.id }, data: { ativo: false } });
    const acessoInativo = await contaDoPortalParaCliente(sessao(contaA1), cliA.id);
    const assinarInativo = await motivoDe(() => assinarPortal(pInativar.pedidoId, contaDoPortal(contaA1, cliA.id)));
    check(
      "[portal] cliente inativo: acesso recusado (404) e assinar responde 'Pedido não encontrado.', sem aceite",
      !acessoInativo.ok &&
        acessoInativo.status === 404 &&
        assinarInativo === MOTIVO_NAO_ENCONTRADO &&
        (await prisma.aceiteDocumento.count({ where: { versaoId: vInativar.id } })) === 0,
    );
  } finally {
    // Cada remoção em separado: uma falha não deixa o resto do lixo no banco de dev.
    const remover = async (rotulo: string, id: string, apagar: () => Promise<unknown>) => {
      try {
        await apagar();
      } catch (e) {
        console.error(`[limpeza] não removeu ${rotulo} ${id}:`, e);
      }
    };
    await remover("limite de alçada", CHAVE_LIMITE_APROVACAO_CONTRATO, devolverLimite);
    for (const id of documentos) {
      await remover("lançamentos do contrato", id, () =>
        prisma.lancamento.deleteMany({ where: { contratoId: id, excluidoEm: { not: undefined } } }),
      );
      // A versão leva aceites e eventos (cascade); o documento leva a versão.
      await remover("documento", id, () => prisma.documentoJuridico.delete({ where: { id } }));
    }
    for (const caminho of arquivos) await remover("arquivo", caminho, () => removerArquivo(caminho));
    await remover("pasta do smoke", tag, () => rm(resolverCaminho(`juridico/smoke_${tag}`), { recursive: true, force: true }));
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
