/**
 * Smoke da conta de obra do portal (spec docs/superpowers/specs/2026-11-25-portal-conta-obra-design.md) contra o banco de dev,
 * sem o servidor no ar e sem SMTP (`enviar`/`enviarObra`/`notificar` falsos gravam em listas).
 *
 * Cenário próprio (clientes, projetos, documentos, contas com sufixo do smoke), apagado no fim. Guarda a configuração
 * `portal.resumoDiario` de antes e a devolve.
 *
 * Confere: lista de obras (de fora × do cliente, cliente inativo); porta dos arquivos (Liberado sim, Compartilhado nunca — página,
 * URL direta, .zip, recorte por pasta, modelo 3D, recebidos do cliente fora; ART; bloqueio de download); toda área do cliente
 * recusa a conta de obra; tirar obra da lista fecha na hora; conta do cliente só com obras dele; termo de obra pendente = 403;
 * cliente/perfil/permissão recusados; trava otimista; "Acesso até" novo reativa a conta vencida; resumo de obra (liberada,
 * substituída, retirada dentro e fora do ciclo, uma vez por dia, opt-out, conta e obra novas no dia, fora do resumo do cliente).
 *
 * Uso: npm run smoke:portal-obra
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { diaDeSaoPaulo } from "../src/lib/data";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";
import { precisaAceitarTermo } from "../src/modules/legal/queries";
import { acessoDoUsuarioAoProjetoDoPortal, acessoDoUsuarioAosArquivosDoPortal, type UsuarioDaSessao } from "../src/modules/portal/acesso";
import { MSG_PORTAL } from "../src/modules/portal/acesso-regras";
import { contaPodeVerConversa } from "../src/modules/portal/mensagens/service";
import { contaDoPortalParaCliente } from "../src/modules/portal/contratos/acesso";
import { clienteDoUsuario } from "../src/modules/portal/queries";
import { modelosDoPortal, modelosParaVerNoPortal } from "../src/modules/portal/modelo3d/queries";
import { pranchaParaPortal } from "../src/modules/portal/pedido-revisao/queries";
import { escopoProjeto } from "../src/modules/projetos/queries";
import {
  artLiberadaNoAlcance,
  conteudoDoAlcance,
  uploadLiberadoNoAlcance,
  uploadsDoAlcanceParaZip,
  type ConteudoPublico,
} from "../src/modules/projetos/arquivos/link-publico";
import { uploadsComBloqueioDeDownload } from "../src/modules/uploads/ciclo/service";
import { CHAVE_CONFIG_RESUMO, somarDiasIso } from "../src/modules/portal/resumo-diario";
import { definirResumoPorEmail, rodarResumoDiario, salvarConfigResumo, type EnviarEmailResumo } from "../src/modules/portal/resumo-service";
import { criarContaObraNoBanco, exigirNaoEhContaObra, salvarContaObraNoBanco } from "../src/modules/portal/obra/service";
import { obrasParaLista, pranchaDaObra } from "../src/modules/portal/obra/queries";
import { MOTIVO_CONTA_OBRA, MOTIVO_CONTA_OBRA_MUDOU, MOTIVO_OBRA_DE_OUTRO_CLIENTE } from "../src/modules/portal/obra/regras";

const ids = (c: ConteudoPublico | null) =>
  (c?.situacoes ?? []).flatMap((s) => s.disciplinas.flatMap((d) => d.pastas.flatMap((f) => f.extensoes.flatMap((e) => e.arquivos.map((a) => a.id)))));

async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const tag = `SMKOBRA_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const autor = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!autor) throw new Error("Banco de dev sem usuário ativo.");
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
  /** Documento com N revisões, um upload validado por revisão (`ext` = pdf | ifc). */
  const documento = async (disciplinaId: string, nome: string, ext: "pdf" | "ifc", revisoes: number) => {
    const doc = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-${nome}.${ext}`, nomeArquivo: `${tag}-${nome}.${ext}` },
    });
    const revs: { id: string; numero: number; uploadId: string }[] = [];
    for (let n = 1; n <= revisoes; n++) {
      const rev = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: n, createdById: autor.id } });
      const up = await prisma.upload.create({
        data: {
          disciplinaId,
          documentoId: doc.id,
          revisaoId: rev.id,
          pacote: "A",
          nomeArquivo: `${tag}-${nome}-R${n}.${ext}`,
          caminho: `smoke/${tag}-${nome}-R${n}.${ext}`,
          tamanho: 10,
          hashSha256: "0".repeat(64),
          autorId: autor.id,
          validado: true,
        },
      });
      revs.push({ id: rev.id, numero: n, uploadId: up.id });
    }
    return { doc, revs };
  };
  const evento = (documentoId: string, tipo: "situacao_marcada" | "situacao_retirada", revisao: number, em: string) =>
    prisma.documentoEvento.create({
      data: { documentoId, tipo, categoria: "alteracao", userId: autor.id, detalhe: { pasta: "Liberado para obra", revisao }, createdAt: new Date(em) },
    });
  const aceitar = async (userId: string, tipo: "cliente" | "obra") =>
    prisma.aceiteTermo.create({ data: { userId, tipo, versao: TERMOS[tipo].versao, conteudoHash: "0".repeat(64) } });
  const sessao = (id: string): UsuarioDaSessao => ({ id, tipo: "externo", mustChangePassword: false });

  try {
    // ── cenário ─────────────────────────────────────────────
    const cA = await novoCliente("A");
    const cB = await novoCliente("B");
    const cC = await novoCliente("C");
    const pA1 = await novoProjeto(cA.id, "pA1");
    const pA2 = await novoProjeto(cA.id, "pA2");
    const pB = await novoProjeto(cB.id, "pB");
    const pC = await novoProjeto(cC.id, "pC");

    // D1 (fora do ciclo): R1 em Liberado para obra, R2 em Compartilhado.
    const d1 = await documento(pA1.disciplinaId, "d1", "pdf", 2);
    await prisma.documentoDisciplina.update({
      where: { id: d1.doc.id },
      data: { revisaoLiberadaObraId: d1.revs[0].id, revisaoCompartilhadaId: d1.revs[1].id },
    });
    // IFC liberado para obra × IFC só em Compartilhado; um IFC que o cliente enviou.
    const ifcObra = await documento(pA1.disciplinaId, "ifc-obra", "ifc", 1);
    await prisma.documentoDisciplina.update({ where: { id: ifcObra.doc.id }, data: { revisaoLiberadaObraId: ifcObra.revs[0].id } });
    const ifcComp = await documento(pA1.disciplinaId, "ifc-comp", "ifc", 1);
    await prisma.documentoDisciplina.update({ where: { id: ifcComp.doc.id }, data: { revisaoCompartilhadaId: ifcComp.revs[0].id } });
    await prisma.documento.create({
      data: {
        clienteId: cA.id,
        projetoId: pA1.id,
        origem: "recebido_cliente",
        nome: `${tag}-recebido`,
        versoes: { create: [{ numero: 1, caminho: `smoke/${tag}-rec.ifc`, nomeArquivo: "rec.ifc", mime: "application/octet-stream", tamanho: 10, hashSha256: "0".repeat(64) }] },
      },
    });
    const art = await prisma.art.create({
      data: { projetoId: pA1.id, numero: `${tag}-1`, arquivoPath: `smoke/${tag}-art.pdf`, arquivoNome: "art.pdf", autorId: autor.id },
    });
    // pB e pC: um documento liberado para obra cada (para a lista contar).
    const dB = await documento(pB.disciplinaId, "dB", "pdf", 1);
    await prisma.documentoDisciplina.update({ where: { id: dB.doc.id }, data: { revisaoLiberadaObraId: dB.revs[0].id } });

    // Contas: obra de fora (pA1, pB, pC), obra do cliente A (pA1) e o cliente A.
    const fora = await criarContaObraNoBanco(
      { name: `${tag} Engenheiro`, email: `${tag.toLowerCase()}-fora@smoke.local`, empresa: "Construtora Alfa", clienteId: "", projetoIds: [pA1.id, pB.id, pC.id], acessoAte: "" },
      autor.id,
    );
    usuarios.push(fora.id);
    const doCliente = await criarContaObraNoBanco(
      { name: `${tag} Obra do cliente`, email: `${tag.toLowerCase()}-doc@smoke.local`, empresa: "Equipe de obra A", clienteId: cA.id, projetoIds: [pA1.id], acessoAte: "" },
      autor.id,
    );
    usuarios.push(doCliente.id);
    const contaCliente = await prisma.user.create({
      data: { name: `${tag} Cliente`, email: `${tag.toLowerCase()}-cli@smoke.local`, tipo: "externo", clienteId: cA.id },
    });
    usuarios.push(contaCliente.id);
    await aceitar(fora.id, "obra");
    await aceitar(doCliente.id, "obra");
    await aceitar(contaCliente.id, "cliente");

    const novaConta = await prisma.user.findUniqueOrThrow({ where: { id: fora.id }, select: { clienteId: true, perfilId: true, superUsuario: true, tipo: true } });
    check(
      "conta de obra nasce externa, sem cliente, sem perfil e sem superusuário",
      novaConta.tipo === "externo" && novaConta.clienteId === null && novaConta.perfilId === null && !novaConta.superUsuario,
    );
    check("termo aplicável à conta de obra = obra", tipoTermoPorTipo("externo", true) === "obra" && (await precisaAceitarTermo(sessao(fora.id))) === null);

    // ── lista de obras ──────────────────────────────────────
    const lista = (await obrasParaLista(fora.id)).map((o) => o.id).sort();
    check("obra de fora vê as obras da lista, de clientes diferentes", JSON.stringify(lista) === JSON.stringify([pA1.id, pB.id, pC.id].sort()));
    const obraA1 = (await obrasParaLista(fora.id)).find((o) => o.id === pA1.id);
    check("lista conta só o que está em Liberado para obra (D1-R1 + IFC)", obraA1?.liberadas === 2);
    check("conta do cliente vê só a obra marcada, nunca o resto do cliente", JSON.stringify((await obrasParaLista(doCliente.id)).map((o) => o.id)) === JSON.stringify([pA1.id]));
    await prisma.cliente.update({ where: { id: cC.id }, data: { ativo: false } });
    check("cliente do projeto inativo: a obra some da lista", !(await obrasParaLista(fora.id)).some((o) => o.id === pC.id));
    const acessoInativo = await acessoDoUsuarioAosArquivosDoPortal(sessao(fora.id), pC.id);
    check("cliente do projeto inativo: arquivos 404", !acessoInativo.ok && acessoInativo.status === 404);

    // ── porta dos arquivos ──────────────────────────────────
    const acesso = await acessoDoUsuarioAosArquivosDoPortal(sessao(fora.id), pA1.id);
    check("porta dos arquivos: papel obra, alcance só de Liberado para obra", acesso.ok && acesso.papel === "obra" && JSON.stringify(acesso.alcance.situacoes) === '["liberado_obra"]');
    if (!acesso.ok) throw new Error("sem acesso da obra — o resto não tem como rodar");
    const alc = acesso.alcance;
    const naPagina = ids(await conteudoDoAlcance(alc));
    check("página: R1 (Liberado) aparece, R2 (Compartilhado) e o IFC só compartilhado não", naPagina.includes(d1.revs[0].uploadId) && !naPagina.includes(d1.revs[1].uploadId) && !naPagina.includes(ifcComp.revs[0].uploadId));
    check("URL direta: R1 abre, R2 dá 404", (await uploadLiberadoNoAlcance(alc, d1.revs[0].uploadId)) !== null && (await uploadLiberadoNoAlcance(alc, d1.revs[1].uploadId)) === null);
    const zip = await uploadsDoAlcanceParaZip(alc);
    check(
      ".zip: só Liberado para obra/…",
      !!zip && zip.entradas.length > 0 && zip.entradas.every((e) => e.nome.startsWith("Liberado para obra/")) && !zip.entradas.some((e) => e.uploadId === d1.revs[1].uploadId),
    );
    check(".zip recortado na pasta Compartilhado: nada", (await uploadsDoAlcanceParaZip(alc, { situacao: "compartilhado" })) === null);
    check("ART do projeto sai para a obra", (await artLiberadaNoAlcance(alc, art.id)) !== null);
    check("visualizador da obra abre a prancha liberada e recusa a compartilhada", (await pranchaDaObra(sessao(fora.id), pA1.id, d1.revs[0].uploadId)) !== null && (await pranchaDaObra(sessao(fora.id), pA1.id, d1.revs[1].uploadId)) === null);
    const modelos = (await modelosParaVerNoPortal(sessao(fora.id), pA1.id)) ?? [];
    check(
      "modelos: IFC de Liberado sim, IFC só compartilhado não, recebido do cliente não",
      modelos.some((m) => m.origemUploadId === ifcObra.revs[0].uploadId) && !modelos.some((m) => m.origemUploadId === ifcComp.revs[0].uploadId) && !modelos.some((m) => m.origem === "cliente"),
    );
    const modelosCliente = (await modelosParaVerNoPortal(sessao(contaCliente.id), pA1.id)) ?? [];
    check("cliente segue vendo o IFC compartilhado e o recebido", modelosCliente.some((m) => m.origemUploadId === ifcComp.revs[0].uploadId) && modelosCliente.some((m) => m.origem === "cliente"));
    const bloqueio = await prisma.controleRevisao.create({
      data: { revisaoId: ifcObra.revs[0].id, tipo: "bloqueio", escopos: ["download"], motivo: "smoke", aplicadoPorId: autor.id },
    });
    check(
      "bloqueio de download tira o modelo e o arquivo da obra",
      !((await modelosParaVerNoPortal(sessao(fora.id), pA1.id)) ?? []).some((m) => m.origemUploadId === ifcObra.revs[0].uploadId) &&
        (await uploadsComBloqueioDeDownload(prisma, [ifcObra.revs[0].uploadId])).size === 1,
    );
    await prisma.controleRevisao.update({ where: { id: bloqueio.id }, data: { removidoEm: new Date() } });
    const outro = await acessoDoUsuarioAosArquivosDoPortal(sessao(fora.id), pA2.id);
    check("projeto do mesmo cliente fora da lista: 404", !outro.ok && outro.status === 404);
    const clienteArq = await acessoDoUsuarioAosArquivosDoPortal(sessao(contaCliente.id), pA1.id);
    check("cliente na porta dos arquivos: papel cliente, as duas pastas", clienteArq.ok && clienteArq.papel === "cliente" && clienteArq.alcance.situacoes.length === 2);

    // ── toda área do cliente recusa a conta de obra ────────
    const u = sessao(fora.id);
    check("área do cliente: pedidos/briefing/mensagens/documentos (porta do cliente) = 404", ((await acessoDoUsuarioAoProjetoDoPortal(u, pA1.id)) as { status?: number }).status === 404);
    check("área do cliente: conversa, atas, agenda e aprovações recusam", !(await contaPodeVerConversa(fora.id, pA1.id)));
    check("área do cliente: contratos recusam", !(await contaDoPortalParaCliente(u, cA.id)).ok);
    check("área do cliente: financeiro e páginas do cliente (sem cliente na conta)", (await clienteDoUsuario(fora.id)) === null);
    check("área do cliente: modelos do pedido de revisão recusam", (await modelosDoPortal(u, pA1.id)) === null);
    check("área do cliente: visualizador com pedido recusa", (await pranchaParaPortal(u, pA1.id, d1.revs[0].uploadId)) === null);
    const viewer = { id: fora.id, tipo: "externo" as const, superUsuario: false, escopoGlobalPerfil: false };
    check("escopo de projeto do cliente: nenhum projeto", (await prisma.projeto.count({ where: { id: { in: projetos }, ...escopoProjeto(viewer) } })) === 0);

    // ── cliente, perfil e permissão recusados ───────────────
    check("conta de obra recusa cliente, perfil e permissão", (await erroDe(() => exigirNaoEhContaObra(fora.id))) === MOTIVO_CONTA_OBRA);
    check("conta do cliente passa pela mesma trava", (await erroDe(() => exigirNaoEhContaObra(contaCliente.id))) === null);

    // ── termo de obra pendente ──────────────────────────────
    await prisma.aceiteTermo.deleteMany({ where: { userId: fora.id } });
    const semTermo = await acessoDoUsuarioAosArquivosDoPortal(u, pA1.id);
    check("termo de obra pendente: 403", !semTermo.ok && semTermo.status === 403 && semTermo.erro === MSG_PORTAL.termo);
    check("termo pendente é o de obra", (await precisaAceitarTermo(u))?.tipo === "obra");
    const semTermoFora = await acessoDoUsuarioAosArquivosDoPortal(u, pA2.id);
    check("termo pendente fora da lista: 404 (antes do termo)", !semTermoFora.ok && semTermoFora.status === 404);
    await aceitar(fora.id, "obra");

    // ── editar: tirar da lista, conta do cliente, trava otimista ──
    const versao = async (userId: string) => (await prisma.contaObra.findUniqueOrThrow({ where: { userId }, select: { updatedAt: true } })).updatedAt.toISOString();
    const v1 = await versao(fora.id);
    await salvarContaObraNoBanco({ userId: fora.id, versao: v1, name: `${tag} Engenheiro`, empresa: "Construtora Alfa", clienteId: "", projetoIds: [pA1.id, pC.id], acessoAte: "" }, autor.id);
    const semPB = await acessoDoUsuarioAosArquivosDoPortal(u, pB.id);
    check("tirar a obra da lista fecha na hora", !semPB.ok && semPB.status === 404);
    check(
      "trava otimista: salvar com a versão antiga recusa",
      (await erroDe(() =>
        salvarContaObraNoBanco({ userId: fora.id, versao: v1, name: "x", empresa: "Construtora Alfa", clienteId: "", projetoIds: [], acessoAte: "" }, autor.id),
      )) === MOTIVO_CONTA_OBRA_MUDOU,
    );
    check(
      "conta do cliente não aceita obra de outro cliente",
      (await erroDe(async () =>
        salvarContaObraNoBanco(
          { userId: doCliente.id, versao: await versao(doCliente.id), name: `${tag} Obra do cliente`, empresa: "Equipe de obra A", clienteId: cA.id, projetoIds: [pA1.id, pB.id], acessoAte: "" },
          autor.id,
        ),
      )) === MOTIVO_OBRA_DE_OUTRO_CLIENTE,
    );
    await prisma.cliente.update({ where: { id: cA.id }, data: { ativo: false } });
    check("cliente da conta do cliente inativo: nada", (await obrasParaLista(doCliente.id)).length === 0);
    await prisma.cliente.update({ where: { id: cA.id }, data: { ativo: true } });

    // ── "Acesso até": obra que atrasou ──────────────────────
    const hoje = diaDeSaoPaulo();
    await prisma.user.update({ where: { id: doCliente.id }, data: { ativo: false, acessoAte: new Date(`${somarDiasIso(hoje, -2)}T00:00:00.000Z`) } });
    const futuro = somarDiasIso(hoje, 30);
    const r = await salvarContaObraNoBanco(
      { userId: doCliente.id, versao: await versao(doCliente.id), name: `${tag} Obra do cliente`, empresa: "Equipe de obra A", clienteId: cA.id, projetoIds: [pA1.id], acessoAte: futuro },
      autor.id,
    );
    const reativada = await prisma.user.findUniqueOrThrow({ where: { id: doCliente.id }, select: { ativo: true, acessoAte: true } });
    check("\"Acesso até\" novo reativa a conta vencida, guardando a data", r.reativada && reativada.ativo && reativada.acessoAte?.toISOString().slice(0, 10) === futuro);
    check(
      "\"Acesso até\" no passado é recusado",
      (await erroDe(async () =>
        salvarContaObraNoBanco(
          { userId: doCliente.id, versao: await versao(doCliente.id), name: "x", empresa: "Equipe de obra A", clienteId: cA.id, projetoIds: [pA1.id], acessoAte: somarDiasIso(hoje, -1) },
          autor.id,
        ),
      )) !== null,
    );

    // ── resumo diário de obra ───────────────────────────────
    // Avaliado: 2026-11-19 (hoje fixo 2026-11-20). As contas e as obras na lista existem desde antes.
    const antes = new Date("2026-11-01T12:00:00.000Z");
    await prisma.user.updateMany({ where: { id: { in: usuarios } }, data: { createdAt: antes } });
    await prisma.contaObraProjeto.updateMany({ where: { contaObra: { userId: { in: usuarios } } }, data: { criadoEm: antes } });
    await salvarConfigResumo({ ativo: true, desde: "2026-11-01", ultimoDia: "2026-11-18" });

    // Dentro do ciclo: S (controle da R1 removido e da R2 aplicado no mesmo dia) e T (controle removido, sem outro).
    const s = await documento(pA1.disciplinaId, "s", "pdf", 2);
    await prisma.controleRevisao.create({ data: { revisaoId: s.revs[0].id, tipo: "liberado_obra", motivo: "smoke", aplicadoEm: new Date("2026-11-05T12:00:00Z"), removidoEm: new Date("2026-11-19T14:00:00Z") } });
    await prisma.controleRevisao.create({ data: { revisaoId: s.revs[1].id, tipo: "liberado_obra", motivo: "smoke", aplicadoEm: new Date("2026-11-19T15:00:00Z") } });
    const t = await documento(pA1.disciplinaId, "t", "pdf", 1);
    await prisma.controleRevisao.create({ data: { revisaoId: t.revs[0].id, tipo: "liberado_obra", motivo: "smoke", aplicadoEm: new Date("2026-11-05T12:00:00Z"), removidoEm: new Date("2026-11-19T16:00:00Z") } });
    // Fora do ciclo: X marcada R1 antes e R2 no dia (substituída), Y marcada no dia (liberada), Z retirada no dia.
    const x = await documento(pA1.disciplinaId, "x", "pdf", 2);
    await evento(x.doc.id, "situacao_marcada", 1, "2026-11-05T12:00:00Z");
    await evento(x.doc.id, "situacao_marcada", 2, "2026-11-19T13:00:00Z");
    const y = await documento(pA1.disciplinaId, "y", "pdf", 1);
    await evento(y.doc.id, "situacao_marcada", 1, "2026-11-19T13:00:00Z");
    const z = await documento(pA1.disciplinaId, "z", "pdf", 1);
    await evento(z.doc.id, "situacao_marcada", 1, "2026-11-05T12:00:00Z");
    await evento(z.doc.id, "situacao_retirada", 1, "2026-11-19T17:00:00Z");

    // Conta nova depois do fim do dia 19 e obra acrescentada depois do fim do dia 19: não recebem o dia 19.
    const tardia = await criarContaObraNoBanco(
      { name: `${tag} Tardia`, email: `${tag.toLowerCase()}-tarde@smoke.local`, empresa: "Construtora Beta", clienteId: "", projetoIds: [pA1.id], acessoAte: "" },
      autor.id,
    );
    usuarios.push(tardia.id);
    await prisma.user.update({ where: { id: tardia.id }, data: { createdAt: new Date("2026-11-20T04:00:00.000Z") } });
    await prisma.contaObraProjeto.updateMany({ where: { contaObra: { userId: fora.id }, projetoId: pC.id }, data: { criadoEm: new Date("2026-11-20T04:00:00.000Z") } });
    const dC = await documento(pC.disciplinaId, "dC", "pdf", 1);
    await evento(dC.doc.id, "situacao_marcada", 1, "2026-11-19T13:00:00Z");
    await prisma.cliente.update({ where: { id: cC.id }, data: { ativo: true } });
    // Opt-out: a conta do cliente A (de obra) desliga o e-mail.
    await definirResumoPorEmail(doCliente.id, false);

    const emailsCliente: { para: string; projeto: string }[] = [];
    const emailsObra: { para: string; projeto: string; lista: string }[] = [];
    const sinos: { userId: string; titulo: string; corpo: string }[] = [];
    const enviar: EnviarEmailResumo = async (para, v) => {
      emailsCliente.push({ para, projeto: v.projeto });
      return true;
    };
    const enviarObra: EnviarEmailResumo = async (para, v) => {
      emailsObra.push({ para, projeto: v.projeto, lista: v.lista });
      return true;
    };
    const notificar = async (userId: string, n: { titulo: string; corpo: string; href: string }) => {
      sinos.push({ userId, titulo: n.titulo, corpo: n.corpo });
    };
    const rodar = () => rodarResumoDiario({ hoje: "2026-11-20", enviar, enviarObra, notificar, somenteProjetos: [pA1.id, pC.id] });

    const r1 = await rodar();
    const emailFora = emailsObra.find((e) => e.para === `${tag.toLowerCase()}-fora@smoke.local` && e.projeto === pA1.nome);
    const lista1 = emailFora?.lista ?? "";
    check("resumo de obra: e-mail da obra para a conta de fora", !!emailFora && r1.obras >= 1);
    check("resumo de obra: substituída dentro do ciclo (S: R00 → R01)", lista1.includes(`${tag}-s.pdf · substituída: R00 → R01`.replace(/_/g, "\\_")));
    check("resumo de obra: retirada dentro do ciclo (T)", lista1.includes(`${tag}-t.pdf · retirada de obra (R00)`.replace(/_/g, "\\_")));
    check("resumo de obra: substituída fora do ciclo (X: R00 → R01)", lista1.includes(`${tag}-x.pdf · substituída: R00 → R01`.replace(/_/g, "\\_")));
    check("resumo de obra: liberada fora do ciclo (Y)", lista1.includes(`${tag}-y.pdf · liberada para obra (R00)`.replace(/_/g, "\\_")));
    check("resumo de obra: retirada fora do ciclo (Z)", lista1.includes(`${tag}-z.pdf · retirada de obra (R00)`.replace(/_/g, "\\_")));
    check("resumo de obra: sino \"Novidades na obra\" para a conta de fora", sinos.some((s2) => s2.userId === fora.id && s2.titulo === `Novidades na obra ${pA1.nome}`));
    check("opt-out: a conta do cliente (de obra) recebe só o sino", sinos.some((s2) => s2.userId === doCliente.id) && !emailsObra.some((e) => e.para.endsWith("-doc@smoke.local")));
    check("conta criada depois do fim do dia não recebe o dia", !sinos.some((s2) => s2.userId === tardia.id) && !emailsObra.some((e) => e.para.endsWith("-tarde@smoke.local")));
    check("obra acrescentada depois do fim do dia não sai no resumo", !emailsObra.some((e) => e.projeto === pC.nome) && !sinos.some((s2) => s2.titulo.includes(pC.nome)));
    check(
      "conta de obra fora do resumo do cliente, e o cliente fora do de obra",
      !emailsCliente.some((e) => e.para.includes("-fora@") || e.para.includes("-doc@")) && !sinos.some((s2) => s2.userId === contaCliente.id && s2.titulo.startsWith("Novidades na obra")),
    );

    const [qtdEmails, qtdSinos] = [emailsObra.length, sinos.filter((s2) => s2.titulo.startsWith("Novidades na obra")).length];
    await salvarConfigResumo({ ativo: true, desde: "2026-11-01", ultimoDia: "2026-11-18" });
    await rodar();
    check(
      "segunda rodada no mesmo dia: nenhum e-mail ou sino de obra a mais",
      emailsObra.length === qtdEmails && sinos.filter((s2) => s2.titulo.startsWith("Novidades na obra")).length === qtdSinos,
    );
  } finally {
    for (const id of usuarios) await prisma.user.delete({ where: { id } }).catch(() => undefined);
    await prisma.documento.deleteMany({ where: { nome: { startsWith: tag } } });
    for (const id of projetos) await prisma.projeto.delete({ where: { id } }).catch((e: unknown) => console.error("limpeza do projeto falhou:", e));
    for (const id of clientes) await prisma.cliente.delete({ where: { id } }).catch((e: unknown) => console.error("limpeza do cliente falhou:", e));
    if (configAntes) {
      await prisma.configSistema.update({ where: { chave: CHAVE_CONFIG_RESUMO }, data: { valor: configAntes.valor ?? {} } });
    } else {
      await prisma.configSistema.deleteMany({ where: { chave: CHAVE_CONFIG_RESUMO } });
    }
    const sobrou = await prisma.user.count({ where: { email: { startsWith: tag.toLowerCase() } } });
    console.log(`cenário apagado (usuários restantes do smoke: ${sobrou})`);
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
