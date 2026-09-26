/**
 * Catálogos que o escritório edita pela tela — disciplinas (Configurações → Disciplinas) e as
 * siglas da Lista Mestre (Configurações → Lista Mestre) — e a regra de como o `db:seed` os trata.
 *
 * Regra: são semeados UMA vez, em instalação nova (tabela / categoria vazia). Depois disso quem
 * manda é a tela. O `db:seed` roda em todo deploy; antes ele fazia upsert/“cria o que falta” e
 * com isso desfazia a curadoria do escritório a cada deploy:
 *   - disciplinas: sigla, categoria e ordem das 18 disciplinas-base eram sobrescritas (desfazendo
 *     "renomear categoria" e a reordenação), e renomear uma disciplina-base quebrava o próprio
 *     seed (recriava pelo nome antigo e batia no `codigo` único);
 *   - Lista Mestre: item excluído voltava, e trocar uma sigla (PE → EX) fazia a antiga voltar como
 *     item duplicado.
 *
 * Consequência aceita (decisão do dono, 2026-09-17): item padrão novo acrescentado aqui NÃO chega
 * sozinho em quem já tem catálogo. Se precisar chegar, vai por migração explícita — como os
 * sinônimos em `20260915170000_motor_nomenclatura_sinonimos_extensoes`.
 *
 * As funções recebem só os dois delegates que usam, para rodarem tanto com o cliente quanto
 * dentro de uma transação (é assim que o caminho de instalação nova é ensaiado sem apagar nada).
 */
import type { Prisma } from "../src/generated/prisma/client";

type ClienteCatalogos = Pick<Prisma.TransactionClient, "disciplinaCatalogo" | "pranchaCatalogo">;
type ClienteEapCatalogo = Pick<Prisma.TransactionClient, "eapCatalogo">;

/** Categorias do classificador da EAP, na ordem em que a tela as apresenta. */
const CATEGORIAS_EAP = ["tipo_atividade", "sistema", "origem", "localizacao"] as const;
type CategoriaEap = (typeof CATEGORIAS_EAP)[number];

// Item 15: catálogo com sigla (nomenclatura de arquivos) + categoria (agrupamento na UI).
// Catálogo-base pré-criado. `categoria: null` cai no grupo "Outras" (ver schema/nota da view).
// O ícone deriva do nome (lib/disciplinas.ts) — não fixamos `icone` aqui.
//
// `numeracao` = bloco-base da folha na Lista Mestre: 1ª folha = bloco+1 (EST 4000 → 4001).
// Valores da tabela oficial do escritório, casados pela SIGLA (os nomes de tela do catálogo são
// mantidos de propósito — a tabela oficial usa descrições mais longas p/ as mesmas siglas).
// Duas exceções deliberadas, decididas com o escritório:
//   ACU 3100 — a tabela trazia 3000, igual a ARQ; dois blocos iguais colidem (as duas começariam
//              em 3001). 3100 segue o padrão de sub-bloco +100 da própria tabela (LOG/SEG/SPD/SUB
//              sob ELE, DRE sob HID, GAS sob CLI).
//   FUN null — Fundações não consta da tabela oficial; sem bloco, suas folhas começam em 1.
export const DISCIPLINAS_CATALOGO: {
  nome: string;
  codigo: string;
  categoria: string | null;
  numeracao: number | null;
}[] = [
  // ARQUITETURA
  { nome: "Arquitetura", codigo: "ARQ", categoria: "ARQUITETURA", numeracao: 3000 },
  { nome: "Acústica", codigo: "ACU", categoria: "ARQUITETURA", numeracao: 3100 },
  // CIVIL
  { nome: "Estrutural", codigo: "EST", categoria: "CIVIL", numeracao: 4000 },
  { nome: "Hidrossanitário", codigo: "HID", categoria: "CIVIL", numeracao: 6000 },
  { nome: "Incêndio (PPCI)", codigo: "PCI", categoria: "CIVIL", numeracao: 7000 },
  { nome: "Fundações", codigo: "FUN", categoria: "CIVIL", numeracao: null },
  { nome: "Terraplenagem", codigo: "TER", categoria: "CIVIL", numeracao: 1000 },
  { nome: "Topografia", codigo: "TOP", categoria: "CIVIL", numeracao: 0 },
  { nome: "Pavimentação", codigo: "PAV", categoria: "CIVIL", numeracao: 2000 },
  { nome: "Drenagem", codigo: "DRE", categoria: "CIVIL", numeracao: 6100 },
  // ELÉTRICA
  { nome: "Elétrico", codigo: "ELE", categoria: "ELÉTRICA", numeracao: 5000 },
  { nome: "Cabeamento", codigo: "LOG", categoria: "ELÉTRICA", numeracao: 5100 },
  { nome: "CFTV", codigo: "SEG", categoria: "ELÉTRICA", numeracao: 5200 },
  { nome: "SPDA", codigo: "SPD", categoria: "ELÉTRICA", numeracao: 5300 },
  { nome: "Subestação", codigo: "SUB", categoria: "ELÉTRICA", numeracao: 5400 },
  // MECÂNICA
  { nome: "Climatização (AVAC)", codigo: "CLI", categoria: "MECÂNICA", numeracao: 8000 },
  { nome: "Gás", codigo: "GAS", categoria: "MECÂNICA", numeracao: 8200 },
  // OUTRAS
  { nome: "Orçamento", codigo: "ORC", categoria: null, numeracao: 9000 },
];

