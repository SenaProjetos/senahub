/**
 * Smoke da aba Estudos (Lote 5d, spec 2026-11-02-lote5d-estudos-design.md) contra o banco de dev.
 * O vitest cobre as regras puras e o service com banco falso; aqui vai o SQL de verdade: criar, salvar com
 * trava otimista (conflito e corrida de dois cliques), `updatedAt`, duplicar, limite por projeto, memória
 * exportável, excluir, cascata ao apagar o projeto, escopo de projeto (quem enxerga/edita) e a trava de
 * validação do motor.
 *
 * Cria cliente + projeto + usuários throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:estudos
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { projetoVisivel } from "../src/modules/planejamento/queries";
import { calcularEstudo } from "../src/modules/estudos/calculo";
import { conteudoSchema, lerConteudo, MAX_ESTUDOS_POR_PROJETO, type ConteudoEstudo } from "../src/modules/estudos/conteudo";
import { MOTIVO_ALTERADO_POR_OUTRA_PESSOA, MOTIVO_SEM_EDICAO, situacaoDoMotor } from "../src/modules/estudos/acesso";
import { memoriaDoEstudo } from "../src/modules/estudos/memoria";
import { estudoDoProjeto, estudosDoProjeto, liberacaoDosEstudos, podeEditarEstudosDoProjeto } from "../src/modules/estudos/queries";
import {
  MOTIVO_ESTUDO_INEXISTENTE,
  MOTIVO_LIMITE_DE_ESTUDOS,
  MOTIVO_NAO_LIBERADO,
  criarEstudo,
  duplicarEstudo,
  excluirEstudo,
  salvarEstudo,
} from "../src/modules/estudos/service";
import type { SessionUser } from "../src/lib/session";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Packer } from "docx";
import ExcelJS from "exceljs";
import { empresaParaTimbrado } from "../src/modules/configuracoes/empresa/queries";
import { MOTIVO_CONTEUDO_DE_OUTRO_TIPO } from "../src/modules/estudos/tipos";
import { conteudoSchema as conteudoCargasDemandaSchema, type ConteudoCargasDemanda } from "../src/modules/estudos/cargas-demanda/conteudo";
import { metodosDeInstalacao } from "../src/modules/estudos/cargas-demanda/entrada-estudo";
import { nomeDoArquivo, paraMemoriaDoc } from "../src/modules/estudos/cargas-demanda/relatorio/formato";
import { renderRelatorioDocx } from "../src/modules/estudos/cargas-demanda/relatorio/render-docx";
import { preencherWorkbookRelatorio } from "../src/modules/estudos/cargas-demanda/relatorio/render-xlsx";
import { abrirFaixaDoCabecalho, cabecalhoPdfDoTimbrado } from "../src/modules/estudos/cargas-demanda/relatorio/timbrado";
import { ABAS_EXCEL, ehNum, type Celula } from "../src/modules/estudos/cargas-demanda/relatorio/tipos";
import { renderMemoriaHtml } from "../src/modules/ferramentas/memoria/render-html";
import { htmlParaPdf } from "../src/modules/ferramentas/memoria/render-pdf";

const carga = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  descricao: `carga ${id}`,
  quantidade: 1,
  potenciaW: 100,
  fp: 1,
  rendimento: 1,
  fd: 1,
  tensaoV: 127,
  ligacao: "mono",
  ...over,
});

function conteudoDeTeste(): ConteudoEstudo {
  return conteudoSchema.parse({
    ambientes: [
      { id: "a1", nome: "Sala", cargas: [carga("c1", { quantidade: 4, potenciaW: 10, tipoPonto: "iluminacao" }), carga("c2", { quantidade: 2, fd: 0.5 })] },
      { id: "a2", nome: "Banheiro", cargas: [carga("c3", { descricao: "chuveiro", potenciaW: 5500, tensaoV: 220 })] },
    ],
    condicoes: {},
    fonteFatorDemanda: "Tabela de demanda de teste",
  });
}

/**
 * Estudo de cargas e demanda completo: caso 29 da planilha (52 apartamentos de 40 m² em 3 CMDs de 18 medidores, Neoenergia;
 * esperados do §5 da spec), um levantamento de habitação, a entrada do CPG e o responsável técnico com a declaração.
 */
