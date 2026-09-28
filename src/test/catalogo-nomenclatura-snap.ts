/**
 * Fixtures do catálogo de nomenclatura "como tabela de versão": o catálogo de disciplinas do dev
 * (18 cards, siglas só da v1) e a planilha do padrão novo que a gestão mandou em 2026-09-28,
 * transcrita como o ExcelJS a entrega (título de grupo mesclado repete o texto nas colunas).
 */
import { siglasDasColunas } from "@/modules/uploads/nomenclatura/siglas-versao";
import type { CardSnap, CatalogoSnap, ItemListaSnap } from "@/modules/projetos/nomenclatura/catalogo/versao";

function card(id: string, nome: string, codigo: string, categoria: string | null, sinonimos: string[] = []): CardSnap {
  return {
    id,
    nome,
    codigo,
    sinonimos,
    categoria,
    ativo: true,
    ordem: 0,
    versaoDesde: 1,
    versaoAte: null,
    siglas: siglasDasColunas(codigo, sinonimos).map((l, i) => ({ ...l, id: `${id}-s${i}` })),
  };
}

function item(id: string, categoria: "fase" | "tipo", sigla: string, nome: string, sinonimos: string[] = []): ItemListaSnap {
  return {
    id,
    categoria,
    sigla,
    nome,
    sinonimos,
    ativo: true,
    ordem: 0,
    versaoDesde: 1,
    versaoAte: null,
    siglas: siglasDasColunas(sigla, sinonimos).map((l, i) => ({ ...l, id: `${id}-s${i}` })),
  };
}

export function catalogoDev(): CatalogoSnap {
  return {
    cards: [
      card("acu", "Acústica", "ACU", "ARQUITETURA"),
      card("arq", "Arquitetura", "ARQ", "ARQUITETURA"),
      card("log", "Cabeamento", "LOG", "ELÉTRICA"),
      card("cftv", "CFTV", "SEG", "ELÉTRICA"),
      card("cli", "Climatização (AVAC)", "CLI", "MECÂNICA"),
      card("dre", "Drenagem", "DRE", "CIVIL"),
      card("ele", "Elétrico", "ELE", "ELÉTRICA"),
      card("est", "Estrutural", "EST", "CIVIL"),
      card("fun", "Fundações", "FUN", "CIVIL"),
      card("gas", "Gás", "GAS", "MECÂNICA"),
      // Em produção o Hidro tem ESG como sinônimo (acervo antigo) — é o caso do D4.
      card("hid", "Hidrossanitário", "HID", "CIVIL", ["HDR", "ESG"]),
      card("pci", "Incêndio (PPCI)", "PCI", "CIVIL"),
      card("orc", "Orçamento", "ORC", null),
      card("pav", "Pavimentação", "PAV", "CIVIL"),
      card("spd", "SPDA", "SPD", "ELÉTRICA"),
      card("sub", "Subestação", "SUB", "ELÉTRICA"),
      card("ter", "Terraplenagem", "TER", "CIVIL"),
      card("top", "Topografia", "TOP", "CIVIL"),
    ],
    subs: [],
    itens: [
      item("f-pl", "fase", "PL", "Estudo Preliminar"),
      item("f-bs", "fase", "BS", "Projeto Básico", ["PB"]),
      item("f-ex", "fase", "EX", "Projeto Executivo", ["PE", "EXE"]),
      item("t-det", "tipo", "DET", "Desenho Técnico", ["DE", "DTC"]),
      item("t-pqt", "tipo", "PQT", "Lista de Materiais", ["PLQ"]),
    ],
  };
}

