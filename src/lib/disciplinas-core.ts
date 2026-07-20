/**
 * Núcleo PURO do mapa de disciplinas (Mód 15 do CONSELHO1): nome → chave estável.
 * Sem React/lucide/Prisma — testável no env node e reusável no servidor.
 * O binding chave → ícone (que importa lucide) fica em `disciplinas.ts`.
 *
 * O catálogo (`DisciplinaCatalogo`) é editável, então casamos por padrão sobre o nome
 * normalizado (sem acento, minúsculo). Nomes não reconhecidos caem em "outra".
 */

export type DisciplinaKey =
  | "arquitetura"
  | "estrutural"
  | "fundacoes"
  | "hidrossanitario"
  | "drenagem"
  | "eletrico"
  | "spda"
  | "subestacao"
  | "incendio"
  | "climatizacao"
  | "gas"
  | "terraplenagem"
  | "topografia"
  | "pavimentacao"
  | "acustica"
  | "orcamento"
  | "telecom"
  | "seguranca"
  | "outra";

/** Remove acentos e baixa a caixa para casar nomes de forma tolerante. */
export function normalizar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Regras na ordem de prioridade: a primeira que casar vence. */
const REGRAS: { match: RegExp; key: DisciplinaKey }[] = [
  { match: /arquitet/, key: "arquitetura" },
  { match: /estrutur/, key: "estrutural" },
  { match: /fundac|geotec|\bestaca|sapata/, key: "fundacoes" },
  // drenagem antes de hidro (senão /hidro/ e afins engoliriam o pluvial)
  { match: /drenag|pluvial/, key: "drenagem" },
  { match: /hidro|sanit|hidraul|agua/, key: "hidrossanitario" },
  // spda/subestacao antes de eletrico (senão /energia/ e afins os engoliriam)
  { match: /spda|para.?raio|descarga atmosf/, key: "spda" },
  { match: /subestac|trafo|transformador/, key: "subestacao" },
  { match: /eletric|energia/, key: "eletrico" },
  { match: /incendi|ppci|combate|sprinkler/, key: "incendio" },
  { match: /climatiz|avac|hvac|ar.?condicionado|termic/, key: "climatizacao" },
  { match: /\bgas\b|glp|gnv|gasoduto/, key: "gas" },
  { match: /terraplan|terraplen|movimento de terra/, key: "terraplenagem" },
  { match: /topograf|planialtim|geodes/, key: "topografia" },
  { match: /paviment|asfalt|cbuq/, key: "pavimentacao" },
  { match: /acustic/, key: "acustica" },
  { match: /orcament/, key: "orcamento" },
  { match: /telecom|logic|rede|dados|cabeamento/, key: "telecom" },
  { match: /cftv|camera|vigilanc|seguranca eletronic/, key: "seguranca" },
];

/** Chave estável da disciplina pelo nome (tolerante a variações e acentos). */
export function keyDisciplina(nome: string): DisciplinaKey {
  const n = normalizar(nome);
  for (const r of REGRAS) if (r.match.test(n)) return r.key;
  return "outra";
}
