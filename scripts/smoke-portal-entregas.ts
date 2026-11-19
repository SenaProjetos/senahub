/**
 * Smoke das entregas no portal do cliente (spec docs/superpowers/specs/2026-11-18-portal-cliente-entregas-design.md)
 * contra o banco de dev. O portal lê pelo MESMO núcleo do link público (`conteudoDoAlcance` com
 * `alcanceDoPortal`); aqui vai o SQL: descrição da revisão e selo "Download bloqueado" na árvore, a revisão
 * bloqueada fora do .zip, o portal igual ao link "projeto todo por situação", e o que nunca sai pela URL direta
 * (upload de outro projeto, de outro cliente, revisão sem marca). A trava de quem acessa (sessão, tipo,
 * cliente, termo, senha) é pura e está em `modules/portal/acesso-regras.test.ts`; aqui vai a ligação dela com o
 * banco (`acessoDoUsuarioAoProjetoDoPortal`): projeto inexistente, de outro cliente, termo pendente, cliente
 * desativado.
 *
 * Cria clientes + projetos + documentos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:portal-entregas
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { alcanceDoPortal, type AlcanceArquivos } from "../src/modules/projetos/arquivos/link-publico-regras";
import {
  artLiberadaNoAlcance,
  artLiberadaNoLink,
  conteudoDoAlcance,
  conteudoPublicoPorToken,
  uploadLiberadoNoAlcance,
  uploadLiberadoNoLink,
  uploadsDoAlcanceParaZip,
  type ConteudoPublico,
} from "../src/modules/projetos/arquivos/link-publico";
import { uploadsComBloqueioDeDownload } from "../src/modules/uploads/ciclo/service";
import { acessoDoUsuarioAoProjetoDoPortal } from "../src/modules/portal/acesso";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";

type Arquivo = ConteudoPublico["situacoes"][number]["disciplinas"][number]["pastas"][number]["extensoes"][number]["arquivos"][number];

function arquivosDe(c: ConteudoPublico | null): Arquivo[] {
  return (c?.situacoes ?? []).flatMap((s) => s.disciplinas.flatMap((d) => d.pastas.flatMap((f) => f.extensoes.flatMap((e) => e.arquivos))));
}

async function main() {
  const tag = `SMKPORTAL_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const usuario = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem usuário ativo.");
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", ativo: true, projetoId: null }, select: { id: true } });
  if (!fase) throw new Error("Banco de dev sem fase no catálogo.");

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
  /** Documento com uma revisão e um PDF validado; `marcar` põe a revisão em Compartilhado. */
  const entrega = async (
    disciplinaId: string,
    nome: string,
    opts: { numero?: number; descricao?: string; marcar?: boolean } = {},
  ) => {
    const doc = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-${nome}.pdf`, nomeArquivo: `${tag}-${nome}.pdf`, faseId: fase.id },
    });
    const rev = await prisma.documentoRevisao.create({
      data: { documentoId: doc.id, numero: opts.numero ?? 1, descricao: opts.descricao ?? null, createdById: usuario.id },
    });
    const up = await prisma.upload.create({
      data: {
        disciplinaId,
        documentoId: doc.id,
        revisaoId: rev.id,
        pacote: "A",
        nomeArquivo: `${tag}-${nome}.pdf`,
        caminho: `smoke/${tag}-${nome}.pdf`,
        tamanho: 10,
        hashSha256: "0".repeat(64),
        autorId: usuario.id,
        validado: true,
      },
    });
    if (opts.marcar !== false) {
      await prisma.documentoDisciplina.update({ where: { id: doc.id }, data: { revisaoCompartilhadaId: rev.id } });
    }
    return { doc, rev, up };
  };

  try {
    const cliente = await novoCliente("cli");
    const p1 = await novoProjeto(cliente.id, "p1");

    // A: R01 com descrição. B: bloqueada para download.
    const a = await entrega(p1.disciplinaId, "a", { numero: 2, descricao: "Ajuste das cotas" });
    const b = await entrega(p1.disciplinaId, "b");
    await prisma.controleRevisao.create({
      data: { revisaoId: b.rev.id, tipo: "bloqueio", escopos: ["download"], motivo: "smoke", aplicadoPorId: usuario.id },
    });

    const alcance = alcanceDoPortal({ id: p1.id, codigo: p1.codigo, nome: p1.nome });
    const conteudo = await conteudoDoAlcance(alcance);
    const arquivos = arquivosDe(conteudo);
    const arqA = arquivos.find((x) => x.id === a.up.id);
    const arqB = arquivos.find((x) => x.id === b.up.id);

    check("descrição da revisão chega ao arquivo", arqA?.descricaoRevisao === "Ajuste das cotas" && arqA?.bloqueado === false);
    check("revisão bloqueada continua listada, marcada", arqB?.bloqueado === true && arqB?.descricaoRevisao === null);

    const zip = await uploadsDoAlcanceParaZip(alcance);
    const bloqueados = await uploadsComBloqueioDeDownload(prisma, zip?.entradas.map((e) => e.uploadId) ?? []);
    check("bloqueada fora do .zip", bloqueados.has(b.up.id) && !bloqueados.has(a.up.id));

    // ── portal = link "projeto todo por situação" do mesmo projeto ──
    const link = await prisma.linkPublicoArquivos.create({
      data: { projetoId: p1.id, token: randomBytes(18).toString("hex"), escopo: "projeto_todo", porSituacao: true, nome: "smoke" },
    });
    const pelaLink = await conteudoPublicoPorToken(link.token);
    const semTitulo = (c: ConteudoPublico | null) => (c ? JSON.stringify({ ...c, titulo: null }) : null);
    check("portal = link projeto todo por situação", semTitulo(conteudo) !== null && semTitulo(conteudo) === semTitulo(pelaLink));

    // ── o que nunca sai pela URL direta do portal ──
    const p2 = await novoProjeto(cliente.id, "p2");
    const deP2 = await entrega(p2.disciplinaId, "p2");
    check("upload de outro projeto do mesmo cliente não sai", (await uploadLiberadoNoAlcance(alcance, deP2.up.id)) === null);
    const outroCliente = await novoCliente("outro");
    const p3 = await novoProjeto(outroCliente.id, "p3");
    const deP3 = await entrega(p3.disciplinaId, "p3");
    check("upload de outro cliente não sai", (await uploadLiberadoNoAlcance(alcance, deP3.up.id)) === null);

    const c = await entrega(p1.disciplinaId, "c", { marcar: false });
    const depois = arquivosDe(await conteudoDoAlcance(alcance));
    check(
      "revisão em andamento não aparece",
      !depois.some((x) => x.id === c.up.id) && (await uploadLiberadoNoAlcance(alcance, c.up.id)) === null,
    );
    check("arquivo da pasta do cliente abre", (await uploadLiberadoNoAlcance(alcance, a.up.id)) !== null);

    const art = await prisma.art.create({
      data: { projetoId: p1.id, numero: `${tag}-1`, arquivoPath: `smoke/${tag}-art.pdf`, arquivoNome: "art.pdf", autorId: usuario.id },
    });
    const comArt = await conteudoDoAlcance(alcance);
    check(
      "ART do projeto aparece",
      (comArt?.arts.some((x) => x.id === art.id) ?? false) && (await artLiberadaNoAlcance(alcance, art.id)) !== null,
    );

    // A rota do link grava o linkId na auditoria e no histórico, nunca o token.
    check("download pelo link traz o linkId do link", (await uploadLiberadoNoLink(link.token, a.up.id))?.linkId === link.id);
    check("ART pelo link traz o linkId do link", (await artLiberadaNoLink(link.token, art.id))?.linkId === link.id);

    // ── link de seleção: upload de outro projeto na lista nunca sai (defesa extra) ──
    const selecao: AlcanceArquivos = {
      ...alcanceDoPortal({ id: p1.id, codigo: p1.codigo, nome: p1.nome }),
      escopo: "selecao",
      porSituacao: false,
      uploadIds: [a.up.id, deP3.up.id],
    };
    check("seleção: upload do projeto do link abre", (await uploadLiberadoNoAlcance(selecao, a.up.id)) !== null);
    check("seleção: upload de outro projeto na lista não abre", (await uploadLiberadoNoAlcance(selecao, deP3.up.id)) === null);
    const zipSelecao = await uploadsDoAlcanceParaZip(selecao);
    check(
      "seleção: .zip leva só o upload do projeto do link",
      JSON.stringify(zipSelecao?.entradas.map((e) => e.uploadId)) === JSON.stringify([a.up.id]),
    );
    const soAlheio = await uploadsDoAlcanceParaZip({ ...selecao, uploadIds: [deP3.up.id] });
    check("seleção: .zip só com upload de outro projeto → nada", soAlheio === null);

    // ── quem entra: a regra pura ligada ao banco ──
    const portal = await prisma.user.create({
      data: { name: `${tag} portal`, email: `${tag.toLowerCase()}@smoke.local`, tipo: "externo", clienteId: cliente.id },
    });
    usuarios.push(portal.id);
    const sessao = { id: portal.id, tipo: "externo" as const, mustChangePassword: false };
    const acesso = (projetoId: string, u: typeof sessao | null = sessao) => acessoDoUsuarioAoProjetoDoPortal(u, projetoId);
    const tipoTermo = tipoTermoPorTipo("externo");

    const semTermo = await acesso(p1.id);
    check("termo pendente → 403", !semTermo.ok && semTermo.status === 403);
    const alheioSemTermo = await acesso(p3.id);
    check("projeto de outro cliente → 404 (antes do termo)", !alheioSemTermo.ok && alheioSemTermo.status === 404);

    await prisma.aceiteTermo.create({
      data: { userId: portal.id, tipo: tipoTermo, versao: TERMOS[tipoTermo].versao, conteudoHash: "0".repeat(64) },
    });
    const liberado = await acesso(p1.id);
    check(
      "cliente do projeto com termo aceito entra, com o alcance do portal",
      liberado.ok && liberado.userId === portal.id && liberado.alcance.projetoId === p1.id && liberado.alcance.linkId === null,
    );
    const inexistente = await acesso(`${tag}_nao_existe`);
    check("projeto inexistente → 404", !inexistente.ok && inexistente.status === 404);
    const alheio = await acesso(p3.id);
    check("projeto de outro cliente → 404", !alheio.ok && alheio.status === 404);
    const semSessao = await acesso(p1.id, null);
    check("sem sessão → 401", !semSessao.ok && semSessao.status === 401);
    const interno = await acesso(p1.id, { ...sessao, tipo: "interno" as never });
    check("interno → 404", !interno.ok && interno.status === 404);

    await prisma.cliente.update({ where: { id: cliente.id }, data: { ativo: false } });
    const inativo = await acesso(p1.id);
    check("cliente desativado → 404, mesmo com a conta ativa", !inativo.ok && inativo.status === 404);
  } finally {
    for (const id of usuarios) await prisma.user.delete({ where: { id } });
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
