import { describe, expect, it } from "vitest";
import {
  MAX_ATESTADO,
  MAX_DETALHES,
  MOTIVO_ABONO_JA_DECIDIDO,
  MOTIVO_APROVAR_SOBREPOSTA,
  MOTIVO_AUSENCIA_DE_RH,
  MOTIVO_AUSENCIA_EM_FERIAS,
  MOTIVO_PROPRIA_AUSENCIA,
  motivoDoConflito,
  motivoParaNaoDecidirAbono,
  motivoParaNaoLancarAbono,
  motivoParaRecusarAtestado,
  sobrepoeAusencia,
  tratamentoPadrao,
  validarEntradaAbono,
} from "@/modules/rh/abono-entrada";

const base = { dataInicio: "2026-11-10", dataFim: "2026-11-10", motivoTipo: "atestado", horaInicio: "", horaFim: "" };

describe("validarEntradaAbono", () => {
  it("dia inteiro válido devolve horários nulos", () => {
    expect(validarEntradaAbono(base)).toEqual({
      ok: true,
      dados: { dataInicio: "2026-11-10", dataFim: "2026-11-10", motivoTipo: "atestado", horaInicio: null, horaFim: null },
    });
  });

  it("intervalo de vários dias é aceito", () => {
    const r = validarEntradaAbono({ ...base, dataFim: "2026-11-14" });
    expect(r.ok).toBe(true);
  });

  it("ausência parcial em um dia guarda a janela", () => {
    const r = validarEntradaAbono({ ...base, motivoTipo: "consulta", horaInicio: "14:00", horaFim: "16:00" });
    expect(r).toEqual({
      ok: true,
      dados: { dataInicio: "2026-11-10", dataFim: "2026-11-10", motivoTipo: "consulta", horaInicio: "14:00", horaFim: "16:00" },
    });
  });

  // Cada recusa aponta o CAMPO: a tela marca e foca nele em vez de só mostrar um toast.
  it("sem datas recusa no campo que falta", () => {
    expect(validarEntradaAbono({ ...base, dataInicio: "" })).toEqual({ ok: false, erro: "Datas obrigatórias.", campo: "dataInicio" });
    expect(validarEntradaAbono({ ...base, dataFim: "" })).toEqual({ ok: false, erro: "Datas obrigatórias.", campo: "dataFim" });
  });

  it("data fora do formato ou inexistente recusa", () => {
    expect(validarEntradaAbono({ ...base, dataInicio: "10/11/2026" })).toEqual({
      ok: false,
      erro: "Data inválida.",
      campo: "dataInicio",
    });
    expect(validarEntradaAbono({ ...base, dataInicio: "2026-02-30", dataFim: "2026-03-01" })).toEqual({
      ok: false,
      erro: "Data inválida.",
      campo: "dataInicio",
    });
    expect(validarEntradaAbono({ ...base, dataFim: "2026-13-01" })).toEqual({ ok: false, erro: "Data inválida.", campo: "dataFim" });
  });

  it("motivo fora da lista recusa", () => {
    expect(validarEntradaAbono({ ...base, motivoTipo: "ferias" })).toEqual({
      ok: false,
      erro: "Motivo inválido.",
      campo: "motivoTipo",
    });
  });

  it("fim antes do início recusa; mesmo dia aceita", () => {
    expect(validarEntradaAbono({ ...base, dataFim: "2026-11-09" })).toEqual({
      ok: false,
      erro: "A data de fim não pode ser anterior ao início.",
      campo: "dataFim",
    });
  });

  it("só um dos horários recusa no que falta", () => {
    expect(validarEntradaAbono({ ...base, horaInicio: "14:00" })).toEqual({
      ok: false,
      erro: "Informe o horário de início e de fim.",
      campo: "horaFim",
    });
    expect(validarEntradaAbono({ ...base, horaFim: "16:00" })).toEqual({
      ok: false,
      erro: "Informe o horário de início e de fim.",
      campo: "horaInicio",
    });
  });

  it("horário mal formado recusa", () => {
    expect(validarEntradaAbono({ ...base, horaInicio: "25:00", horaFim: "26:00" })).toEqual({
      ok: false,
      erro: "Informe o horário de início e de fim.",
      campo: "horaInicio",
    });
  });

  it("janela invertida ou vazia recusa no término", () => {
    const erro = { ok: false, erro: "O horário de fim deve ser depois do início.", campo: "horaFim" };
    expect(validarEntradaAbono({ ...base, horaInicio: "16:00", horaFim: "14:00" })).toEqual(erro);
    expect(validarEntradaAbono({ ...base, horaInicio: "14:00", horaFim: "14:00" })).toEqual(erro);
  });

  it("horário com mais de um dia recusa", () => {
    expect(validarEntradaAbono({ ...base, dataFim: "2026-11-11", horaInicio: "14:00", horaFim: "16:00" })).toEqual({
      ok: false,
      erro: "Ausência com horário vale para um único dia.",
      campo: "dataFim",
    });
  });
});