export const LM_CATALOGO: { categoria: "folha" | "tipo" | "fase"; sigla: string; nome: string; sinonimos?: string[] }[] = [
  { categoria: "folha", sigla: "A0", nome: "A0 (841×1189)" },
  { categoria: "folha", sigla: "A1", nome: "A1 (594×841)" },
  { categoria: "folha", sigla: "A2", nome: "A2 (420×594)" },
  { categoria: "folha", sigla: "A3", nome: "A3 (297×420)" },
  { categoria: "folha", sigla: "A4", nome: "A4 (210×297)" },
  // Fases e tipos = o catálogo que o escritório usa em produção (conferido em 2026-09-17), com
  // os sinônimos da migração 20260915170000 e as siglas antigas deste seed.
  { categoria: "fase", sigla: "PL", nome: "Estudo Preliminar", sinonimos: ["EP"] },
  { categoria: "fase", sigla: "AP", nome: "Anteprojeto" },
  { categoria: "fase", sigla: "BS", nome: "Projeto Básico", sinonimos: ["PB"] },
  { categoria: "fase", sigla: "EX", nome: "Projeto Executivo", sinonimos: ["PE", "EXE"] },
  // Sem "PL" como sinônimo: aqui PL é Estudo Preliminar (colisão na mesma categoria).
  { categoria: "fase", sigla: "LG", nome: "Projeto Legal" },
  { categoria: "fase", sigla: "AB", nome: "As Built" },
  { categoria: "tipo", sigla: "M3D", nome: "Modelo Tridimensional" },
  // Planta/corte/vista/detalhe/esquema/diagrama/locação são todos desenho técnico. "PL" fica
  // de fora por ser a sigla de uma fase.
  { categoria: "tipo", sigla: "DET", nome: "Desenho Técnico", sinonimos: ["DTC", "DE", "CO", "VI", "ES", "DI", "LC"] },
  { categoria: "tipo", sigla: "MEM", nome: "Memorial Descritivo", sinonimos: ["MED", "MD"] },
  { categoria: "tipo", sigla: "MEC", nome: "Memorial de Cálculo", sinonimos: ["MC"] },
  { categoria: "tipo", sigla: "PQT", nome: "Lista de Materiais", sinonimos: ["PLQ"] },
  { categoria: "tipo", sigla: "PMT", nome: "Plano de Manutenção" },
  { categoria: "tipo", sigla: "DOC", nome: "Anexos" },
  { categoria: "tipo", sigla: "LMS", nome: "Lista Mestra", sinonimos: ["LME"] },
];

/** Cria o catálogo de disciplinas se — e só se — ele estiver vazio (ativas ou arquivadas). */
export async function semearCatalogoDisciplinas(db: ClienteCatalogos): Promise<{ criadas: number; existentes: number }> {
  const existentes = await db.disciplinaCatalogo.count();
  if (existentes > 0) return { criadas: 0, existentes };
  const { count } = await db.disciplinaCatalogo.createMany({
    data: DISCIPLINAS_CATALOGO.map((d, i) => ({
      nome: d.nome,
      codigo: d.codigo,
      categoria: d.categoria,
      ordem: i,
      numeracao: d.numeracao,
    })),
  });
  return { criadas: count, existentes: 0 };
}

