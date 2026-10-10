/**
 * Diagnóstico da detecção de conflitos fora do navegador: roda o MESMO núcleo puro
 * do viewer (índice → filtro de categorias → AABB → refino por malha) sobre dois
 * `.frag` já convertidos, e mostra quantos conflitos saem, de que categorias e quanto
 * tempo cada etapa levou. Serve para medir mudanças no clash com IFC real sem
 * depender do WebGL/worker do navegador.
 *
 * O `.frag` abre no Node pelo `SingleThreadedFragmentsModel` do @thatopen/fragments.
 * O alinhamento entre os dois modelos imita o autoCoordinate do viewer
 * (modelo B += coordenadas(A) − coordenadas(B)).
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/diagnostico-clash.ts <trechoNomeA> <trechoNomeB> [toleranciaMm]
 *   ex.: ... scripts/diagnostico-clash.ts ARQ-BS EST-BS 1
 * Só lê (banco e arquivos); não grava nada.
 */
import "dotenv/config";
import fs from "node:fs/promises";
import * as THREE from "three";
import { SingleThreadedFragmentsModel } from "@thatopen/fragments";
import { prisma } from "../src/lib/prisma";
import { resolverCaminho } from "../src/lib/storage";
import { listarElementos, normalizarNo } from "../src/modules/coordenacao/indice-elementos";
import { detectarConflitos, entraNoClash, type Caixa } from "../src/modules/coordenacao/clash";
import {
  refinarComponentesTriangulos,
  triangulosDaMalha,
  type ComponenteTriangulosClash,
} from "../src/modules/coordenacao/clash-malha";
import { paresDeCategorias, agruparConflitos, rotuloCategoria } from "../src/modules/coordenacao/conflitos-lista";

type Modelo = { nome: string; m: SingleThreadedFragmentsModel; categoria: Map<number, string>; coords: number[] };

async function abrir(trecho: string): Promise<Modelo> {
  const convs = await prisma.conversaoModelo.findMany({
    where: { status: "concluido", caminhoFrag: { not: null } },
    select: {
      id: true,
      caminhoFrag: true,
      upload: { select: { nomeArquivo: true } },
      documentoVersao: { select: { nomeArquivo: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const alvo = convs.find((c) => (c.upload?.nomeArquivo ?? c.documentoVersao?.nomeArquivo ?? "").includes(trecho));
  if (!alvo) throw new Error(`Nenhum modelo convertido com "${trecho}" no nome.`);
  const buf = new Uint8Array(await fs.readFile(resolverCaminho(alvo.caminhoFrag!)));
  const m = new SingleThreadedFragmentsModel(alvo.id, buf);
  const elementos = listarElementos(normalizarNo(m.getSpatialStructure()));
  return {
    nome: alvo.upload?.nomeArquivo ?? alvo.documentoVersao?.nomeArquivo ?? alvo.id,
    m,
    categoria: new Map(elementos.map((e) => [e.localId, e.category])),
    coords: m.getCoordinates(),
  };
}

/** Caixa e triângulos (espaço comum) de cada item com geometria que entra no clash. */
function geometria(mod: Modelo, deslocamento: THREE.Vector3) {
  const ids = [...new Set(mod.m.getItemsWithGeometry())].filter((id) => entraNoClash(mod.categoria.get(id)));
  const caixas: Caixa[] = [];
  const malhas = new Map<number, ComponenteTriangulosClash[]>();
  const desl = new THREE.Matrix4().makeTranslation(deslocamento.x, deslocamento.y, deslocamento.z);
  const matriz = new THREE.Matrix4();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const geos = mod.m.getItemsGeometry(lote);
    lote.forEach((id, k) => {
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      const componentes: ComponenteTriangulosClash[] = [];
      for (const g of (geos[k] ?? []) as { positions?: Float32Array; indices?: Uint32Array; transform: THREE.Matrix4 }[]) {
        if (!g.positions || g.positions.length < 9) continue;
        matriz.copy(desl).multiply(g.transform);
        const triangulos = triangulosDaMalha({ positions: g.positions, indices: g.indices, matriz: matriz.elements });
        for (const t of triangulos) {
          for (let e = 0; e < 3; e++) {
            min[e] = Math.min(min[e], t.min[e]);
            max[e] = Math.max(max[e], t.max[e]);
          }
        }
        if (triangulos.length) componentes.push(triangulos);
      }
      if (!componentes.length) return;
      caixas.push({ localId: id, min, max });
      malhas.set(id, componentes);
    });
  }
  return { caixas, malhas };
}

async function main() {
  const [trechoA, trechoB, tolArg] = process.argv.slice(2);
  if (!trechoA || !trechoB) throw new Error("Uso: diagnostico-clash.ts <trechoNomeA> <trechoNomeB> [toleranciaMm]");
  const tolerancia = (tolArg ? Number(tolArg) : 1) / 1000;
  const A = await abrir(trechoA);
  const B = await abrir(trechoB);
  console.log(`A = ${A.nome}\nB = ${B.nome}`);

  let t = Date.now();
  const a = geometria(A, new THREE.Vector3());
  const b = geometria(B, new THREE.Vector3(A.coords[0] - B.coords[0], A.coords[1] - B.coords[1], A.coords[2] - B.coords[2]));
  console.log(`itens no clash: A=${a.caixas.length} B=${b.caixas.length} (geometria em ${Date.now() - t} ms)`);

  t = Date.now();
  const aabb = detectarConflitos(a.caixas, b.caixas, tolerancia);
  console.log(`AABB: ${aabb.length} conflitos em ${Date.now() - t} ms`);

  t = Date.now();
  const contagem = { intersecta: 0, separada: 0, inconclusiva: 0 };
  const finais = [];
  for (const c of aabb) {
    const r = await refinarComponentesTriangulos(a.malhas.get(c.localIdA)!, b.malhas.get(c.localIdB)!, {
      cederControle: async () => {},
    });
    contagem[r.status] += 1;
    if (r.status !== "separada") finais.push(c);
  }
  console.log(`malha: ${JSON.stringify(contagem)} em ${((Date.now() - t) / 1000).toFixed(1)} s`);

  const listaveis = finais.map((c) => ({
    a: { modeloId: "A", localId: c.localIdA, categoria: A.categoria.get(c.localIdA) ?? null, nome: null },
    b: { modeloId: "B", localId: c.localIdB, categoria: B.categoria.get(c.localIdB) ?? null, nome: null },
    profundidade: c.profundidade,
  }));
  console.log(`\nfinais: ${listaveis.length} conflitos em ${agruparConflitos(listaveis).length} elementos de A`);
  for (const par of paresDeCategorias(listaveis).slice(0, 15)) {
    console.log(`  ${String(par.total).padStart(5)}  ${rotuloCategoria(par.categoriaA)} × ${rotuloCategoria(par.categoriaB)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
