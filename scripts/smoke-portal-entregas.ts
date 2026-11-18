/**
 * Smoke das entregas no portal do cliente (spec docs/superpowers/specs/2026-11-18-portal-cliente-entregas-design.md)
 * contra o banco de dev. O portal lê pelo MESMO núcleo do link público (`conteudoDoAlcance` com
 * `alcanceDoPortal`); aqui vai o SQL: descrição da revisão e selo "Download bloqueado" na árvore, a revisão
 * bloqueada fora do .zip, o portal igual ao link "projeto todo por situação", e o que nunca sai pela URL direta
 * (upload de outro projeto, de outro cliente, revisão sem marca). A trava de quem acessa (sessão, tipo,
 * cliente, termo, senha) é pura e está em `modules/portal/acesso-regras.test.ts`.
 *
 * Cria clientes + projetos + documentos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:portal-entregas
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { alcanceDoPortal } from "../src/modules/projetos/arquivos/link-publico-regras";
import {
  conteudoDoAlcance,
  uploadsDoAlcanceParaZip,
  type ConteudoPublico,
} from "../src/modules/projetos/arquivos/link-publico";
import { uploadsComBloqueioDeDownload } from "../src/modules/uploads/ciclo/service";

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
