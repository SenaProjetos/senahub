/**
 * Passo 0 da Onda C3 (custos/quantitativos) — diagnóstico TEMPORÁRIO: quantos
 * elementos de um IFC real trazem `IfcElementQuantity` (Qto_*), por categoria, e
 * quais nomes de grandeza aparecem (NetSideArea vs GrossSideArea, etc.).
 *
 * Existe porque o parser atual do viewer (item-data.ts) só lê IfcPropertySet
 * (Pset_*) — nunca leu Quantities. Antes de escrever o extrator de verdade
 * (quantidades-ifc.ts), precisa saber se o dado existe no arquivo real do usuário,
 * porque exportadores IFC costumam deixar "exportar quantidades base" desligado.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/diagnostico-quantidades-ifc.ts <ifcRelOuAbsoluto>
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  IfcAPI,
  IFCELEMENTQUANTITY,
  IFCRELDEFINESBYPROPERTIES,
  IFCWALL,
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCCOLUMN,
  IFCBEAM,
  IFCDOOR,
  IFCWINDOW,
  IFCROOF,
  IFCSTAIR,
  IFCFOOTING,
  IFCCOVERING,
  IFCRAILING,
} from "web-ifc";
import { resolverCaminho } from "../src/lib/storage";

const CATEGORIAS: { nome: string; tipo: number }[] = [
  { nome: "IFCWALL", tipo: IFCWALL },
  { nome: "IFCWALLSTANDARDCASE", tipo: IFCWALLSTANDARDCASE },
  { nome: "IFCSLAB", tipo: IFCSLAB },
  { nome: "IFCCOLUMN", tipo: IFCCOLUMN },
  { nome: "IFCBEAM", tipo: IFCBEAM },
  { nome: "IFCDOOR", tipo: IFCDOOR },
  { nome: "IFCWINDOW", tipo: IFCWINDOW },
  { nome: "IFCROOF", tipo: IFCROOF },
  { nome: "IFCSTAIR", tipo: IFCSTAIR },
  { nome: "IFCFOOTING", tipo: IFCFOOTING },
  { nome: "IFCCOVERING", tipo: IFCCOVERING },
  { nome: "IFCRAILING", tipo: IFCRAILING },
];

/** ExpressID referenciado por um Handle do web-ifc ({value:N}) ou número cru. */
function refId(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === "object" && "value" in (x as Record<string, unknown>)) {
    const v = (x as { value: unknown }).value;
    return typeof v === "number" ? v : null;
  }
  return typeof x === "number" ? x : null;
}

function refIds(x: unknown): number[] {
  if (Array.isArray(x)) return x.map(refId).filter((v): v is number => v != null);
  const one = refId(x);
  return one != null ? [one] : [];
}

function textoDe(x: unknown): string | null {
  if (x == null) return null;
  if (typeof x === "object" && "value" in (x as Record<string, unknown>)) {
    const v = (x as { value: unknown }).value;
    return typeof v === "string" ? v : null;
  }
  return typeof x === "string" ? x : null;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Uso: diagnostico-quantidades-ifc.ts <ifcRelOuAbsoluto>");
  const ifcAbs = path.isAbsolute(arg) ? arg : resolverCaminho(arg);

  const bytes = new Uint8Array(await fs.readFile(ifcAbs));

  const api = new IfcAPI();
  api.SetWasmPath(path.resolve("node_modules/web-ifc/") + path.sep, true);
  await api.Init();

  let modelID = -1;
  try {
    modelID = api.OpenModel(bytes);

    // Mapa elementoId → ids das IfcPropertySetDefinition (Pset OU ElementQuantity)
    // vinculadas via IfcRelDefinesByProperties.
    const relIds = api.GetLineIDsWithType(modelID, IFCRELDEFINESBYPROPERTIES);
    const defsPorElemento = new Map<number, number[]>();
    for (let i = 0; i < relIds.size(); i++) {
      const rel = api.GetLine(modelID, relIds.get(i));
      const defId = refId(rel?.RelatingPropertyDefinition);
      if (defId == null) continue;
      for (const elId of refIds(rel?.RelatedObjects)) {
        const lista = defsPorElemento.get(elId) ?? [];
        lista.push(defId);
        defsPorElemento.set(elId, lista);
      }
    }

    const qtyIds = api.GetLineIDsWithType(modelID, IFCELEMENTQUANTITY);
    const qtySet = new Set<number>();
    for (let i = 0; i < qtyIds.size(); i++) qtySet.add(qtyIds.get(i));

    console.log(`\nArquivo: ${ifcAbs}`);
    console.log(`Total de IfcElementQuantity no modelo: ${qtySet.size}\n`);

    const nomesGrandeza = new Map<string, number>(); // "IFCQUANTITYAREA:NetSideArea" → contagem

    console.log("Categoria".padEnd(14), "total".padStart(6), "c/qty".padStart(6), "%".padStart(6));
    console.log("-".repeat(36));

    for (const cat of CATEGORIAS) {
      const ids = api.GetLineIDsWithType(modelID, cat.tipo);
      const total = ids.size();
      if (total === 0) continue;

      let comQty = 0;
      for (let i = 0; i < total; i++) {
        const elId = ids.get(i);
        const defs = defsPorElemento.get(elId) ?? [];
        const qtyDefs = defs.filter((d) => qtySet.has(d));
        if (qtyDefs.length > 0) comQty++;

        for (const qId of qtyDefs) {
          const qLine = api.GetLine(modelID, qId);
          for (const qtyRefIdVal of refIds(qLine?.Quantities)) {
            const qtyLine = api.GetLine(modelID, qtyRefIdVal);
            const tipoCodigo = api.GetLineType(modelID, qtyRefIdVal);
            const tipoNome = api.GetNameFromTypeCode(tipoCodigo);
            const nome = textoDe(qtyLine?.Name) ?? "(sem nome)";
            const chave = `${tipoNome}:${nome}`;
            nomesGrandeza.set(chave, (nomesGrandeza.get(chave) ?? 0) + 1);
          }
        }
      }

      const pct = total > 0 ? ((comQty / total) * 100).toFixed(0) : "0";
      console.log(cat.nome.padEnd(14), String(total).padStart(6), String(comQty).padStart(6), `${pct}%`.padStart(6));
    }

    console.log("\nGrandezas encontradas no modelo (tipo:nome → em quantos elementos):");
    if (nomesGrandeza.size === 0) {
      console.log("  NENHUMA — nenhum IfcPhysicalQuantity referenciado a partir de nenhum Rel encontrado.");
    } else {
      for (const [chave, n] of [...nomesGrandeza.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${chave}: ${n}`);
      }
    }
    console.log("");
  } finally {
    if (modelID >= 0) api.CloseModel(modelID);
  }
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
