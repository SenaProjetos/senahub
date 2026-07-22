/**
 * Georreferenciar um IFC (IfcMapConversion, IFC4) — rodado em CHILD PROCESS pelo
 * orquestrador src/modules/coordenacao/georreferenciamento.ts. Mesmo isolamento do
 * scripts/converter-ifc.ts / deslocar-ifc.ts (web-ifc WASM é CPU/memória pesada).
 *
 * NÃO move geometria: cria (ou edita) o IfcMapConversion que declara onde a ORIGEM
 * do modelo cai no CRS projetado de destino (Eastings/Northings/OrthogonalHeight),
 * com rotação da grade dada por (XAxisAbscissa, XAxisOrdinate) = (cos θ, sin θ).
 * Só IFC4 (IFC2X3 usa IfcSite.RefLatitude/Longitude — fora do escopo do v1).
 *
 * Contrato (caminhos RELATIVOS a STORAGE_BASE_PATH):
 *   ler:    npx tsx … georref-ifc.ts ler <ifcRel>
 *           → {"ok":true,"georref":{crsName,eastings,northings,orthogonalHeight,rotacaoGraus,escala}|null}
 *   gravar: npx tsx … georref-ifc.ts gravar <ifcRel> <saidaRel> <crsName> <e> <n> <h> <rot> <escala|->
 *           → {"ok":true,"tamanho":N,"modo":"criado"|"editado","crsName":"…"}
 *   erro:   {"ok":false,"erro":"…"} + exit 1
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  IfcAPI,
  IFC4,
  Handle,
  IFCMAPCONVERSION,
  IFCGEOMETRICREPRESENTATIONCONTEXT,
} from "web-ifc";
import { resolverCaminho } from "../src/lib/storage";
import { TAMANHO_MAX_IFC, validarHeaderIfc } from "../src/modules/coordenacao/conversao-estado";
import {
  validarGeorref,
  rotacaoParaEixo,
  eixoParaRotacao,
  type GeorrefParams,
} from "../src/modules/coordenacao/georref";

function emitir(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

/** ExpressID referenciado por um Handle/valor do web-ifc, ou null. */
function refId(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === "object" && "value" in (x as Record<string, unknown>)) {
    const v = (x as { value: unknown }).value;
    return typeof v === "number" ? v : null;
  }
  return typeof x === "number" ? x : null;
}

/** Valor numérico de um NumberHandle/measure (.value) ou número cru; null caso contrário. */
function numVal(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === "number") return x;
  if (typeof x === "object" && "value" in (x as Record<string, unknown>)) {
    const v = (x as { value: unknown }).value;
    return typeof v === "number" ? v : null;
  }
  return null;
}

function strVal(x: unknown): string | null {
  if (x == null) return null;
  if (typeof x === "string") return x;
  if (typeof x === "object" && "value" in (x as Record<string, unknown>)) {
    const v = (x as { value: unknown }).value;
    return typeof v === "string" ? v : null;
  }
  return null;
}