describe("tratamentoPadrao", () => {
  it("atestado abona; os demais motivos vão para o banco de horas", () => {
    expect(tratamentoPadrao("atestado")).toBe("abonar");
    expect(tratamentoPadrao("consulta")).toBe("banco_horas");
    expect(tratamentoPadrao("exame")).toBe("banco_horas");
    expect(tratamentoPadrao("compromisso")).toBe("banco_horas");
    expect(tratamentoPadrao("outro")).toBe("banco_horas");
  });
});

describe("motivoParaNaoLancarAbono", () => {
  const alvo = { id: "u2", ativo: true, tipo: "interno", ehRh: false };
  const rh = { id: "u1", superUsuario: false };
  const admin = { id: "adm", superUsuario: true };

  it("colaborador interno ativo de outra pessoa pode", () => {
    expect(motivoParaNaoLancarAbono(alvo, rh)).toBeNull();
  });

  it("inexistente ou inativo recusa", () => {
    expect(motivoParaNaoLancarAbono(null, rh)).toBe("Colaborador não encontrado.");
    expect(motivoParaNaoLancarAbono({ ...alvo, ativo: false }, rh)).toBe("Colaborador não encontrado.");
  });

  it("cliente do portal recusa", () => {
    expect(motivoParaNaoLancarAbono({ ...alvo, tipo: "externo" }, rh)).toBe(
      "Abono só pode ser lançado para colaborador interno.",
    );
  });

  it("a própria ausência recusa: um administrador aprova a solicitação", () => {
    expect(motivoParaNaoLancarAbono({ ...alvo, id: "u1", ehRh: true }, rh)).toMatch(/sua própria ausência.*administrador/);
  });

  it("ausência de quem é do RH só um administrador lança", () => {
    expect(motivoParaNaoLancarAbono({ ...alvo, ehRh: true }, rh)).toBe("Para quem é do RH, só um administrador lança a ausência.");
    expect(motivoParaNaoLancarAbono({ ...alvo, ehRh: true }, admin)).toBeNull();
  });
});

describe("limites da entrada", () => {
  it("período de até um ano passa; mais que isso recusa", () => {
    expect(validarEntradaAbono({ ...base, dataInicio: "2026-01-01", dataFim: "2026-12-31" }).ok).toBe(true);
    expect(validarEntradaAbono({ ...base, dataInicio: "2026-01-01", dataFim: "2062-01-01" })).toEqual({
      ok: false,
      erro: "O período não pode passar de um ano. Confira as datas.",
      campo: "dataFim",
    });
  });

  it("detalhes acima do teto recusam", () => {
    expect(validarEntradaAbono({ ...base, motivo: "x".repeat(MAX_DETALHES) }).ok).toBe(true);
    expect(validarEntradaAbono({ ...base, motivo: "x".repeat(MAX_DETALHES + 1) })).toEqual({
      ok: false,
      erro: "Os detalhes passam de 1000 caracteres.",
      campo: "motivo",
    });
  });
});

describe("motivoParaRecusarAtestado", () => {
  it("PDF e imagens passam, sem importar a caixa", () => {
    for (const nome of ["a.pdf", "foto.JPG", "x.jpeg", "y.png", "z.webp", "w.gif", "iphone.HEIC", "b.heif"]) {
      expect(motivoParaRecusarAtestado(nome, 1000)).toBeNull();
    }
  });

  it("outros formatos e arquivo sem extensão recusam", () => {
    const msg = "Formato não aceito. Envie PDF ou imagem (JPG, PNG, WEBP, GIF ou HEIC).";
    expect(motivoParaRecusarAtestado("pagina.html", 10)).toBe(msg);
    expect(motivoParaRecusarAtestado("desenho.svg", 10)).toBe(msg);
    expect(motivoParaRecusarAtestado("programa.exe", 10)).toBe(msg);
    expect(motivoParaRecusarAtestado("atestado", 10)).toBe(msg);
  });

  it("25 MB passa; um byte a mais recusa", () => {
    expect(motivoParaRecusarAtestado("a.pdf", MAX_ATESTADO)).toBeNull();
    expect(motivoParaRecusarAtestado("a.pdf", MAX_ATESTADO + 1)).toBe("Atestado muito grande (máx. 25 MB).");
  });
});

