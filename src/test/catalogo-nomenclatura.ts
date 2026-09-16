/**
 * Catálogo de teste do motor de nomenclatura: espelho do catálogo de PRODUÇÃO em 2026-09-15
 * (fases, tipos e disciplinas com a faixa de numeração) mais os sinônimos de
 * `sinonimos-iniciais.ts` (D2 da spec `docs/superpowers/specs/2026-09-15-motor-nomenclatura.md`).
 *
 * Existe para os testes medirem o ALGORITMO com o vocabulário real, antes de a F2 levar os
 * sinônimos para o banco. Quando a F2 entrar, este arquivo continua sendo a fonte dos testes.
 */

import { sinonimosDe } from "@/modules/uploads/nomenclatura/sinonimos-iniciais";
import type { CatalogosNomenclatura } from "@/modules/uploads/nomenclatura/vocabulario";

export const CATALOGO_SENA: CatalogosNomenclatura = {
  disciplinas: [
    // `numeracaoFim` aqui é FICTÍCIO pros testes de fronteira — em produção/dev NENHUMA
    // disciplina tem `numeracaoFim` preenchido ainda (o campo é novo, 2026-09-16; alguém
    // completa pela tela de catálogo). TOP fica sem fim de propósito, pra continuar testando
    // o caso "só início, sem fim" (que também é o estado real de tudo por enquanto).
    { id: "d-top", codigo: "TOP", numeracao: 0, sinonimos: sinonimosDe("disciplina", "TOP") },
    { id: "d-ter", codigo: "TER", numeracao: 1000, numeracaoFim: 1999, sinonimos: sinonimosDe("disciplina", "TER") },
    { id: "d-pav", codigo: "PAV", numeracao: 2000, numeracaoFim: 2999, sinonimos: sinonimosDe("disciplina", "PAV") },
    { id: "d-arq", codigo: "ARQ", numeracao: 3000, numeracaoFim: 3099, sinonimos: sinonimosDe("disciplina", "ARQ") },
    { id: "d-acu", codigo: "ACU", numeracao: 3100, numeracaoFim: 3199, sinonimos: sinonimosDe("disciplina", "ACU") },
    { id: "d-est", codigo: "EST", numeracao: 4000, numeracaoFim: 4999, sinonimos: sinonimosDe("disciplina", "EST") },
    { id: "d-ele", codigo: "ELE", numeracao: 5000, numeracaoFim: 5099, sinonimos: sinonimosDe("disciplina", "ELE") },
    { id: "d-log", codigo: "LOG", numeracao: 5100, numeracaoFim: 5199, sinonimos: sinonimosDe("disciplina", "LOG") },
    { id: "d-seg", codigo: "SEG", numeracao: 5200, numeracaoFim: 5299, sinonimos: sinonimosDe("disciplina", "SEG") },
    { id: "d-spd", codigo: "SPD", numeracao: 5300, numeracaoFim: 5399, sinonimos: sinonimosDe("disciplina", "SPD") },
    { id: "d-sub", codigo: "SUB", numeracao: 5400, numeracaoFim: 5499, sinonimos: sinonimosDe("disciplina", "SUB") },
    { id: "d-hid", codigo: "HID", numeracao: 6000, numeracaoFim: 6099, sinonimos: sinonimosDe("disciplina", "HID") },
    { id: "d-dre", codigo: "DRE", numeracao: 6100, numeracaoFim: 6199, sinonimos: sinonimosDe("disciplina", "DRE") },
    { id: "d-pci", codigo: "PCI", numeracao: 7000, numeracaoFim: 7999, sinonimos: sinonimosDe("disciplina", "PCI") },
    { id: "d-cli", codigo: "CLI", numeracao: 8000, numeracaoFim: 8199, sinonimos: sinonimosDe("disciplina", "CLI") },
    { id: "d-gas", codigo: "GAS", numeracao: 8200, numeracaoFim: 8299, sinonimos: sinonimosDe("disciplina", "GAS") },
    { id: "d-orc", codigo: "ORC", numeracao: 9000, numeracaoFim: 9999, sinonimos: sinonimosDe("disciplina", "ORC") },
    { id: "d-fun", codigo: "FUN", numeracao: null, sinonimos: sinonimosDe("disciplina", "FUN") },
  ],
  fases: [
    { id: "f-pl", sigla: "PL", sinonimos: sinonimosDe("fase", "PL") },
    { id: "f-ap", sigla: "AP", sinonimos: sinonimosDe("fase", "AP") },
    { id: "f-bs", sigla: "BS", sinonimos: sinonimosDe("fase", "BS") },
    { id: "f-ex", sigla: "EX", sinonimos: sinonimosDe("fase", "EX") },
    { id: "f-lg", sigla: "LG", sinonimos: sinonimosDe("fase", "LG") },
    { id: "f-ab", sigla: "AB", sinonimos: sinonimosDe("fase", "AB") },
  ],
  tipos: [
    { id: "t-m3d", sigla: "M3D", sinonimos: sinonimosDe("tipo", "M3D") },
    { id: "t-det", sigla: "DET", sinonimos: sinonimosDe("tipo", "DET") },
    { id: "t-mem", sigla: "MEM", sinonimos: sinonimosDe("tipo", "MEM") },
    { id: "t-mec", sigla: "MEC", sinonimos: sinonimosDe("tipo", "MEC") },
    { id: "t-pqt", sigla: "PQT", sinonimos: sinonimosDe("tipo", "PQT") },
    { id: "t-pmt", sigla: "PMT", sinonimos: sinonimosDe("tipo", "PMT") },
    { id: "t-doc", sigla: "DOC", sinonimos: sinonimosDe("tipo", "DOC") },
    { id: "t-lms", sigla: "LMS", sinonimos: sinonimosDe("tipo", "LMS") },
  ],
};

/** Carga inicial do catálogo de extensões (§3.4 da spec), na forma que o motor consome. */
export { EXTENSOES_INICIAIS as EXTENSOES_SENA } from "@/modules/uploads/nomenclatura/extensoes-iniciais";