async function abrir(ifcRel: string): Promise<{ api: IfcAPI; modelID: number }> {
  const ifcAbs = resolverCaminho(ifcRel);
  const stat = await fs.stat(ifcAbs);
  if (stat.size > TAMANHO_MAX_IFC) {
    throw new Error(`IFC de ${(stat.size / 1024 / 1024).toFixed(0)} MB excede o limite.`);
  }
  const bytes = new Uint8Array(await fs.readFile(ifcAbs));
  const header = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const check = validarHeaderIfc(header);
  if (!check.ok) throw new Error(check.motivo);
  if (!/FILE_SCHEMA\s*\(\s*\(\s*'IFC4/i.test(header)) {
    throw new Error(
      "Georreferenciamento por IfcMapConversion exige IFC4. Este arquivo parece IFC2X3 — exporte como IFC4 no Revit/plataforma.",
    );
  }
  const api = new IfcAPI();
  api.SetWasmPath(path.resolve("node_modules/web-ifc/") + path.sep, true);
  await api.Init();
  const modelID = api.OpenModel(bytes);
  return { api, modelID };
}

/** Lê o georref atual (IfcMapConversion + TargetCRS), ou null se não houver. */
function lerGeorref(api: IfcAPI, modelID: number): GeorrefParams | null {
  const ids = api.GetLineIDsWithType(modelID, IFCMAPCONVERSION);
  if (ids.size() === 0) return null;
  const mc = api.GetLine(modelID, ids.get(0));
  const eastings = numVal(mc?.Eastings);
  const northings = numVal(mc?.Northings);
  const orthogonalHeight = numVal(mc?.OrthogonalHeight);
  if (eastings == null || northings == null || orthogonalHeight == null) return null;
  const rot = eixoParaRotacao(numVal(mc?.XAxisAbscissa), numVal(mc?.XAxisOrdinate)) ?? 0;

  let crsName = "";
  const crsId = refId(mc?.TargetCRS);
  if (crsId != null) crsName = strVal(api.GetLine(modelID, crsId)?.Name) ?? "";

  return { crsName, eastings, northings, orthogonalHeight, rotacaoGraus: rot, escala: numVal(mc?.Scale) };
}

/** Cria ou edita o IfcMapConversion com os valores dados. Retorna o modo aplicado. */
function gravarGeorref(api: IfcAPI, modelID: number, p: GeorrefParams): "criado" | "editado" {
  const { abscissa, ordinate } = rotacaoParaEixo(p.rotacaoGraus);
  const ids = api.GetLineIDsWithType(modelID, IFCMAPCONVERSION);

  if (ids.size() > 0) {
    // EDITAR: sobrescreve valores do IfcMapConversion existente (+ Name do TargetCRS).
    const mc = api.GetLine(modelID, ids.get(0));
    mc.Eastings = new IFC4.IfcLengthMeasure(p.eastings);
    mc.Northings = new IFC4.IfcLengthMeasure(p.northings);
    mc.OrthogonalHeight = new IFC4.IfcLengthMeasure(p.orthogonalHeight);
    mc.XAxisAbscissa = new IFC4.IfcReal(abscissa);
    mc.XAxisOrdinate = new IFC4.IfcReal(ordinate);
    mc.Scale = p.escala != null ? new IFC4.IfcReal(p.escala) : null;
    api.WriteLine(modelID, mc);

    const crsId = refId(mc?.TargetCRS);
    if (crsId != null) {
      const crs = api.GetLine(modelID, crsId);
      crs.Name = new IFC4.IfcLabel(p.crsName);
      api.WriteLine(modelID, crs);
    }
    return "editado";
  }

  // CRIAR: precisa do contexto geométrico "Model" como SourceCRS.
  const ctxIds = api.GetLineIDsWithType(modelID, IFCGEOMETRICREPRESENTATIONCONTEXT);
  if (ctxIds.size() === 0) throw new Error("Modelo sem contexto geométrico — não é possível georreferenciar.");
  let ctxId = ctxIds.get(0);
  for (let i = 0; i < ctxIds.size(); i++) {
    const c = api.GetLine(modelID, ctxIds.get(i));
    if (strVal(c?.ContextType)?.toLowerCase() === "model") {
      ctxId = ctxIds.get(i);
      break;
    }
  }

  let proximoId = api.GetMaxExpressID(modelID) + 1;
  const crsId = proximoId++;
  const crs = new IFC4.IfcProjectedCRS(new IFC4.IfcLabel(p.crsName), null, null, null, null, null, null);
  (crs as unknown as { expressID: number }).expressID = crsId;
  api.WriteLine(modelID, crs as never);

  const mcId = proximoId++;
  const mc = new IFC4.IfcMapConversion(
    new Handle(ctxId),
    new Handle(crsId),
    new IFC4.IfcLengthMeasure(p.eastings),
    new IFC4.IfcLengthMeasure(p.northings),
    new IFC4.IfcLengthMeasure(p.orthogonalHeight),
    new IFC4.IfcReal(abscissa),
    new IFC4.IfcReal(ordinate),
    p.escala != null ? new IFC4.IfcReal(p.escala) : null,
  );
  (mc as unknown as { expressID: number }).expressID = mcId;
  api.WriteLine(modelID, mc as never);
  return "criado";
}

async function main() {
  const modo = process.argv[2];
  const ifcRel = process.argv[3];
  if (!modo || !ifcRel) throw new Error("Uso: georref-ifc.ts <ler|gravar> <ifcRel> [...]");

  if (modo === "ler") {
    const { api, modelID } = await abrir(ifcRel);
    try {
      emitir({ ok: true, georref: lerGeorref(api, modelID) });
    } finally {
      api.CloseModel(modelID);
    }
    process.exit(0);
  }

  if (modo === "gravar") {
    const saidaRel = process.argv[4];
    const escalaArg = process.argv[10];
    const p: GeorrefParams = {
      crsName: process.argv[5] ?? "",
      eastings: Number(process.argv[6]),
      northings: Number(process.argv[7]),
      orthogonalHeight: Number(process.argv[8]),
      rotacaoGraus: Number(process.argv[9]),
      escala: escalaArg && escalaArg !== "-" ? Number(escalaArg) : null,
    };
    if (!saidaRel) throw new Error("Uso: georref-ifc.ts gravar <ifcRel> <saidaRel> <crsName> <e> <n> <h> <rot> <escala|->");
    const val = validarGeorref(p);
    if (!val.ok) throw new Error(val.motivo);

    const { api, modelID } = await abrir(ifcRel);
    try {
      const modoAplicado = gravarGeorref(api, modelID, p);
      const out = api.SaveModel(modelID);
      const saidaAbs = resolverCaminho(saidaRel);
      await fs.mkdir(path.dirname(saidaAbs), { recursive: true });
      await fs.writeFile(saidaAbs, Buffer.from(out));
      emitir({ ok: true, tamanho: out.byteLength, modo: modoAplicado, crsName: p.crsName });
    } finally {
      api.CloseModel(modelID);
    }
    process.exit(0);
  }

  throw new Error(`Modo desconhecido: ${modo}`);
}

main().catch((e) => {
  emitir({ ok: false, erro: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
