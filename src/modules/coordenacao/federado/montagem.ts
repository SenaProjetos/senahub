/**
 * Escrita do IFC federado (spec 2026-10-04 §5.2) — PURO, em streaming. O modelo i soma offsets[i] a cada #id;
 * o IfcProject dos modelos não-mestre não é escrito e toda referência a ele vira o projeto mestre (assim o
 * IfcRelAggregates de cada modelo pendura o seu IfcSite no projeto único); o projeto mestre ganha os contextos
 * raiz dos outros. O resto é copiado como veio — geometria e posições byte a byte.
 */
import type { AnaliseIfc, FonteIfc } from "./analise";
import { ErroMostravel, LeitorStep, atributos, idDaInstrucao, lerInstancia, palavraDaInstrucao, referencias, textoStep, trocarReferencias } from "./step";

export type PlanoJuncao = { offsets: number[]; projetoMestre: number; contextosExtras: number[] };

export type CabecalhoFederado = {
  nomeArquivo: string;
  autor: string;
  /** `AAAA-MM-DDTHH:MM:SS`, sem fuso (formato do FILE_NAME). */
  quando: string;
  composicao: { nome: string; grupo: string; revisao: string }[];
};

export function planejarJuncao(analises: AnaliseIfc[]): PlanoJuncao {
  const mestre = analises[0];
  if (!mestre || mestre.projetoId === null) throw new ErroMostravel("O primeiro modelo não tem IfcProject.");
  const offsets: number[] = [];
  let soma = 0;
  for (const a of analises) {
    offsets.push(soma);
    soma += a.maiorId;
  }
  const contextosExtras = analises.slice(1).flatMap((a, i) => a.contextosRaiz.map((c) => c + offsets[i + 1]));
  return { offsets, projetoMestre: mestre.projetoId, contextosExtras };
}

function comContextosExtras(instr: string, extras: number[]): string {
  const inst = lerInstancia(instr);
  if (!inst) return instr;
  const attrs = atributos(inst.args);
  const atuais = referencias(attrs[7] ?? "");
  attrs[7] = `(${[...atuais, ...extras].map((n) => `#${n}`).join(",")})`;
  return `#${inst.id}=${inst.tipo}(${attrs.join(",")})`;
}

export function transformarInstancia(instr: string, indice: number, analise: AnaliseIfc, plano: PlanoJuncao): string | null {
  const id = idDaInstrucao(instr);
  if (id === null) return null;
  if (indice > 0 && id === analise.projetoId) return null;
  const offset = plano.offsets[indice];
  const texto = trocarReferencias(instr, (n) => (indice > 0 && n === analise.projetoId ? plano.projetoMestre : n + offset));
  if (indice === 0 && id === plano.projetoMestre && plano.contextosExtras.length > 0) {
    return comContextosExtras(texto, plano.contextosExtras);
  }
  return texto;
}

export function textoCabecalho(c: CabecalhoFederado, mestre: AnaliseIfc): string {
  const descricao = [
    mestre.viewDefinition ?? "ViewDefinition [CoordinationView]",
    `SenaHub: modelo federado de ${c.composicao.length} modelos`,
    ...c.composicao.map((m) => `Modelo: ${m.nome} (${m.grupo}, ${m.revisao})`),
  ];
  return [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION((${descricao.map(textoStep).join(",")}),'2;1');`,
    `FILE_NAME(${textoStep(c.nomeArquivo)},${textoStep(c.quando)},(${textoStep(c.autor)}),('SenaHub'),'SenaHub','SenaHub','');`,
    `FILE_SCHEMA((${textoStep(mestre.schema ?? "IFC4")}));`,
    "ENDSEC;",
    "DATA;",
    "",
  ].join("\n");
}

export async function* escreverFederado(
  fontes: FonteIfc[],
  analises: AnaliseIfc[],
  cabecalho: CabecalhoFederado,
): AsyncGenerator<string> {
  const plano = planejarJuncao(analises);
  yield textoCabecalho(cabecalho, analises[0]);
  for (let i = 0; i < fontes.length; i++) {
    const leitor = new LeitorStep();
    let emDados = false;
    const escrever = (instr: string): string => {
      const palavra = palavraDaInstrucao(instr);
      if (palavra === "DATA") {
        emDados = true;
        return "";
      }
      if (palavra === "ENDSEC") {
        emDados = false;
        return "";
      }
      if (!emDados) return "";
      const t = transformarInstancia(instr, i, analises[i], plano);
      return t === null ? "" : `${t};\n`;
    };
    for await (const pedaco of fontes[i]()) {
      let lote = "";
      for (const instr of leitor.alimentar(pedaco)) lote += escrever(instr);
      if (lote) yield lote;
    }
    let resto = "";
    for (const instr of leitor.finalizar()) resto += escrever(instr);
    if (resto) yield resto;
  }
  yield "ENDSEC;\nEND-ISO-10303-21;\n";
}

/** Marca no mapa de donos: o GlobalId já foi contado como repetido. */
const JA_CONTADO = -1;

export function avisoGuidsRepetidos(analises: AnaliseIfc[], rotulos: string[]): string | null {
  // Um número por GlobalId (o primeiro modelo que o tem), não um Set por GlobalId: são milhões num modelo grande.
  const dono = new Map<string, number>();
  const envolvidos = new Set<number>();
  let total = 0;
  analises.forEach((a, i) => {
    for (const g of a.guids) {
      const primeiro = dono.get(g);
      if (primeiro === undefined) {
        dono.set(g, i);
        continue;
      }
      if (primeiro === i) continue; // repetido dentro do mesmo modelo: não é entre modelos
      if (primeiro !== JA_CONTADO) {
        total++;
        envolvidos.add(primeiro);
        dono.set(g, JA_CONTADO);
      }
      envolvidos.add(i);
    }
  });
  if (total === 0) return null;
  const nomes = [...envolvidos].sort((x, y) => x - y).map((i) => rotulos[i]);
  const lista = nomes.length === 2 ? nomes.join(" e ") : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
  return `${total} elemento${total === 1 ? "" : "s"} com GlobalId repetido entre ${lista}. Visualizadores podem mostrar só um deles.`;
}