/** A planilha da gestão (2026-09-28), linha a linha, como `lerPlanilha` devolve. */
export const PLANILHA_GESTAO: string[][] = [
  ["DISCIPLINA", "DISCIPLINA", "ESTRUTURA", "ESTRUTURA"],
  ["ELÉTRICA", "ELÉTRICA"],
  ["ELÉTRICA GERAL", "ELE", "CARD"],
  ["ENTRADA DE ENERGIA", "ENE", "CARD"],
  ["SUBESTAÇÃO", "SUBESTAÇÃO"],
  ["SUBESTAÇÃO ÁREA OU ABRIGADO", "SUB", "CARD"],
  ["FOTOVOLTAICO", "FOTOVOLTAICO"],
  ["FOTOVOLTAICO GERAL", "FOT", "CARD"],
  ["SPDA", "SPDA"],
  ["SPDA GERAL", "PDA", "CARD"],
  ["AUTOMAÇÃO", "AUTOMAÇÃO"],
  ["AUTOMAÇÃO GERAL", "AUT", "CARD"],
  ["TELECOMUNICAÇÕES", "TELECOMUNICAÇÕES", "CARD"],
  ["DADOS", "DAD", "", "SUB"],
  ["VOZ", "VOZ", "", "SUB"],
  ["INTERFONE", "INT", "", "SUB"],
  ["ANTENA", "ANT", "", "SUB"],
  ["SEGURANÇA E ALARME", "SEGURANÇA E ALARME", "CARD"],
  ["CFTV", "CAM", "", "SUB"],
  ["SEGURANÇA ELÉTRONICA", "SEE", "", "SUB"],
  ["SEGURANÇA PERIMETRAL", "SEP", "", "SUB"],
  ["CHAMADA DE ENFERMAGEM", "CHE", "", "SUB"],
  ["ESTRUTURAL", "ESTRUTURAL", "CARD"],
  ["CONCRETO", "CON", "", "SUB"],
  ["METÁLICA", "MET", "", "SUB"],
  ["MADEIRA", "MAD", "", "SUB"],
  ["FUNDAÇÃO", "FUNDAÇÃO"],
  ["FUNDAÇÃO", "FUN", "CARD"],
  ["HIDROSSANITÁRIO", "HIDROSSANITÁRIO", "CARD"],
  ["AGUA FRIA", "AGF", "", "SUB"],
  ["AGUA QUENTE", "AGQ", "", "SUB"],
  ["ESGOTO", "ESG", "", "SUB"],
  ["DESTINO FINAL", "DFE", "", "SUB"],
  ["ÁGUA PARA REUSO", "AGR", "", "SUB"],
  ["DRENAGEM", "DRENAGEM"],
  ["DRENAGEM GERAL", "DRE", "CARD"],
  ["SITEMA DE TANQUE RETARDO/ACUMULO", "TRE", "", "SUB"],
  ["PREVENÇÃO DE INCÊNDIO", "PREVENÇÃO DE INCÊNDIO", "CARD"],
  ["SINALIZAÇÃO E EMERGÊNCIA", "SIN", "", "SUB"],
  ["HIDRANTES", "HDT", "", "SUB"],
  ["SPRINKLERS", "SPK", "", "SUB"],
  ["DETECÇÃO E ALARME", "DTA", "", "SUB"],
  ["CLIMATIZAÇÃO", "CLIMATIZAÇÃO", "CARD"],
  ["AR CONDICIONADO", "ARC", "", "SUB"],
  ["EXAUSTÃO", "EXA", "", "SUB"],
  ["SAPONIFICAÇÃO", "SAP", "", "SUB"],
  ["BOMBA A VÁCUO", "BVA", "", "SUB"],
  ["COMPRESSOR", "CMP", "", "SUB"],
  ["GAS", "GAS", "CARD"],
  ["GLP", "GLP", "", "SUB"],
  ["GAS NATURAL", "GLN", "", "SUB"],
  ["GASES MEDICINAIS", "GME", "", "SUB"],
  ["ORÇAMENTO", "ORÇAMENTO"],
  ["ORÇAMENTO GERAL", "ORÇ", "CARD"],
  ["PAVIMENTAÇÃO", "PAVIMENTAÇÃO"],
  ["PAVIMENTAÇÃO GERAL", "PAV", "CARD"],
  ["TERRAPLANAGEM", "TERRAPLANAGEM"],
  ["TERRAPLANAGEM GERAL", "TER", "CARD"],
  ["TOPOGRAFIA", "TOPOGRAFIA"],
  ["TERRAPLANAGEM GERAL", "TOP", "CARD"],
  ["COMPATIBILIZAÇÃO", "COMPATIBILIZAÇÃO"],
  ["COMPATIBILIZAÇÃO", "CPB", "CARD"],
];
