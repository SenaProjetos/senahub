/**
 * Deslocar (realinhar) um IFC por um vetor (dx,dy,dz) — rodado em CHILD PROCESS pelo
 * orquestrador src/modules/coordenacao/deslocamento.ts. Mesmo padrão/isolamento do
 * scripts/converter-ifc.ts: o web-ifc (WASM) pode alocar vários GB e é CPU-bound —
 * rodar inline no server.ts travaria o event loop; o child libera a memória ao sair
 * e um crash do WASM não derruba o servidor.
 *
 * Estratégia (equivalente ao ifcpatch OffsetObjectPlacements, mas em web-ifc): soma o
 * vetor às coordenadas dos IfcCartesianPoint que são a ORIGEM dos IfcLocalPlacement
 * RAIZ (PlacementRelTo nulo). Deslocar as raízes translada toda a árvore de placements
 * (site → building → storey → elemento), realinhando o modelo inteiro. O vetor é
 * informado em METROS (espaço IFC, Z-up) e convertido para a unidade de comprimento
 * declarada no arquivo antes de somar.
 *
 * Contrato: caminhos RELATIVOS a STORAGE_BASE_PATH.
 *   npx tsx --tsconfig tsconfig.server.json scripts/deslocar-ifc.ts <ifcRel> <saidaRel> <dx> <dy> <dz>
 * stdout (uma linha JSON):
 *   {"ok":true,"tamanho":N,"deslocados":N,"prefixo":"MILLI"}   — sucesso
 *   {"ok":false,"erro":"..."}                                   — falha (mensagem CRUA)
 * Exit 0 no sucesso, 1 no erro.
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  IfcAPI,
  IFCLOCALPLACEMENT,
  IFCSIUNIT,
} from "web-ifc";
import { resolverCaminho } from "../src/lib/storage";
import { TAMANHO_MAX_IFC, validarHeaderIfc } from "../src/modules/coordenacao/conversao-estado";
import {
  fatorMetros,
  metrosParaUnidadeArquivo,
  somarOffset,
  validarVetor,
  vetorNulo,
  type VetorMetros,
} from "../src/modules/coordenacao/realinhamento";

/** Emite uma linha JSON em stdout. */
function emitir(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

/** ExpressID referenciado por um valor do web-ifc (Handle → .value) ou null. */
function refId(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === "object" && "value" in (x as Record<string, unknown>)) {
    const v = (x as { value: unknown }).value;
    return typeof v === "number" ? v : null;
  }
  return typeof x === "number" ? x : null;
}

/**
 * Clona um NumberHandle (ex.: IfcLengthMeasure) com um novo valor, preservando a
 * classe/protótipo original. `.value` é um getter/setter (não uma prop própria) que
 * sincroniza campos internos (_internalValue/_representationValue) — um spread
 * `{...obj, value}` perde o protótipo e vira objeto plano, e o setter nunca roda:
 * os campos internos ficam com o valor ANTIGO e o WriteLine escreve NaN.
 */
function clonarComValor<T extends object>(obj: T, valor: number): T {
  const clone = Object.create(Object.getPrototypeOf(obj)) as T;
  Object.assign(clone, obj);
  (clone as unknown as { value: number }).value = valor; // roda o setter real da classe
  return clone;
}

/** Valor textual de um enum do web-ifc ({type,value:'MILLI'} ou string crua). */
function enumVal(x: unknown): string | null {
  if (x == null) return null;
  if (typeof x === "string") return x;
  if (typeof x === "object" && "value" in (x as Record<string, unknown>)) {
    const v = (x as { value: unknown }).value;
    return typeof v === "string" ? v : null;
  }
  return null;
}

/**
 * Lê o prefixo SI da unidade de COMPRIMENTO do modelo (ex.: 'MILLI', 'CENTI', ou null
 * para METRE). Varre os IfcSIUnit e pega o de UnitType = LENGTHUNIT. Retorna null se
 * não achar (o chamador assume metros).
 */
function lerPrefixoComprimento(api: IfcAPI, modelID: number): string | null {
  const ids = api.GetLineIDsWithType(modelID, IFCSIUNIT);
  for (let i = 0; i < ids.size(); i++) {
    const u = api.GetLine(modelID, ids.get(i));
    const tipo = enumVal(u?.UnitType);
    if (tipo && tipo.toUpperCase().endsWith("LENGTHUNIT")) {
      return enumVal(u?.Prefix); // null = METRE puro
    }
  }
  return null;
}

