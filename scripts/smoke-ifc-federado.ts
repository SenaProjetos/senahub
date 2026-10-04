/**
 * Smoke do IFC federado (spec docs/superpowers/specs/2026-10-04-ifc-federado-design.md) contra o banco de dev.
 * O vitest cobre o motor puro; aqui vai o I/O: o child de verdade, Documento/versões, a trava de uma geração viva,
 * o arquivo que some, a recusa de unidade, a revisão que nunca se repete, a geração travada que se libera e o
 * federado fora de Recebidos e da Compatibilização (com a regra de leitura). Abre a saída com web-ifc e roda o
 * converter-ifc sobre ela (prova que a geometria é legível).
 *
 * Uso: npm run smoke:ifc-federado
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { IfcAPI, IFCPROJECT, IFCWALL } from "web-ifc";
import { prisma } from "../src/lib/prisma";
import { resolverCaminho } from "../src/lib/storage";
import type { SessionUser } from "../src/lib/session";
import { ifcDeTeste } from "../src/modules/coordenacao/federado/fixture-ifc";
import { candidatosDoProjeto, criarGeracao, processarGeracao, ultimaGeracao, versoesDoModeloFederado } from "../src/modules/coordenacao/federado/service";
import { modelosCoordenacao } from "../src/modules/coordenacao/queries";
import { podeGerirDocumento, podeLerDocumento } from "../src/modules/documentos-cliente/acesso";
import { ORIGEM_MODELO_FEDERADO } from "../src/modules/documentos-cliente/origens";
import { recebidosDoProjeto } from "../src/modules/documentos-cliente/queries";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}
async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-federado-${Date.now()}`;
const dir = `tmp/${tag}`;
const MS_46_MIN = 46 * 60 * 1000;

function gravar(nome: string, texto: string): { caminho: string; tamanho: number } {
  const rel = `${dir}/${nome}`;
  fs.mkdirSync(path.dirname(resolverCaminho(rel)), { recursive: true });
  fs.writeFileSync(resolverCaminho(rel), texto, "latin1");
  return { caminho: rel, tamanho: Buffer.byteLength(texto, "latin1") };
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true, name: true, email: true } });
  if (!admin) {
    console.log("Banco de dev sem admin — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });

  try {
    const novoModelo = async (disc: string, nome: string, texto: string) => {
      const d = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: disc } });
      const f = gravar(nome, texto);
      const u = await prisma.upload.create({
        data: { disciplinaId: d.id, pacote: "A", nomeArquivo: nome, caminho: f.caminho, hashSha256: "x", tamanho: f.tamanho, autorId: admin.id },
      });
      await prisma.conversaoModelo.create({ data: { uploadId: u.id, status: "concluido", caminhoFrag: `${dir}/${u.id}.frag` } });
      return u;
    };
    const est = await novoModelo("Estrutural", "est.ifc", ifcDeTeste({ semente: "E" }));
    const ele = await novoModelo("Elétrica", "ele.ifc", ifcDeTeste({ semente: "L", dx: 5000 }));
    const met = await novoModelo("Hidráulica", "hid.ifc", ifcDeTeste({ semente: "H", unidade: "METRE" }));
    const pedido = { projetoId: projeto.id, modeloIds: [est.id, ele.id], autorId: admin.id };

    // ── elegibilidade ──
    const cand = await candidatosDoProjeto(projeto.id);
    check("lê schema e unidade dos três", cand.length === 3 && cand.every((c) => c.schema === "IFC4" && c.unidade !== undefined), cand.map((c) => [c.grupo, c.schema, c.unidade]));
    const recusa = await erroDe(() => criarGeracao({ projetoId: projeto.id, modeloIds: [est.id, met.id], autorId: admin.id }));
    check("unidade diferente é recusada com a frase da regra", /Em metros — os marcados estão em milímetros/.test(recusa ?? ""), recusa);

    // ── geração 1 ──
    const g1 = await criarGeracao(pedido);
    const dupla = await erroDe(() => criarGeracao(pedido));
    check("segunda geração viva é recusada", dupla === "Já há uma geração do modelo federado em andamento neste projeto.", dupla);
    await processarGeracao(g1.geracaoId, { notificarAutor: false });
    const v1 = await versoesDoModeloFederado(projeto.id);
    check("primeira geração vira R00", v1.length === 1 && v1[0].revisao === "R00" && /-FEDERADO-R00\.ifc$/.test(v1[0].nomeArquivo), v1);
    // Ordem do painel (modelosCoordenacao), não a do clique: o primeiro é o mestre do IfcProject.
    const ordemDoPainel = cand.filter((c) => c.modeloId === est.id || c.modeloId === ele.id).map((c) => c.grupo);
    check("composição gravada na versão, na ordem do painel", v1[0]?.composicao.map((c) => c.grupo).join(",") === ordemDoPainel.join(","), { gravada: v1[0]?.composicao, ordemDoPainel });

    // ── a saída é IFC válido ──
    const versao = await prisma.documentoVersao.findUniqueOrThrow({ where: { id: v1[0].versaoId }, select: { caminho: true, tamanho: true } });
    check("tamanho gravado = tamanho em disco", fs.statSync(resolverCaminho(versao.caminho)).size === versao.tamanho);
    const api = new IfcAPI();
    api.SetWasmPath(path.resolve("node_modules/web-ifc/") + path.sep, true);
    await api.Init();
    const modelo = api.OpenModel(new Uint8Array(fs.readFileSync(resolverCaminho(versao.caminho))));
    check("web-ifc abre: um IfcProject", api.GetLineIDsWithType(modelo, IFCPROJECT).size() === 1);
    check("web-ifc abre: as duas paredes", api.GetLineIDsWithType(modelo, IFCWALL).size() === 2);
    api.CloseModel(modelo);
    const conv = spawnSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "--tsconfig", "tsconfig.server.json", "scripts/converter-ifc.ts", versao.caminho, `${dir}/federado.frag`], { encoding: "utf8" });
    check("converter-ifc converte o federado", conv.status === 0 && /"ok":true/.test(conv.stdout), conv.stdout.slice(-300));

    // ── fora de Recebidos e da Compatibilização; quem lê ──
    check("federado fora de Recebidos", (await recebidosDoProjeto(projeto.id)).every((d) => d.nome !== "Modelo federado"));
    check("federado fora da lista de modelos", (await modelosCoordenacao(projeto.id)).length === 3);
    const doc = await prisma.documento.findFirst({ where: { projetoId: projeto.id, origem: ORIGEM_MODELO_FEDERADO }, select: { id: true } });
    check("documento federado existe com a origem certa", !!doc);
    const sessaoAdmin = { id: admin.id, name: admin.name ?? "", email: admin.email, role: "admin", ativo: true, superUsuario: true, perfilId: null, escopoGlobalPerfil: true, ehSocio: false } as unknown as SessionUser;
    const semPerfil = { id: `${tag}-sem-perfil`, name: "Sem perfil", email: "sem@perfil.local", role: "clt", ativo: true, superUsuario: false, perfilId: null, escopoGlobalPerfil: false, ehSocio: false } as unknown as SessionUser;
    const ancora = { projetoId: projeto.id, clienteId: cliente.id };
    check("admin lê o federado", (await podeLerDocumento(sessaoAdmin, ancora, ORIGEM_MODELO_FEDERADO)) === true);
    check("usuário sem coordenacao:ver não lê o federado", (await podeLerDocumento(semPerfil, ancora, ORIGEM_MODELO_FEDERADO)) === false);
    check("nem o admin muda o federado pelas ações genéricas de documento", (await podeGerirDocumento(sessaoAdmin, ancora, ORIGEM_MODELO_FEDERADO)) === false);

    // ── geração 2 vira R01 ──
    const g2 = await criarGeracao(pedido);
    await processarGeracao(g2.geracaoId, { notificarAutor: false });
    check("segunda geração vira R01 do mesmo documento", (await versoesDoModeloFederado(projeto.id)).map((v) => v.revisao).join(",") === "R01,R00");

    // ── arquivo que some entre o pedido e o job ──
    const g3 = await criarGeracao(pedido);
    fs.rmSync(resolverCaminho(`${dir}/ele.ifc`));
    await processarGeracao(g3.geracaoId, { notificarAutor: false });
    const g3db = await prisma.geracaoModeloFederado.findUniqueOrThrow({ where: { id: g3.geracaoId } });
    check("arquivo sumido: erro dizendo qual, sem versão nova", g3db.status === "erro" && /ele\.ifc \(Elétrica\)/.test(g3db.erro ?? "") && (await versoesDoModeloFederado(projeto.id)).length === 2, g3db.erro);

    // ── revisão nunca se repete: excluir a R01 não devolve o número ──
    gravar("ele.ifc", ifcDeTeste({ semente: "L", dx: 5000 }));
    const r01 = (await versoesDoModeloFederado(projeto.id)).find((v) => v.revisao === "R01");
    if (r01) {
      const arq = await prisma.documentoVersao.findUniqueOrThrow({ where: { id: r01.versaoId }, select: { caminho: true } });
      await prisma.documentoVersao.delete({ where: { id: r01.versaoId } }); // espelha excluirVersaoModeloFederado
      fs.rmSync(resolverCaminho(arq.caminho), { force: true });
    }
    const g4 = await criarGeracao(pedido);
    await processarGeracao(g4.geracaoId, { notificarAutor: false });
    const revisoes = (await versoesDoModeloFederado(projeto.id)).map((v) => v.revisao);
    check("depois de excluir a R01 a próxima é R02, nunca R01 de novo", revisoes.join(",") === "R02,R00", revisoes);

    // ── geração travada é liberada (processando conta do início; fila, da criação) ──
    const presa = await criarGeracao(pedido);
    const faz46 = new Date(Date.now() - MS_46_MIN);
    await prisma.geracaoModeloFederado.update({ where: { id: presa.geracaoId }, data: { status: "processando", iniciadoEm: faz46, criadoEm: faz46 } });
    const nova = await erroDe(() => criarGeracao(pedido));
    const presaDb = await prisma.geracaoModeloFederado.findUniqueOrThrow({ where: { id: presa.geracaoId } });
    check("processando há 46 min é liberada e a nova entra", nova === null && presaDb.status === "erro", { nova, status: presaDb.status });
    const viva = await prisma.geracaoModeloFederado.findFirstOrThrow({ where: { projetoId: projeto.id, status: "fila" }, select: { id: true } });
    await prisma.geracaoModeloFederado.update({ where: { id: viva.id }, data: { criadoEm: faz46 } });
    await ultimaGeracao(projeto.id);
    const vivaDb = await prisma.geracaoModeloFederado.findUniqueOrThrow({ where: { id: viva.id } });
    check("fila há 46 min é liberada só de abrir o painel", vivaDb.status === "erro", { status: vivaDb.status });
    const recente = await criarGeracao(pedido);
    await prisma.geracaoModeloFederado.update({ where: { id: recente.geracaoId }, data: { status: "processando", iniciadoEm: new Date() } });
    await ultimaGeracao(projeto.id);
    check("processando recente não é tocada", (await prisma.geracaoModeloFederado.findUniqueOrThrow({ where: { id: recente.geracaoId } })).status === "processando");
  } finally {
    const docs = await prisma.documento.findMany({ where: { projetoId: projeto.id }, select: { versoes: { select: { caminho: true } } } });
    await prisma.geracaoModeloFederado.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.documento.deleteMany({ where: { projetoId: projeto.id } });
    for (const d of docs) for (const v of d.versoes) fs.rmSync(resolverCaminho(v.caminho), { force: true });
    await prisma.conversaoModelo.deleteMany({ where: { upload: { disciplina: { projetoId: projeto.id } } } });
    await prisma.upload.deleteMany({ where: { disciplina: { projetoId: projeto.id } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    fs.rmSync(resolverCaminho(dir), { recursive: true, force: true });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