function conteudoCargasDemanda(): ConteudoCargasDemanda {
  const linha = (id: string, descricao: string, quantidade: number, potenciaW: number, fp: number, fd: number) => ({ id, descricao, quantidade, potenciaW, fp, fd });
  const b1 = metodosDeInstalacao().find((m) => m.referencia === "B1")?.valor ?? null;
  return conteudoCargasDemandaSchema.parse({
    concessionaria: "neoenergia",
    sistema: "380/220",
    ligacao: "tri",
    criterioIluminacao: "habitacao",
    tipoEmpreendimento: "muc_residencial",
    levantamentos: [{ id: "lv1", nome: "Flat tipo A", fpIluminacao: 1, fpTomadas: 0.8, pavimentos: [{ id: "pv1", nome: "Térreo", ambientes: [
      { id: "am1", nome: "Recepção", tipo: "sala", areaM2: 18, perimetroM: 17, iluminacao: { fp: 1 }, pontos: [{ id: "pt1", tipo: "tug", fp: 0.8 }] },
      { id: "am2", nome: "Sanitário", tipo: "banheiro", areaM2: 4, perimetroM: 8, iluminacao: { fp: 1 }, pontos: [{ id: "pt2", tipo: "tug", fp: 0.8 }, { id: "pt3", tipo: "tue", descricao: "Chuveiro", quantidade: 1, vaPorPonto: 5500, fp: 1 }] },
    ] }] }],
    calculos: [
      { id: "apt", nome: "Apartamentos", metodo: "area_util", papel: "apartamentos", apartamentos: [{ id: "flat", nome: "Apartamento tipo", quantidade: 52, areaUtilM2: 40, levantamentoId: "lv1" }] },
      { id: "cond", nome: "Condomínio", metodo: "carga_instalada", papel: "condominio", linhas: [linha("l1", "Iluminação", 1, 3000, 0.8, 1), linha("l2", "Tomadas", 1, 1500, 0.8, 0.5), linha("l3", "Motor 1 cv", 1, 1520, 1, 1)] },
      { id: "inc", nome: "Incêndio", metodo: "carga_instalada", papel: "incendio", linhas: [linha("l4", "Bomba de incêndio", 1, 1520, 1, 1)] },
    ],
    centros: { cmds: [
      { id: "c1", nome: "CMD 1", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 16 }, { tipo: "condominio", calculoId: "cond" }, { tipo: "incendio", calculoId: "inc" }] },
      { id: "c2", nome: "CMD 2", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 18 }] },
      { id: "c3", nome: "CMD 3", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 18 }] },
    ] },
    entradas: [{ alvo: { nivel: "cpg" }, metodoInstalacao: b1, isolacao: "PVC", material: "cobre", carregados: 3 }],
    responsavel: { nome: "Responsável de teste", crea: "000000", uf: "CE", declaracaoConferencia: true, conferidoEm: "2026-11-13" },
  });
}

type Check = (nome: string, cond: boolean, extra?: string) => void;