async function main() {
  const ifcRel = process.argv[2];
  const saidaRel = process.argv[3];
  const vetor: VetorMetros = [Number(process.argv[4]), Number(process.argv[5]), Number(process.argv[6])];
  if (!ifcRel || !saidaRel) {
    throw new Error("Uso: deslocar-ifc.ts <ifcRel> <saidaRel> <dx> <dy> <dz>");
  }
  const val = validarVetor(vetor);
  if (!val.ok) throw new Error(val.motivo);
  if (vetorNulo(vetor)) throw new Error("Vetor de deslocamento nulo — nada a realinhar.");

  const ifcAbs = resolverCaminho(ifcRel);
  const saidaAbs = resolverCaminho(saidaRel);

  const stat = await fs.stat(ifcAbs);
  if (stat.size > TAMANHO_MAX_IFC) {
    throw new Error(
      `IFC de ${(stat.size / 1024 / 1024).toFixed(0)} MB excede o limite ` +
        `(${(TAMANHO_MAX_IFC / 1024 / 1024 / 1024).toFixed(0)} GB). Exporte por pavimento/setor no Revit.`,
    );
  }

  const bytes = new Uint8Array(await fs.readFile(ifcAbs));

  // Valida o cabeçalho ANTES de acordar o WASM (erro claro se não for IFC).
  const header = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const check = validarHeaderIfc(header);
  if (!check.ok) throw new Error(check.motivo);

  const api = new IfcAPI();
  api.SetWasmPath(path.resolve("node_modules/web-ifc/") + path.sep, true);
  await api.Init();

  let modelID = -1;
  try {
    modelID = api.OpenModel(bytes);

    const prefixo = lerPrefixoComprimento(api, modelID);
    const fator = fatorMetros(prefixo);
    const offset = metrosParaUnidadeArquivo(vetor, fator);

    // 1) Coleta os AXIS (Axis2Placement3D) dos placements RAIZ (PlacementRelTo nulo),
    //    agrupados pelo IfcCartesianPoint que cada um usa como origem. Vários axis raiz
    //    podem apontar pro MESMO ponto — agrupa para clonar (passo 2) uma vez só.
    const placementIds = api.GetLineIDsWithType(modelID, IFCLOCALPLACEMENT);
    const axisPorPonto = new Map<number, number[]>();
    for (let i = 0; i < placementIds.size(); i++) {
      const lp = api.GetLine(modelID, placementIds.get(i));
      if (refId(lp?.PlacementRelTo) != null) continue; // não é raiz
      const axisId = refId(lp?.RelativePlacement);
      if (axisId == null) continue;
      const axis = api.GetLine(modelID, axisId);
      const pontoId = refId(axis?.Location);
      if (pontoId == null) continue;
      const lista = axisPorPonto.get(pontoId) ?? [];
      lista.push(axisId);
      axisPorPonto.set(pontoId, lista);
    }

    // 2) Para cada ponto-origem único, CLONA a linha (nunca muta o ponto original) —
    //    exportadores IFC costumam REUSAR o mesmo IfcCartesianPoint (ex.: "0.,0.,0.")
    //    como origem de MUITOS placements não-raiz. Mutar o ponto compartilhado in-place
    //    deslocaria também esses elementos não-raiz junto com a raiz, distorcendo a
    //    árvore inteira ("explodindo" o modelo). Clonar com um novo expressID e
    //    repontar só os axis raiz pro clone deixa o ponto original (e quem mais o usa)
    //    intocado.
    let deslocados = 0;
    let proximoExpressId = api.GetMaxExpressID(modelID) + 1;
    for (const [pontoId, axisIds] of axisPorPonto) {
      const ponto = api.GetLine(modelID, pontoId);
      const coords = ponto?.Coordinates;
      if (!Array.isArray(coords) || coords.length === 0) continue;
      const atuais = coords.map((c: { value: number }) => c.value);
      const novas = somarOffset(atuais, offset);

      const novoId = proximoExpressId++;
      const pontoNovo = {
        ...ponto,
        expressID: novoId,
        Coordinates: coords.map((c: { value: number }, i: number) => clonarComValor(c, novas[i])),
      };
      api.WriteLine(modelID, pontoNovo);

      for (const axisId of axisIds) {
        const axis = api.GetLine(modelID, axisId);
        if (axis?.Location && typeof axis.Location === "object") {
          axis.Location = { ...axis.Location, value: novoId };
          api.WriteLine(modelID, axis);
        }
      }
      deslocados++;
    }

    if (deslocados === 0) {
      throw new Error(
        "Nenhum placement raiz encontrado para deslocar — o modelo pode usar apenas " +
          "georreferenciamento (IfcMapConversion) ou uma estrutura de placements atípica. " +
          "Nada foi alterado.",
      );
    }

    const out = api.SaveModel(modelID);
    await fs.mkdir(path.dirname(saidaAbs), { recursive: true });
    await fs.writeFile(saidaAbs, Buffer.from(out));

    emitir({ ok: true, tamanho: out.byteLength, deslocados, prefixo: prefixo ?? "METRE" });
  } finally {
    if (modelID >= 0) api.CloseModel(modelID);
  }
  process.exit(0);
}

main().catch((e) => {
  const erro = e instanceof Error ? e.message : String(e);
  emitir({ ok: false, erro });
  process.exit(1);
});
