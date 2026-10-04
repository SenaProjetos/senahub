/**
 * Análise de um IFC para a junção (spec 2026-10-04 §5.1) — PURO. Uma passada pelas instruções coleta o que a
 * escrita precisa: schema, o IfcProject e seus contextos, a unidade de comprimento DO PROJETO (resolvida por
 * UnitsInContext → IfcUnitAssignment → unidade, nunca "o primeiro IfcSIUnit achado"), o maior #id e os
 * GlobalIds (aviso de repetidos). Só as poucas instâncias de unidade/projeto ficam em memória.
 */
import { LeitorStep, atributos, idDaInstrucao, lerInstancia, palavraDaInstrucao, referencias, type Instancia } from "./step";

export type AnaliseIfc = {
  schema: string | null;
  viewDefinition: string | null;
  projetoId: number | null;
  /** Quantos IfcProject o arquivo tem (o válido é 1). */
  projetos: number;
  contextosRaiz: number[];
  /**
   * Unidade de comprimento do projeto (`"MILLI METRE"`, `"FOOT"`…). `null` = o projeto não declara (sem
   * UnitsInContext ou sem LENGTHUNIT na atribuição); `undefined` = não deu para ler (a atribuição cita uma unidade
   * que nunca chegou no arquivo).
   */
  unidade: string | null | undefined;
  maiorId: number;
  guids: string[];
};

export type FonteIfc = () => AsyncIterable<string>;

/**
 * Qualquer tipo que pode estar numa IfcUnitAssignment entra aqui: uma unidade da atribuição que não está no mapa é
 * lida como "ainda não chegou" — se a moeda (IfcMonetaryUnit) ficasse de fora, a unidade nunca se resolveria.
 */
const TIPOS_DE_UNIDADE = new Set([
  "IFCUNITASSIGNMENT",
  "IFCSIUNIT",
  "IFCCONVERSIONBASEDUNIT",
  "IFCCONVERSIONBASEDUNITWITHOFFSET",
  "IFCDERIVEDUNIT",
  "IFCMONETARYUNIT",
  "IFCCONTEXTDEPENDENTUNIT",
]);
/** GlobalId comprimido do IFC: 22 caracteres e o 1º só 0–3 (128 bits) — um nome de 22 letras não conta. */
const RE_GUID = /^'([0-3][0-9A-Za-z_$]{21})'/;

function enumDe(attr: string | undefined): string | null {
  const m = /^\.([A-Z0-9_]+)\.$/i.exec((attr ?? "").trim());
  return m ? m[1].toUpperCase() : null;
}

function stringDe(attr: string | undefined): string | null {
  const m = /^'((?:[^']|'')*)'$/.exec((attr ?? "").trim());
  return m ? m[1].replace(/''/g, "'") : null;
}

export class AnalisadorIfc {
  private schema: string | null = null;
  private viewDefinition: string | null = null;
  private projeto: Instancia | null = null;
  private projetos = 0;
  private unidades = new Map<number, Instancia>();
  private maiorId = 0;
  private guids: string[] = [];

  instrucao(instr: string): void {
    const id = idDaInstrucao(instr);
    if (id === null) {
      const palavra = palavraDaInstrucao(instr);
      if (palavra === "FILE_SCHEMA") this.schema = /\(\s*\(\s*'([^']+)'/.exec(instr)?.[1] ?? null;
      else if (palavra === "FILE_DESCRIPTION") this.viewDefinition = /'(ViewDefinition\s*\[[^']*\])'/i.exec(instr)?.[1] ?? null;
      return;
    }
    if (id > this.maiorId) this.maiorId = id;
    const inst = lerInstancia(instr);
    if (!inst) return;
    if (inst.tipo === "IFCPROJECT") {
      this.projetos++;
      if (!this.projeto) this.projeto = inst;
      return;
    }
    if (TIPOS_DE_UNIDADE.has(inst.tipo)) this.unidades.set(inst.id, inst);
    const guid = RE_GUID.exec(inst.args);
    if (guid) this.guids.push(guid[1]);
  }

  /** Rótulo da unidade de comprimento do projeto, `undefined` enquanto faltar peça para saber. */
  private unidadeDoProjeto(): string | null | undefined {
    if (!this.projeto) return undefined;
    const ref = referencias(atributos(this.projeto.args)[8] ?? "")[0];
    if (ref === undefined) return null; // projeto sem UnitsInContext
    const atribuicao = this.unidades.get(ref);
    if (!atribuicao) return undefined;
    for (const uid of referencias(atributos(atribuicao.args)[0] ?? "")) {
      const u = this.unidades.get(uid);
      if (!u) return undefined;
      const a = atributos(u.args);
      if (enumDe(a[1]) !== "LENGTHUNIT") continue;
      if (u.tipo === "IFCSIUNIT") {
        const prefixo = enumDe(a[2]);
        const nome = enumDe(a[3]) ?? "METRE";
        return prefixo ? `${prefixo} ${nome}` : nome;
      }
      return (stringDe(a[2]) ?? "").toUpperCase() || null;
    }
    return null;
  }

  unidadeResolvida(): boolean {
    return this.unidadeDoProjeto() !== undefined;
  }

  resultado(): AnaliseIfc {
    const contextos = this.projeto ? referencias(atributos(this.projeto.args)[7] ?? "") : [];
    return {
      schema: this.schema,
      viewDefinition: this.viewDefinition,
      projetoId: this.projeto?.id ?? null,
      projetos: this.projetos,
      contextosRaiz: contextos,
      unidade: this.unidadeDoProjeto(),
      maiorId: this.maiorId,
      guids: this.guids,
    };
  }
}

export async function analisarFonte(fonte: FonteIfc): Promise<AnaliseIfc> {
  const leitor = new LeitorStep();
  const analisador = new AnalisadorIfc();
  for await (const pedaco of fonte()) for (const instr of leitor.alimentar(pedaco)) analisador.instrucao(instr);
  for (const instr of leitor.finalizar()) analisador.instrucao(instr);
  return analisador.resultado();
}

export function fonteDeTexto(texto: string, tamanhoPedaco = 64 * 1024): FonteIfc {
  return async function* () {
    for (let i = 0; i < texto.length; i += tamanhoPedaco) yield texto.slice(i, i + tamanhoPedaco);
  };
}
