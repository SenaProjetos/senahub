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
 * Giro opcional em planta (graus, anti-horário visto de cima, em torno da ORIGEM do
 * arquivo): cada placement raiz vira R·placement + vetor — a origem gira e soma o vetor,
 * e os eixos (RefDirection/Axis) giram junto. O orquestrador já converteu o "giro em
 * torno do centro do modelo" para "giro em torno da origem" (translacaoSobreOrigem).
 *
 * Contrato: caminhos RELATIVOS a STORAGE_BASE_PATH.
 *   npx tsx --tsconfig tsconfig.server.json scripts/deslocar-ifc.ts <ifcRel> <saidaRel> <dx> <dy> <dz> [graus]
 * stdout (uma linha JSON):
 *   {"ok":true,"tamanho":N,"deslocados":N,"prefixo":"MILLI"}   — sucesso
 *   {"ok":false,"erro":"..."}                                   — falha (mensagem CRUA)
 * Exit 0 no sucesso, 1 no erro.
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  Handle,
  IfcAPI,
  IFCDIRECTION,
  IFCLOCALPLACEMENT,
  IFCREAL,
  IFCSIUNIT,
} from "web-ifc";
import { resolverCaminho } from "../src/lib/storage";
import { TAMANHO_MAX_IFC, validarHeaderIfc } from "../src/modules/coordenacao/conversao-estado";
import {
  fatorMetros,
  girarXY,
  metrosParaUnidadeArquivo,
  realinhamentoNulo,
  rotacaoNula,
  somarOffset,
  validarRotacao,
  validarVetor,
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
  const graus = process.argv[7] != null ? Number(process.argv[7]) : 0;
  if (!ifcRel || !saidaRel) {
    throw new Error("Uso: deslocar-ifc.ts <ifcRel> <saidaRel> <dx> <dy> <dz> [graus]");
  }
  const val = validarVetor(vetor);
  if (!val.ok) throw new Error(val.motivo);
  const valRot = validarRotacao(graus);
  if (!valRot.ok) throw new Error(valRot.motivo);
  if (realinhamentoNulo(vetor, graus)) throw new Error("Nem deslocamento nem giro — nada a realinhar.");
  const gira = !rotacaoNula(graus);

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

    // 1) Coleta os placements RAIZ (PlacementRelTo nulo).
    const placementIds = api.GetLineIDsWithType(modelID, IFCLOCALPLACEMENT);
    const lpRaiz: number[] = [];
    for (let i = 0; i < placementIds.size(); i++) {
      const lp = api.GetLine(modelID, placementIds.get(i));
      if (refId(lp?.PlacementRelTo) != null) continue; // não é raiz
      lpRaiz.push(placementIds.get(i));
    }

    // 2) Toda linha tocada é CLONADA (nunca muta a original), INCLUSIVE o próprio
    //    Axis2Placement3D — exportadores IFC costumam REUSAR o mesmo IfcCartesianPoint
    //    ("0.,0.,0."), o mesmo IfcDirection e até o MESMO Axis2Placement3D em muitos
    //    placements não-raiz (o CYPE usa um único axis em todos os 800+ placements da
    //    árvore). Mutar a linha compartilhada in-place moveria também esses placements;
    //    como cada nível soma o deslocamento do pai, o modelo "explode". Os clones ganham
    //    expressID novo e só o IfcLocalPlacement raiz passa a apontar pra eles. Os mapas
    //    garantem um clone por linha original, mesmo com várias raízes.
    let proximoExpressId = api.GetMaxExpressID(modelID) + 1;
    const axisClonado = new Map<number, number>();
    const pontoClonado = new Map<number, number>();
    const direcaoClonada = new Map<number, number>();
    const direcaoPadrao = new Map<number, number>(); // RefDirection nula, por dimensão (2 ou 3)

    /**
     * Clona uma linha de lista numérica (Coordinates/DirectionRatios) com valores novos.
     * Cada item vem como NumberHandle (IfcLengthMeasure, IfcReal do IFC4) ou como número
     * cru — o web-ifc devolve os DirectionRatios do IFC2X3 assim; clonar um número como
     * objeto grava "IFCDIRECTION(())".
     */
    const clonarLista = (
      id: number,
      campo: "Coordinates" | "DirectionRatios",
      calc: (v: number[]) => number[],
    ): number | null => {
      const linha = api.GetLine(modelID, id);
      const lista: unknown[] | undefined = linha?.[campo];
      if (!Array.isArray(lista) || lista.length === 0) return null;
      const atuais = lista.map((c) => (typeof c === "number" ? c : (c as { value: number }).value));
      if (atuais.some((n) => !Number.isFinite(n))) return null;
      const novas = calc(atuais);
      const novoId = proximoExpressId++;
      api.WriteLine(modelID, {
        ...linha,
        expressID: novoId,
        [campo]: lista.map((c, i) => (typeof c === "number" ? novas[i] : clonarComValor(c as object, novas[i]))),
      });
      return novoId;
    };

    /** Clone girado de um IfcDirection (um por direção original). */
    const direcaoGirada = (id: number): number | null => {
      const ja = direcaoClonada.get(id);
      if (ja != null) return ja;
      const novoId = clonarLista(id, "DirectionRatios", (v) => girarXY(v, graus));
      if (novoId != null) direcaoClonada.set(id, novoId);
      return novoId;
    };

    /** RefDirection nula vale (1,0[,0]) — com giro, vira uma direção nova explícita. */
    const direcaoPadraoGirada = (dim: 2 | 3): number => {
      const ja = direcaoPadrao.get(dim);
      if (ja != null) return ja;
      // IFC2X3: o web-ifc trata os DirectionRatios como números crus; IFC4: como IfcReal.
      const ifc2x3 = /IFC2X3/i.test(api.GetModelSchema(modelID) ?? "");
      const ratios = girarXY(dim === 2 ? [1, 0] : [1, 0, 0], graus).map((n) =>
        ifc2x3 ? n : api.CreateIfcType(modelID, IFCREAL, n),
      );
      const linha = api.CreateIfcEntity(modelID, IFCDIRECTION, ratios) as unknown as { expressID: number };
      linha.expressID = proximoExpressId++;
      api.WriteLine(modelID, linha as never);
      direcaoPadrao.set(dim, linha.expressID);
      return linha.expressID;
    };

    /** Clone transformado de um Axis2Placement (um por axis original), ou null se atípico. */
    const axisTransformado = (axisId: number): number | null => {
      const ja = axisClonado.get(axisId);
      if (ja != null) return ja;
      const axis = api.GetLine(modelID, axisId);
      const pontoId = refId(axis?.Location);
      if (pontoId == null) return null;

      let novoPonto = pontoClonado.get(pontoId) ?? null;
      if (novoPonto == null) {
        novoPonto = clonarLista(pontoId, "Coordinates", (v) => somarOffset(gira ? girarXY(v, graus) : v, offset));
        if (novoPonto == null) return null;
        pontoClonado.set(pontoId, novoPonto);
      }
      const novo = { ...axis, expressID: proximoExpressId++, Location: new Handle(novoPonto) };

      if (gira) {
        const dim = api.GetLine(modelID, pontoId)?.Coordinates?.length === 2 ? 2 : 3;
        const refDirId = refId(axis.RefDirection);
        const novaRef = refDirId != null ? direcaoGirada(refDirId) : direcaoPadraoGirada(dim);
        if (novaRef != null) novo.RefDirection = new Handle(novaRef);
        // Axis (Z local) nulo = vertical, que o giro em planta não muda. Só gira um explícito.
        const eixoId = refId(axis.Axis);
        if (eixoId != null) {
          const novoEixo = direcaoGirada(eixoId);
          if (novoEixo != null) novo.Axis = new Handle(novoEixo);
        }
      }

      api.WriteLine(modelID, novo);
      axisClonado.set(axisId, novo.expressID);
      return novo.expressID;
    };

    let deslocados = 0;
    for (const lpId of lpRaiz) {
      const lp = api.GetLine(modelID, lpId);
      const axisId = refId(lp?.RelativePlacement);
      if (axisId == null) continue;
      const novoAxis = axisTransformado(axisId);
      if (novoAxis == null) continue;
      lp.RelativePlacement = new Handle(novoAxis);
      api.WriteLine(modelID, lp);
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

    emitir({ ok: true, tamanho: out.byteLength, deslocados, prefixo: prefixo ?? "METRE", graus: gira ? graus : 0 });
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