describe("motivoParaNaoDecidirAbono", () => {
  const rh = { id: "rh1", superUsuario: false };
  const pendente = { status: "pendente", userId: "u2", donoEhRh: false };

  it("abono pendente de quem não é do RH pode ser decidido pelo RH", () => {
    expect(motivoParaNaoDecidirAbono(pendente, rh)).toBeNull();
  });

  it("abono já aprovado ou rejeitado recusa com a frase de já decidido", () => {
    expect(motivoParaNaoDecidirAbono({ ...pendente, status: "aprovado" }, rh)).toBe(MOTIVO_ABONO_JA_DECIDIDO);
    expect(motivoParaNaoDecidirAbono({ ...pendente, status: "rejeitado" }, rh)).toBe(MOTIVO_ABONO_JA_DECIDIDO);
  });

  it("a própria ausência recusa, exceto para o superusuário", () => {
    const propria = { ...pendente, userId: "rh1", donoEhRh: true };
    expect(motivoParaNaoDecidirAbono(propria, rh)).toBe(MOTIVO_PROPRIA_AUSENCIA);
    expect(motivoParaNaoDecidirAbono(propria, { ...rh, superUsuario: true })).toBeNull();
  });

  it("a de um colega do RH só um administrador decide", () => {
    const deRh = { ...pendente, donoEhRh: true };
    expect(motivoParaNaoDecidirAbono(deRh, rh)).toBe(MOTIVO_AUSENCIA_DE_RH);
    expect(motivoParaNaoDecidirAbono(deRh, { id: "adm", superUsuario: true })).toBeNull();
  });
});

describe("sobrepoeAusencia", () => {
  const dia = (dataInicio: string, dataFim = dataInicio) => ({ dataInicio, dataFim, horaInicio: null, horaFim: null });
  const janela = (data: string, horaInicio: string, horaFim: string) => ({ dataInicio: data, dataFim: data, horaInicio, horaFim });

  it("períodos de dias que se cruzam sobrepõem; vizinhos não", () => {
    expect(sobrepoeAusencia(dia("2026-11-10", "2026-11-12"), dia("2026-11-12", "2026-11-14"))).toBe(true);
    expect(sobrepoeAusencia(dia("2026-11-10", "2026-11-12"), dia("2026-11-13"))).toBe(false);
  });

  it("dia inteiro cobre qualquer janela do mesmo dia", () => {
    expect(sobrepoeAusencia(dia("2026-11-10"), janela("2026-11-10", "14:00", "16:00"))).toBe(true);
    expect(sobrepoeAusencia(janela("2026-11-10", "14:00", "16:00"), dia("2026-11-09", "2026-11-11"))).toBe(true);
  });

  it("duas janelas no mesmo dia só sobrepõem se as horas se cruzam", () => {
    expect(sobrepoeAusencia(janela("2026-11-10", "09:00", "10:00"), janela("2026-11-10", "14:00", "15:00"))).toBe(false);
    expect(sobrepoeAusencia(janela("2026-11-10", "09:00", "10:00"), janela("2026-11-10", "10:00", "11:00"))).toBe(false);
    expect(sobrepoeAusencia(janela("2026-11-10", "09:00", "11:00"), janela("2026-11-10", "10:00", "12:00"))).toBe(true);
    expect(sobrepoeAusencia(janela("2026-11-10", "14:00", "16:00"), janela("2026-11-11", "14:00", "16:00"))).toBe(false);
  });
});

describe("motivoDoConflito", () => {
  const pendente = { tipo: "ausencia", status: "pendente" } as const;
  const aprovada = { tipo: "ausencia", status: "aprovado" } as const;
  const ferias = { tipo: "ferias" } as const;

  it("lançamento do RH: pendente aponta a fila, aprovada recusa, férias recusa", () => {
    expect(motivoDoConflito(pendente, "lancar")).toMatch(/Abonos pendentes/);
    expect(motivoDoConflito(aprovada, "lancar")).toMatch(/aprovada/);
    expect(motivoDoConflito(ferias, "lancar")).toBe(MOTIVO_AUSENCIA_EM_FERIAS);
  });

  it("aprovação: manda rejeitar a solicitação", () => {
    expect(motivoDoConflito(aprovada, "aprovar")).toBe(MOTIVO_APROVAR_SOBREPOSTA);
    expect(motivoDoConflito(ferias, "aprovar")).toMatch(/férias aprovadas.*Rejeite/);
  });

  it("a própria pessoa: fala com ela, não do RH", () => {
    expect(motivoDoConflito(pendente, "propria")).toMatch(/^Você já pediu/);
    expect(motivoDoConflito(aprovada, "propria")).toMatch(/^Você já tem uma ausência aprovada/);
    expect(motivoDoConflito(ferias, "propria")).toBe("Você tem férias aprovadas nesse período.");
  });
});

describe("frases", () => {
  it("são frases para o usuário", () => {
    expect(MOTIVO_ABONO_JA_DECIDIDO).toMatch(/já foi decidido/);
    expect(MOTIVO_PROPRIA_AUSENCIA).toMatch(/administrador/);
    expect(MOTIVO_AUSENCIA_DE_RH).toMatch(/administrador/);
  });
});