async function smokeCargasDemanda(admin: SessionUser, projetoId: string, tag: string, check: Check, erroDe: (p: Promise<unknown>) => Promise<string | null>) {
  const criado = await criarEstudo(admin, { projetoId, nome: `${tag} prédio`, tipo: "cargas_demanda" });
  try {
    const novo = await estudoDoProjeto(projetoId, criado.id);
    check("cargas e demanda — criar: tipo cargas_demanda, versão 1, documento vazio", novo?.tipo === "cargas_demanda" && novo.versao === 1 && novo.conteudo?.calculos.length === 0);

    // Salvar e reabrir: o que volta do banco é o mesmo documento (só entradas; nada calculado é gravado).
    const conteudo = conteudoCargasDemanda();
    const s = await salvarEstudo(admin, { id: criado.id, versao: 1, nome: `${tag} prédio`, conteudo });
    check("cargas e demanda — salvar: versão 2", s.versao === 2);
    const reaberto = await estudoDoProjeto(projetoId, criado.id);
    check("cargas e demanda — reabrir: documento igual ao enviado", reaberto?.tipo === "cargas_demanda" && JSON.stringify(reaberto.conteudo) === JSON.stringify(conteudo));
    const gravado = (await prisma.estudoProjeto.findUniqueOrThrow({ where: { id: criado.id }, select: { conteudo: true } })).conteudo;
    check("cargas e demanda — nada calculado vai para o banco (sem demanda/corrente gravadas)", !/demandaKVA|correnteA|ibCorrigida/.test(JSON.stringify(gravado)));

    // O documento do outro tipo não serve; FP fora da faixa é recusado com o texto da spec §6.
    const outroTipo = await erroDe(salvarEstudo(admin, { id: criado.id, versao: 2, nome: "x", conteudo: { ambientes: [], condicoes: {} } }));
    check("cargas e demanda — documento de outro tipo recusado", outroTipo === MOTIVO_CONTEUDO_DE_OUTRO_TIPO, `${outroTipo}`);
    const fpRuim = structuredClone(conteudo);
    fpRuim.calculos[1].linhas[0].fp = 1.2;
    const recusaFp = await erroDe(salvarEstudo(admin, { id: criado.id, versao: 2, nome: "x", conteudo: fpRuim }));
    check("cargas e demanda — FP 1,2 recusado com o texto da spec (caso 17)", recusaFp === "Fator de potência inválido. Informe um valor maior que 0 e até 1.", `${recusaFp}`);
    check("cargas e demanda — recusas não mudam a versão", (await estudoDoProjeto(projetoId, criado.id))?.versao === 2);

    // Trava de versão: versão velha recusada; dois cliques com a mesma versão, só um grava.
    check("cargas e demanda — versão velha recusada", (await erroDe(salvarEstudo(admin, { id: criado.id, versao: 1, nome: "Perdido", conteudo }))) === MOTIVO_ALTERADO_POR_OUTRA_PESSOA);
    const corrida = await Promise.allSettled([
      salvarEstudo(admin, { id: criado.id, versao: 2, nome: `${tag} prédio A`, conteudo }),
      salvarEstudo(admin, { id: criado.id, versao: 2, nome: `${tag} prédio B`, conteudo }),
    ]);
    check("cargas e demanda — corrida: um só grava, versão 3", corrida.filter((r) => r.status === "fulfilled").length === 1 && (await estudoDoProjeto(projetoId, criado.id))?.versao === 3);

    // Duplicar leva o documento inteiro e o tipo.
    const d = await duplicarEstudo(admin, { id: criado.id });
    const copia = await estudoDoProjeto(projetoId, d.id);
    check("cargas e demanda — duplicar: mesmo tipo e mesmo documento", copia?.tipo === "cargas_demanda" && JSON.stringify(copia.conteudo) === JSON.stringify(conteudo));
    await excluirEstudo(admin, { id: d.id });

    // Relatório: os números do caso 29 (§5 da spec) chegam ao relatório montado a partir do banco.
    const exp = await memoriaDoEstudo(admin, criado.id);
    if (exp?.tipo !== "cargas_demanda") {
      check("cargas e demanda — relatório montado", false, "memoriaDoEstudo não devolveu o relatório");
      return;
    }
    const rel = exp.relatorio;
    const comp = rel.secoes.find((x) => x.numero === 5)?.blocos.find((b) => b.tipo === "tabela");
    const total = comp?.tipo === "tabela" ? comp.tabela.linhas.find((l) => l[0] === "Demanda total (kVA)") : undefined;
    const valores = (total ?? []).slice(1).map((c: Celula) => (ehNum(c) ? c.n : null));
    const esperado = [29.21, 23.82, 23.82, 55.16];
    check("cargas e demanda — relatório: CMD 1, 2, 3 e CPG = 29,21 / 23,82 / 23,82 / 55,16 kVA", valores.length === 4 && esperado.every((e, i) => valores[i] != null && Math.abs((valores[i] as number) - e) <= 0.01), JSON.stringify(valores));
    check("cargas e demanda — relatório: com declaração e CREA, sem a marca de não conferido", !rel.naoConferido);

    // Exportar nos 3 formatos, pelo mesmo caminho da rota /api/estudos/[id]/memoria.
    const empresa = await empresaParaTimbrado();
    const saida = process.env.SMOKE_ESTUDOS_SAIDA || join(tmpdir(), "smoke-estudos");
    mkdirSync(saida, { recursive: true });
    const base = join(saida, nomeDoArquivo(rel));
    const pdf = await htmlParaPdf(abrirFaixaDoCabecalho(renderMemoriaHtml(paraMemoriaDoc(rel)), empresa), { headerTemplate: cabecalhoPdfDoTimbrado(empresa) ?? undefined });
    if (pdf) writeFileSync(`${base}.pdf`, pdf);
    check("cargas e demanda — exportar PDF (precisa do CHROME_PATH)", !!pdf && pdf.subarray(0, 4).toString() === "%PDF", process.env.CHROME_PATH ? "PDF vazio" : "CHROME_PATH não definido");
    const docx = await Packer.toBuffer(renderRelatorioDocx(rel, empresa));
    writeFileSync(`${base}.docx`, docx);
    check("cargas e demanda — exportar Word (.docx é um zip)", docx.subarray(0, 2).toString() === "PK");
    const wb = new ExcelJS.Workbook();
    preencherWorkbookRelatorio(wb, rel, empresa);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    writeFileSync(`${base}.xlsx`, xlsx);
    const relido = new ExcelJS.Workbook();
    await relido.xlsx.load(xlsx as unknown as ArrayBuffer);
    check("cargas e demanda — exportar Excel: reabre com uma aba por etapa", JSON.stringify(relido.worksheets.map((w) => w.name)) === JSON.stringify(ABAS_EXCEL), relido.worksheets.map((w) => w.name).join(", "));
    console.log(`   arquivos gerados em ${saida}`);
  } finally {
    await prisma.estudoProjeto.delete({ where: { id: criado.id } }).catch(() => {});
  }
}

