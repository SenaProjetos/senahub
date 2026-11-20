/**
 * Smoke dos modelos 3D do portal (spec docs/superpowers/specs/2026-11-20-portal-visualizador-3d-design.md, "O que o
 * cliente vê" e "Modelo realinhado (D4)") contra o banco de dev. As regras puras da cadeia estão em
 * `modules/portal/modelo3d/regras.test.ts`; aqui vai a ligação com o banco: o realinhamento gravando `realinhadoDeId`
 * pelo caminho real, a lista do portal (realinhado no lugar da origem, recebido do cliente incluído, interno e fora das
 * Entregas não), a regra da rota (U ou descendente de U, recebido na última versão, nunca outro projeto/cliente) e o
 * streaming do `.frag` (ETag e 304).
 *
 * Cria clientes + projetos + uploads + documentos + contas throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:portal-modelo3d
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { removerArquivo, resolverCaminho, salvarArquivo } from "../src/lib/storage";
import { servirFrag } from "../src/lib/frag-stream";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";
import { realinharModelo, type SpawnDeslocar } from "../src/modules/coordenacao/deslocamento";
import { refDocumento } from "../src/modules/coordenacao/modelo-ref";
import { modeloPermitidoNoPortal, modelosDoPortal } from "../src/modules/portal/modelo3d/queries";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const tag = `SMKMOD3D_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra?: unknown) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${!cond && extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
    if (!cond) ok = false;
  };

  const coord = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!coord) throw new Error("Banco de dev sem usuário ativo.");

  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];
  const arquivos: string[] = [];

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
          disciplinas: {
            create: [
              { disciplinaTextoLegado: "Estrutural", ordem: 0 },
              { disciplinaTextoLegado: "Hidráulica", ordem: 1 },
            ],
          },
        },
        include: { disciplinas: { orderBy: { ordem: "asc" } } },
      });
    });
    projetos.push(p.id);
    return { ...p, estruturalId: p.disciplinas[0].id, hidraulicaId: p.disciplinas[1].id };
  };
  const novaConta = async (clienteId: string, sufixo: string) => {
    const u = await prisma.user.create({
      data: { name: `Mariana ${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "externo", clienteId },
    });
    usuarios.push(u.id);
    const tipo = tipoTermoPorTipo("externo");
    await prisma.aceiteTermo.create({ data: { userId: u.id, tipo, versao: TERMOS[tipo].versao, conteudoHash: "0".repeat(64) } });
    return { id: u.id, tipo: "externo" as const, mustChangePassword: false };
  };
  /** IFC validado numa revisão publicada do pacote A; `compartilhar` = nas Entregas (enviado ao cliente). */
  const ifc = async (disciplinaId: string, nome: string, o: { compartilhar: boolean }) => {
    const doc = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-${nome}`, nomeArquivo: `${tag}-${nome}.ifc` },
    });
    const rev = await prisma.documentoRevisao.create({
      data: { documentoId: doc.id, numero: 1, createdById: coord.id, estado: "publicado" },
    });
    const up = await prisma.upload.create({
      data: {
        disciplinaId,
        documentoId: doc.id,
        revisaoId: rev.id,
        pacote: "A",
        nomeArquivo: `${tag}-${nome}.ifc`,
        caminho: `smoke/${tag}/${nome}.ifc`,
        tamanho: 10,
        hashSha256: "0".repeat(64),
        autorId: coord.id,
        validado: true,
      },
    });
    if (o.compartilhar) {
      await prisma.documentoDisciplina.update({ where: { id: doc.id }, data: { revisaoCompartilhadaId: rev.id } });
      await prisma.controleRevisao.create({ data: { revisaoId: rev.id, tipo: "enviado_cliente", motivo: "smoke", aplicadoPorId: coord.id } });
    }
    return { doc, rev, up };
  };
  /** Conversão concluída com um `.frag` de verdade no disco (a rota lê o tamanho e faz streaming). */
  const converter = async (alvo: { uploadId: string } | { documentoVersaoId: string }, nome: string) => {
    const caminhoFrag = `smoke/${tag}/${nome}.frag`;
    await salvarArquivo(caminhoFrag, Buffer.from(`frag ${nome}`));
    arquivos.push(caminhoFrag);
    const dados = { status: "concluido", caminhoFrag, concluidoEm: new Date() };
    if ("uploadId" in alvo) {
      await prisma.conversaoModelo.upsert({ where: { uploadId: alvo.uploadId }, create: { ...alvo, ...dados }, update: dados });
    } else {
      await prisma.conversaoModelo.create({ data: { ...alvo, ...dados } });
    }
    return caminhoFrag;
  };
  /** Documento do cliente (recebido) ou do Geral (interno) com uma versão IFC. */
  const documento = async (clienteId: string, projetoId: string, origem: "recebido_cliente" | "interno", nome: string) => {
    const d = await prisma.documento.create({
      data: {
        clienteId,
        projetoId,
        origem,
        nome: `${tag}-${nome}`,
        // O Geral marcado para Recebidos: só a equipe vê. O portal nunca pode passar `incluirCompartilhadosDoGeral`.
        exibirEmRecebidos: origem === "interno",
        versoes: {
          create: [
            {
              numero: 1,
              caminho: `smoke/${tag}/${nome}.ifc`,
              nomeArquivo: `${nome}.ifc`,
              mime: "application/octet-stream",
              tamanho: 10,
              hashSha256: "0".repeat(64),
            },
          ],
        },
      },
      include: { versoes: true },
    });
    return { doc: d, versao: d.versoes[0] };
  };

  // O child do deslocamento, falso: escreve o arquivo de saída e devolve o JSON que o real devolveria.
  const spawnFalso: SpawnDeslocar = async ({ saidaRel }) => {
    const abs = resolverCaminho(saidaRel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, "ISO-10303-21; realinhado");
    arquivos.push(saidaRel);
    return { code: 0, stdout: JSON.stringify({ ok: true, tamanho: 24, deslocados: 1, prefixo: null }), stderr: "" };
  };
  /** O enfileiramento do realinhamento roda solto (sem worker aqui): espera a linha dele antes de concluir à mão. */
  const esperarFila = async (uploadId: string) => {
    for (let i = 0; i < 50; i++) {
      if (await prisma.conversaoModelo.findUnique({ where: { uploadId }, select: { id: true } })) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  try {
    const cliente = await novoCliente("cli");
    const outro = await novoCliente("outro");
    const p1 = await novoProjeto(cliente.id, "p1");
    const p2 = await novoProjeto(outro.id, "p2");
    const conta = await novaConta(cliente.id, "cli");

    // U nas Entregas, convertido.
    const u = await ifc(p1.estruturalId, "estrutura", { compartilhar: true });
    await converter({ uploadId: u.up.id }, "u");

    // R1: realinhamento de U pelo caminho real (deslocamento.ts), com o child falso.
    const r = await realinharModelo({ uploadId: u.up.id, vetor: [1, 0, 0], autorId: coord.id }, spawnFalso);
    const r1 = await prisma.upload.findUnique({ where: { id: r.uploadId }, select: { id: true, realinhadoDeId: true, origem: true } });
    check("realinharUpload grava realinhadoDeId", r1?.realinhadoDeId === u.up.id && r1.origem === "ferramenta", r1);
    await esperarFila(r.uploadId);
    await converter({ uploadId: r.uploadId }, "r1");

    // X: IFC convertido de outra disciplina, fora das Entregas. Y: ferramenta sem ligação.
    const x = await ifc(p1.hidraulicaId, "hidro", { compartilhar: false });
    await converter({ uploadId: x.up.id }, "x");
    const y = await prisma.upload.create({
      data: {
        disciplinaId: p1.estruturalId,
        pacote: "A",
        nomeArquivo: `${tag}-estrutura.ifc`,
        caminho: `smoke/${tag}/y.ifc`,
        tamanho: 10,
        hashSha256: "0".repeat(64),
        autorId: coord.id,
        versao: 9,
        origem: "ferramenta",
      },
    });
    await converter({ uploadId: y.id }, "y");

    // Recebido do cliente e interno do Geral, os dois IFC convertidos.
    const recebido = await documento(cliente.id, p1.id, "recebido_cliente", "base");
    await converter({ documentoVersaoId: recebido.versao.id }, "recebido");
    const interno = await documento(cliente.id, p1.id, "interno", "interno");
    await converter({ documentoVersaoId: interno.versao.id }, "interno");

    // IFC do outro cliente, nas Entregas dele.
    const alheio = await ifc(p2.estruturalId, "alheio", { compartilhar: true });
    await converter({ uploadId: alheio.up.id }, "alheio");

    // ── lista ──
    const lista = (await modelosDoPortal(conta, p1.id)) ?? [];
    const ids = lista.map((m) => m.modeloId);
    const daOrigem = lista.find((m) => m.origemUploadId === u.up.id);
    const doRecebido = lista.find((m) => m.modeloId === refDocumento(recebido.versao.id));
    check(
      "lista: realinhado no lugar da origem, recebido incluído, interno e fora das Entregas não",
      lista.length === 2 &&
        daOrigem?.modeloId === r.uploadId &&
        daOrigem.origem === "entrega" &&
        daOrigem.situacao === "pronto" &&
        daOrigem.disciplinaId === p1.estruturalId &&
        daOrigem.rotulo === "Estrutural · R00" &&
        daOrigem.nomeArquivo === `${tag}-estrutura.ifc` &&
        daOrigem.url === `/api/portal/projetos/${p1.id}/modelos/${r.uploadId}` &&
        doRecebido?.origem === "cliente" &&
        doRecebido.documentoRecebidoId === recebido.doc.id &&
        doRecebido.origemUploadId === null &&
        doRecebido.rotulo === "Referência enviada por você · base.ifc" &&
        doRecebido.nomeArquivo === "base.ifc" &&
        doRecebido.situacao === "pronto" &&
        !ids.includes(u.up.id) &&
        !ids.includes(x.up.id) &&
        !ids.includes(y.id) &&
        !ids.includes(refDocumento(interno.versao.id)),
      lista,
    );
    check("lista: projeto de outro cliente = sem acesso", (await modelosDoPortal(conta, p2.id)) === null);

    // ── rota ──
    const pode = async (projetoId: string, modeloId: string) => (await modeloPermitidoNoPortal(conta, projetoId, modeloId)) !== null;
    const permitidoU = await modeloPermitidoNoPortal(conta, p1.id, u.up.id);
    const permitidoR1 = await modeloPermitidoNoPortal(conta, p1.id, r.uploadId);
    check(
      "rota: serve U, R1 e o recebido; recusa X, Y, o IFC interno e o projeto de outro cliente",
      permitidoU?.origemUploadId === u.up.id &&
        permitidoR1?.origemUploadId === u.up.id &&
        permitidoR1.caminhoFrag === `smoke/${tag}/r1.frag` &&
        (await pode(p1.id, refDocumento(recebido.versao.id))) &&
        !(await pode(p1.id, x.up.id)) &&
        !(await pode(p1.id, y.id)) &&
        !(await pode(p1.id, refDocumento(interno.versao.id))) &&
        !(await pode(p1.id, alheio.up.id)) &&
        !(await pode(p2.id, alheio.up.id)) &&
        !(await pode(p2.id, u.up.id)),
    );

    // ── streaming ──
    const p = permitidoR1 as NonNullable<typeof permitidoR1>;
    const resp = await servirFrag(new Request("http://smoke.local/frag"), p.caminhoFrag, p.concluidoEm, r.uploadId);
    const etag = resp.headers.get("etag");
    const corpo = await resp.text();
    const resp304 = await servirFrag(
      new Request("http://smoke.local/frag", { headers: { "if-none-match": etag ?? "" } }),
      p.caminhoFrag,
      p.concluidoEm,
      r.uploadId,
    );
    check(
      "frag: 200 com o arquivo e ETag; 304 no If-None-Match",
      resp.status === 200 && corpo === "frag r1" && etag === `"${r.uploadId}-${p.concluidoEm?.getTime()}"` && resp304.status === 304,
      { status: resp.status, etag, corpo, s304: resp304.status },
    );

    // ── sem conversão ──
    const semConv = await ifc(p1.hidraulicaId, "semconv", { compartilhar: true });
    const lista2 = (await modelosDoPortal(conta, p1.id)) ?? [];
    const prep = lista2.find((m) => m.origemUploadId === semConv.up.id);
    check(
      "IFC sem conversão aparece como preparando, sem url",
      prep?.situacao === "preparando" && prep.url === null && prep.modeloId === semConv.up.id && !(await pode(p1.id, semConv.up.id)),
      prep,
    );

    // ── bloqueio de download ──
    await prisma.controleRevisao.create({
      data: { revisaoId: u.rev.id, tipo: "bloqueio", escopos: ["download"], motivo: "smoke", aplicadoPorId: coord.id },
    });
    const lista3 = (await modelosDoPortal(conta, p1.id)) ?? [];
    check(
      "bloqueio de download tira o modelo",
      !lista3.some((m) => m.origemUploadId === u.up.id) && !(await pode(p1.id, u.up.id)) && !(await pode(p1.id, r.uploadId)),
      lista3.map((m) => m.modeloId),
    );
  } finally {
    for (const c of arquivos) await removerArquivo(c).catch(() => {});
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
