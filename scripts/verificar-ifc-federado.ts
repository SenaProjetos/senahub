/**
 * Junta os modelos vigentes de um projeto REAL do banco de dev (sem gravar Documento) e compara: a contagem de
 * IfcProduct do federado tem de ser a soma das dos modelos. Rodar em ao menos um projeto Revit (mm) com 3+
 * disciplinas antes do merge (spec §9).
 *
 * Uso: npm run verify:ifc-federado -- <projetoId>
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { IfcAPI, IFCPRODUCT } from "web-ifc";
import { prisma } from "../src/lib/prisma";
import { resolverCaminho } from "../src/lib/storage";
import { candidatosDoProjeto } from "../src/modules/coordenacao/federado/service";
import { avaliarSelecao } from "../src/modules/coordenacao/federado/regras";
import { federar } from "../src/modules/coordenacao/federado/federacao";

function contarProdutos(api: IfcAPI, rel: string): number {
  const id = api.OpenModel(new Uint8Array(fs.readFileSync(resolverCaminho(rel))));
  try {
    return api.GetLineIDsWithType(id, IFCPRODUCT, true).size();
  } finally {
    api.CloseModel(id);
  }
}

async function main() {
  const projetoId = process.argv[2];
  if (!projetoId) throw new Error("Uso: npm run verify:ifc-federado -- <projetoId>");
  const cand = await candidatosDoProjeto(projetoId);
  const av = avaliarSelecao(cand, cand.map((c) => c.modeloId));
  for (const c of cand) {
    console.log(`${av.validos.includes(c.modeloId) ? "  entra" : "  fora "} ${c.grupo} · ${c.nome} · ${c.schema} · ${c.unidade} ${av.motivos[c.modeloId] ?? ""}`);
  }
  if (!av.podeGerar) throw new Error(av.motivoGerar ?? "nada a juntar");
  const itens = cand.filter((c) => av.validos.includes(c.modeloId)).map((c) => c.item);
  const saida = `tmp/verificar-federado-${Date.now()}.ifc`;
  const inicio = Date.now();
  try {
    const r = await federar({
      entradas: itens.map((i) => ({ caminho: i.caminho, rotulo: i.nome })),
      saida,
      cabecalho: {
        nomeArquivo: "verificacao.ifc",
        autor: "verificação",
        quando: new Date().toISOString().slice(0, 19),
        composicao: itens.map((i) => ({ nome: i.nome, grupo: i.grupo, revisao: i.revisao })),
      },
    });
    if (!r.ok) throw new Error(r.erro);
    console.log(`federado: ${(r.tamanho / 1024 / 1024).toFixed(1)} MB em ${((Date.now() - inicio) / 1000).toFixed(1)} s; avisos: ${r.avisos.join(" | ") || "nenhum"}`);

    const api = new IfcAPI();
    api.SetWasmPath(path.resolve("node_modules/web-ifc/") + path.sep, true);
    await api.Init();
    let soma = 0;
    for (const i of itens) soma += contarProdutos(api, i.caminho);
    const total = contarProdutos(api, saida);
    console.log(`IfcProduct: soma dos modelos ${soma}, federado ${total} → ${soma === total ? "OK" : "DIFERENTE"}`);
    process.exitCode = soma === total ? 0 : 1;
  } finally {
    fs.rmSync(resolverCaminho(saida), { force: true });
    fs.rmSync(resolverCaminho(`${saida}.parcial`), { force: true });
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