async function main() {
  const tag = `SMKEST_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra?: string) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${!cond && extra ? ` — ${extra}` : ""}`);
    if (!cond) ok = false;
  };
  const erroDe = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const adminDb = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true, tipo: "interno" }, select: { id: true } });
  if (!adminDb) throw new Error("Banco de dev sem superusuário interno ativo.");
  const admin = { id: adminDb.id, tipo: "interno", superUsuario: true, ativo: true } as unknown as SessionUser;

  const novoUsuario = (sufixo: string) =>
    prisma.user.create({
      data: { name: `${tag}_${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "interno", contratacao: "pj", perfil: { connect: { chave: "projetista_pj" } }, ativo: true },
    });
  const resp = await novoUsuario("resp");
  const leitor = await novoUsuario("leitor");
  const fora = await novoUsuario("fora");
  const comoSessao = (u: object) => u as unknown as SessionUser;

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: {
        ano, sequencial, codigo, tipo: "particular", nome: `${tag}_proj`, clienteId: cliente.id,
        membros: { create: [{ userId: leitor.id, papel: "projetista" }] },
        disciplinas: { create: [{ disciplinaTextoLegado: "Elétrico", ordem: 0, responsaveis: { create: [{ userId: resp.id }] } }] },
      },
    });
  });

  try {
    // 1) Criar
    const c = await criarEstudo(admin, { projetoId: projeto.id, nome: `${tag} Casa` });
    const criado = await estudoDoProjeto(projeto.id, c.id);
    check("criar: estudo nasce vazio, versão 1, tipo de cargas", !!criado && criado.versao === 1 && criado.tipo === "cargas_eletricas" && criado.conteudo?.ambientes.length === 0);

    // 2) Salvar e reler
    const t0 = (await prisma.estudoProjeto.findUniqueOrThrow({ where: { id: c.id }, select: { updatedAt: true } })).updatedAt;
    await new Promise((r) => setTimeout(r, 15));
    const conteudo = conteudoDeTeste();
    const s = await salvarEstudo(admin, { id: c.id, versao: 1, nome: `${tag} Casa 2`, conteudo });
    check("salvar: devolve a versão 2", s.versao === 2);
    const relido = await estudoDoProjeto(projeto.id, c.id);
    check("salvar: nome e conteúdo relidos iguais ao enviado", relido?.nome === `${tag} Casa 2` && JSON.stringify(relido?.conteudo) === JSON.stringify(conteudo));
    const t1 = (await prisma.estudoProjeto.findUniqueOrThrow({ where: { id: c.id }, select: { updatedAt: true } })).updatedAt;
    check("salvar: updatedAt avança (updateMany grava @updatedAt)", t1.getTime() > t0.getTime());
    const calc = relido?.tipo === "cargas_eletricas" && relido.conteudo ? calcularEstudo(relido.conteudo) : null;
    // 40 + 100 (2 × 100 × 0,5) + 5500 W demandados
    check("conta do conteúdo gravado: demanda 5640 W", Math.abs((calc?.total?.pDemandadaW ?? 0) - 5640) < 1e-6, `${calc?.total?.pDemandadaW}`);

    // 3) Conflito de versão
    const antigo = await erroDe(salvarEstudo(admin, { id: c.id, versao: 1, nome: "Perdido", conteudo }));
    check("conflito: salvar com a versão velha é recusado com a explicação", antigo === MOTIVO_ALTERADO_POR_OUTRA_PESSOA, antigo ?? "sem erro");
    check("conflito: nada foi gravado", (await estudoDoProjeto(projeto.id, c.id))?.nome === `${tag} Casa 2`);

    // 4) Corrida: dois cliques com a mesma versão → só um grava
    const corrida = await Promise.allSettled([
      salvarEstudo(admin, { id: c.id, versao: 2, nome: `${tag} A`, conteudo }),
      salvarEstudo(admin, { id: c.id, versao: 2, nome: `${tag} B`, conteudo }),
    ]);
    check("corrida: exatamente um dos dois salva", corrida.filter((r) => r.status === "fulfilled").length === 1);
    check("corrida: versão final = 3", (await estudoDoProjeto(projeto.id, c.id))?.versao === 3);

    // 5) Duplicar
    const d = await duplicarEstudo(admin, { id: c.id });
    const copia = await estudoDoProjeto(projeto.id, d.id);
    const origem = await estudoDoProjeto(projeto.id, c.id);
    check("duplicar: cópia com '(cópia)', versão 1 e o mesmo conteúdo", !!copia && copia.nome.endsWith("(cópia)") && copia.versao === 1 && JSON.stringify(copia.conteudo) === JSON.stringify(origem?.conteudo));

    // 6) Lista e resumo
    const lista = await estudosDoProjeto(projeto.id);
    const resumo = lista.find((e) => e.id === c.id);
    check("lista: 2 estudos; resumo com 2 ambientes, 3 cargas e 5,64 kW", lista.length === 2 && resumo?.ambientes === 2 && resumo?.cargas === 3 && Math.abs((resumo?.demandaKw ?? 0) - 5.64) < 1e-6);

    // 7) Escopo: o recorte por projeto vale na leitura
    check("leitura: id de estudo de OUTRO projeto não abre por este projeto", (await estudoDoProjeto("projeto-que-nao-existe", c.id)) === null);

    // 8) Memória exportável
    const mem = await memoriaDoEstudo(admin, c.id);
    const emValidacao = situacaoDoMotor() === "em_validacao";
    check("memória: montada, com a seção da fonte dos fatores", !!mem && mem.tipo === "cargas_eletricas" && mem.doc.secoes.some((x) => x.titulo.startsWith("Origem dos fatores")));
    check("memória: selo de validação segue o registro do motor", ((mem?.tipo === "cargas_eletricas" ? mem.doc.subtitulo : "") ?? "").includes("EM VALIDAÇÃO") === emValidacao);
    const vazio = await criarEstudo(admin, { projetoId: projeto.id, nome: `${tag} vazio` });
    check("memória: estudo sem cargas não exporta", (await memoriaDoEstudo(admin, vazio.id)) === null);
    await excluirEstudo(admin, { id: vazio.id });

    // 8b) Relatório do estudo de cargas e demanda: mesmo com o estudo vazio, sai com as 7 seções da spec §7.
    const cd = await criarEstudo(admin, { projetoId: projeto.id, nome: `${tag} cargas e demanda`, tipo: "cargas_demanda" });
    const rel = await memoriaDoEstudo(admin, cd.id);
    check("relatório de cargas e demanda: 7 seções e marca de não conferido", rel?.tipo === "cargas_demanda" && rel.relatorio.secoes.length === 7 && rel.relatorio.naoConferido);
    await excluirEstudo(admin, { id: cd.id });

    // 8c) Cargas e demanda de ponta a ponta: criar, salvar, reabrir, trava de versão, duplicar e exportar nos 3 formatos.
    await smokeCargasDemanda(admin, projeto.id, tag, check, erroDe);

    // 9) Limite por projeto
    const atuais = await prisma.estudoProjeto.count({ where: { projetoId: projeto.id } });
    for (let i = atuais; i < MAX_ESTUDOS_POR_PROJETO; i++) await criarEstudo(admin, { projetoId: projeto.id, nome: `${tag} #${i}` });
    check("limite: o 21º estudo é recusado", (await erroDe(criarEstudo(admin, { projetoId: projeto.id, nome: "a mais" }))) === MOTIVO_LIMITE_DE_ESTUDOS);
    check("limite: duplicar também é recusado", (await erroDe(duplicarEstudo(admin, { id: c.id }))) === MOTIVO_LIMITE_DE_ESTUDOS);

    // 10) Quem enxerga e quem edita (escopo de projeto)
    check("escopo: membro do projeto enxerga", !!(await projetoVisivel(comoSessao(leitor), projeto.id)));
    check("escopo: responsável de disciplina enxerga", !!(await projetoVisivel(comoSessao(resp), projeto.id)));
    check("escopo: quem não participa NÃO enxerga", (await projetoVisivel(comoSessao(fora), projeto.id)) === null);
    check("edição: responsável de disciplina pode", await podeEditarEstudosDoProjeto(comoSessao(resp), projeto.id));
    check("edição: membro que não é responsável NÃO pode", !(await podeEditarEstudosDoProjeto(comoSessao(leitor), projeto.id)));
    check("edição: quem não participa NÃO pode", !(await podeEditarEstudosDoProjeto(comoSessao(fora), projeto.id)));

    // 11) Trava de validação do motor, vista por quem não gere as ferramentas
    const lib = await liberacaoDosEstudos(comoSessao(resp));
    check("validação: liberação do responsável segue o registro do motor", lib.liberado === !emValidacao && lib.emValidacao === emValidacao);
    check("validação: o superusuário (gere as ferramentas) sempre vê", (await liberacaoDosEstudos(admin)).liberado);
    const doResp = await erroDe(criarEstudo(comoSessao(resp), { projetoId: projeto.id, nome: "x" }));
    const doLeitor = await erroDe(criarEstudo(comoSessao(leitor), { projetoId: projeto.id, nome: "x" }));
    const doFora = await erroDe(criarEstudo(comoSessao(fora), { projetoId: projeto.id, nome: "x" }));
    if (emValidacao) {
      check("validação: com o motor em validação, quem não gere é recusado (mesmo o responsável)", doResp === MOTIVO_NAO_LIBERADO && doLeitor === MOTIVO_NAO_LIBERADO && doFora === MOTIVO_NAO_LIBERADO, `${doResp} | ${doLeitor} | ${doFora}`);
    } else {
      // Limite já atingido acima: o responsável passa pelas travas de acesso e só esbarra no limite.
      check("escrita: responsável passa pelo acesso (cai no limite)", doResp === MOTIVO_LIMITE_DE_ESTUDOS, `${doResp}`);
      check("escrita: membro não responsável é recusado", doLeitor === MOTIVO_SEM_EDICAO, `${doLeitor}`);
      check("escrita: quem não participa é recusado", doFora !== null && doFora !== MOTIVO_LIMITE_DE_ESTUDOS, `${doFora}`);
    }

    // 12) Excluir
    await excluirEstudo(admin, { id: d.id });
    check("excluir: some do banco", (await prisma.estudoProjeto.count({ where: { id: d.id } })) === 0);
    check("excluir: de novo → 'não encontrado'", (await erroDe(excluirEstudo(admin, { id: d.id }))) === MOTIVO_ESTUDO_INEXISTENTE);

    // 13) Conteúdo ilegível não derruba a leitura
    await prisma.estudoProjeto.update({ where: { id: c.id }, data: { conteudo: { ambientes: "quebrado" } } });
    const quebrado = await estudoDoProjeto(projeto.id, c.id);
    check("conteúdo ilegível: a leitura devolve o estudo com conteudo = null", !!quebrado && quebrado.conteudo === null && lerConteudo({ x: 1 }) === null);
    const naLista = (await estudosDoProjeto(projeto.id)).find((e) => e.id === c.id);
    check("conteúdo ilegível: a lista mostra o estudo sem totais", !!naLista && naLista.cargas === null && naLista.demandaKw === null);
  } finally {
    // 14) Cascata e limpeza
    const antes = await prisma.estudoProjeto.count({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } }).catch((e) => console.error("limpeza do projeto:", e));
    const depois = await prisma.estudoProjeto.count({ where: { projetoId: projeto.id } });
    check("cascata: apagar o projeto leva os estudos junto", antes > 0 && depois === 0, `${antes} → ${depois}`);
    await prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [resp.id, leitor.id, fora.id] } } }).catch((e) => console.error("limpeza dos usuários:", e));
  }

  console.log(ok ? "\nTUDO CERTO" : "\nHÁ FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