/**
 * Cria as siglas globais da Lista Mestre, categoria a categoria, só onde a categoria estiver
 * vazia (itens globais, ativos ou não). Cada categoria é uma lista própria na tela.
 */
export async function semearListaMestre(
  db: ClienteCatalogos,
): Promise<{ categoria: "folha" | "tipo" | "fase"; criadas: number; existentes: number }[]> {
  const resultado: { categoria: "folha" | "tipo" | "fase"; criadas: number; existentes: number }[] = [];
  for (const categoria of ["folha", "tipo", "fase"] as const) {
    const existentes = await db.pranchaCatalogo.count({ where: { categoria, projetoId: null } });
    if (existentes > 0) {
      resultado.push({ categoria, criadas: 0, existentes });
      continue;
    }
    const itens = LM_CATALOGO.filter((c) => c.categoria === categoria);
    const { count } = await db.pranchaCatalogo.createMany({
      data: itens.map((c, i) => ({
        categoria: c.categoria,
        sigla: c.sigla,
        nome: c.nome,
        ordem: i,
        sinonimos: c.sinonimos ?? [],
      })),
    });
    resultado.push({ categoria, criadas: count, existentes: 0 });
  }
  return resultado;
}

// ─────────────────────────────────────────────────────────────
// Classificadores da EAP (Doc 02 — Dicionário Corporativo de Classificadores)
// ─────────────────────────────────────────────────────────────

/**
 * Vocabulário corporativo das linhas da EAP. Três das quatro categorias são "nível 3"
 * no Doc 02 §24 (evolutivas: crescem por aprovação administrativa); `localizacao` é
 * "nível 2" (por projeto) e aqui entra só com a base comum, que cada projeto estende.
 *
 * Colisão de sigla ENTRE categorias é esperada e legítima — `DET` é Detalhamento em
 * `tipo_atividade` e Detecção em `sistema`; `HID` é Hidrantes aqui e Hidrossanitário no
 * catálogo de disciplinas. São vocabulários distintos, e a unicidade é por categoria.
 */
export const EAP_CATALOGO: { categoria: CategoriaEap; sigla: string; nome: string }[] = [
  // TAT — natureza do trabalho (Doc 02 §8)
  { categoria: "tipo_atividade", sigla: "PLN", nome: "Planejamento" },
  { categoria: "tipo_atividade", sigla: "LEV", nome: "Levantamento" },
  { categoria: "tipo_atividade", sigla: "MOD", nome: "Modelagem" },
  { categoria: "tipo_atividade", sigla: "LAN", nome: "Lançamento" },
  { categoria: "tipo_atividade", sigla: "DIM", nome: "Dimensionamento" },
  { categoria: "tipo_atividade", sigla: "CAL", nome: "Cálculo" },
  { categoria: "tipo_atividade", sigla: "DET", nome: "Detalhamento" },
  { categoria: "tipo_atividade", sigla: "DOC", nome: "Documentação" },
  { categoria: "tipo_atividade", sigla: "CMP", nome: "Compatibilização" },
  { categoria: "tipo_atividade", sigla: "ANA", nome: "Análise" },
  { categoria: "tipo_atividade", sigla: "COR", nome: "Correção" },
  { categoria: "tipo_atividade", sigla: "REV", nome: "Revisão" },
  { categoria: "tipo_atividade", sigla: "VAL", nome: "Validação" },
  { categoria: "tipo_atividade", sigla: "APR", nome: "Aprovação" },
  { categoria: "tipo_atividade", sigla: "EMT", nome: "Emissão" },
  { categoria: "tipo_atividade", sigla: "RCL", nome: "Reunião com cliente" },
  { categoria: "tipo_atividade", sigla: "RIN", nome: "Reunião interna" },

  // SIS — sistema técnico (Doc 02 §11), agrupado por disciplina de origem
  { categoria: "sistema", sigla: "ILU", nome: "Iluminação" },
  { categoria: "sistema", sigla: "TOM", nome: "Tomadas" },
  { categoria: "sistema", sigla: "FOR", nome: "Força" },
  { categoria: "sistema", sigla: "QUA", nome: "Quadros" },
  { categoria: "sistema", sigla: "MED", nome: "Medição" },
  { categoria: "sistema", sigla: "ATE", nome: "Aterramento" },
  { categoria: "sistema", sigla: "SPDA", nome: "SPDA" },
  { categoria: "sistema", sigla: "EME", nome: "Emergência" },
  { categoria: "sistema", sigla: "AF", nome: "Água fria" },
  { categoria: "sistema", sigla: "AQ", nome: "Água quente" },
  { categoria: "sistema", sigla: "REC", nome: "Recalque" },
  { categoria: "sistema", sigla: "RES", nome: "Reservação" },
  { categoria: "sistema", sigla: "ESG", nome: "Esgoto" },
  { categoria: "sistema", sigla: "VEN", nome: "Ventilação" },
  { categoria: "sistema", sigla: "GRE", nome: "Gordura" },
  { categoria: "sistema", sigla: "PLU", nome: "Águas pluviais" },
  { categoria: "sistema", sigla: "DRE", nome: "Drenagem" },
  { categoria: "sistema", sigla: "CON", nome: "Condensado" },
  { categoria: "sistema", sigla: "HID", nome: "Hidrantes" },
  { categoria: "sistema", sigla: "SPR", nome: "Sprinklers" },
  { categoria: "sistema", sigla: "EXT", nome: "Extintores" },
  { categoria: "sistema", sigla: "DET", nome: "Detecção" },
  { categoria: "sistema", sigla: "ALA", nome: "Alarme" },
  { categoria: "sistema", sigla: "ROT", nome: "Rotas de fuga" },

  // ORG — origem da demanda (Doc 02 §14). É o que permite responder "quantos dias
  // perdemos esperando o cliente", em vez de só "o projeto atrasou".
  { categoria: "origem", sigla: "INT", nome: "Interna" },
  { categoria: "origem", sigla: "CLI", nome: "Cliente" },
  { categoria: "origem", sigla: "ARQ", nome: "Arquitetura" },
  { categoria: "origem", sigla: "EXT", nome: "Projetista externo" },
  { categoria: "origem", sigla: "CMP", nome: "Compatibilização" },
  { categoria: "origem", sigla: "FIS", nome: "Fiscalização" },
  { categoria: "origem", sigla: "APR", nome: "Órgão aprovador" },
  { categoria: "origem", sigla: "CON", nome: "Concessionária" },
  { categoria: "origem", sigla: "OBR", nome: "Obra" },
  { categoria: "origem", sigla: "ALT", nome: "Alteração de escopo" },

  // LOC — base comum (Doc 02 §10). Cada projeto acrescenta a sua (torre, setor, ambiente).
  { categoria: "localizacao", sigla: "GER", nome: "Geral" },
  { categoria: "localizacao", sigla: "SS01", nome: "Subsolo 01" },
  { categoria: "localizacao", sigla: "TER", nome: "Térreo" },
  { categoria: "localizacao", sigla: "PVT", nome: "Pavimento tipo" },
  { categoria: "localizacao", sigla: "COB", nome: "Cobertura" },
  { categoria: "localizacao", sigla: "EXT", nome: "Área externa" },
];

/**
 * Cria os classificadores GLOBAIS da EAP, categoria a categoria, só onde a categoria
 * estiver vazia — mesma regra de `semearListaMestre`: depois da primeira vez quem manda
 * é a tela, e item novo acrescentado aqui só chega em quem já tem catálogo via migration.
 */
export async function semearEapCatalogo(
  db: ClienteEapCatalogo,
): Promise<{ categoria: CategoriaEap; criadas: number; existentes: number }[]> {
  const resultado: { categoria: CategoriaEap; criadas: number; existentes: number }[] = [];
  for (const categoria of CATEGORIAS_EAP) {
    const existentes = await db.eapCatalogo.count({ where: { categoria, projetoId: null } });
    if (existentes > 0) {
      resultado.push({ categoria, criadas: 0, existentes });
      continue;
    }
    const itens = EAP_CATALOGO.filter((c) => c.categoria === categoria);
    const { count } = await db.eapCatalogo.createMany({
      data: itens.map((c, i) => ({ categoria: c.categoria, sigla: c.sigla, nome: c.nome, ordem: i })),
    });
    resultado.push({ categoria, criadas: count, existentes: 0 });
  }
  return resultado;
}
