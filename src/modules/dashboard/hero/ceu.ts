/**
 * Céu do herocard do Início — regras puras (sem React, sem I/O), rodam no navegador.
 *
 * Datas em `YYYY-MM-DD` e horas em MINUTOS DO DIA de São Paulo/Recife (UTC−3 fixo, sem horário de
 * verão desde 2019 — o mesmo corte de `ponto/service.ts`). O céu desenhado tem um modelo próprio
 * com horas "canônicas" (sol nasce 5,2 e se põe 17,8); `horaDoCeu` encaixa a hora real do dia,
 * pelo nascer e pôr do sol de Recife, nesse modelo.
 */

/* ── Tempo ───────────────────────────────────────────────── */
// Dia de São Paulo: `diaDeSaoPaulo` de `lib/data.ts` (client-safe).

const FUSO_MIN = -180;

/** Minutos desde a meia-noite em São Paulo (0–1439,99). */
export function minutoDeSaoPaulo(d: Date): number {
  const local = new Date(d.getTime() + FUSO_MIN * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60;
}


/** Soma dias a um `YYYY-MM-DD`. */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Dias corridos de `de` até `ate` (ambos `YYYY-MM-DD`). */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Dia da semana (0 = domingo) de um `YYYY-MM-DD`. */
export function diaDaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** `HH:MM` de um minuto do dia. */
export function hhmm(min: number): string {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutos de um `HH:MM`. */
export function minutosDe(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** Duração curta: `45 min`, `1h05`. */
export function duracao(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${String(r).padStart(2, "0")}` : `${r} min`;
}

/* ── Sol de Recife ───────────────────────────────────────── */

export type Local = { lat: number; lon: number; fusoHoras: number };
export const RECIFE: Local = { lat: -8.0476, lon: -34.877, fusoHoras: -3 };

export type SolDoDia = { nascer: number; meioDia: number; por: number };

/**
 * Nascer, meio-dia solar e pôr do sol (minutos locais) pela aproximação da NOAA — erro de um ou
 * dois minutos, sem serviço externo. Perto do Equador a variação no ano é pequena: em Recife o
 * sol se põe entre ~17h10 e ~17h45.
 */
export function solDoDia(dia: string, local: Local = RECIFE): SolDoDia {
  const [ano, mes, d] = dia.split("-").map(Number);
  const n = Math.round((Date.UTC(ano, mes - 1, d) - Date.UTC(ano, 0, 1)) / 86_400_000) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const rad = Math.PI / 180;
  const la = local.lat * rad;
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec)) / rad;
  const meio = 720 - 4 * local.lon - eq + local.fusoHoras * 60;
  return { nascer: meio - 4 * ha, meioDia: meio, por: meio + 4 * ha };
}

/** Hora real (minutos) → hora canônica do modelo do céu, encaixada no sol do dia. */
export function horaDoCeu(min: number, sol: SolDoDia): number {
  const pontos: [number, number][] = [
    [0, 0],
    [sol.nascer - 50, 4.3],
    [sol.nascer, 5.2],
    [sol.meioDia, 11.5],
    [sol.por, 17.8],
    [sol.por + 50, 18.8],
    [1440, 24],
  ];
  for (let i = 0; i < pontos.length - 1; i++) {
    const [a, ha] = pontos[i];
    const [b, hb] = pontos[i + 1];
    if (min <= b) return ha + (hb - ha) * ((min - a) / (b - a));
  }
  return 24;
}

/** Rótulo do momento do dia, pelo sol real. */
export function rotuloDoMomento(min: number, sol: SolDoDia): string {
  if (min < 240) return "Madrugada";
  if (min < sol.nascer + 30) return "Amanhecer";
  if (min < 720) return "Manhã";
  if (min < sol.por - 40) return "Tarde";
  if (min < sol.por + 20) return "Pôr do sol";
  return "Noite";
}

/** Saudação: "Boa noite" só quando escurece de verdade (20 min depois do pôr), não às 18h fixas. */
export function saudacao(min: number, sol: SolDoDia): string {
  if (min < 720) return "Bom dia";
  if (min < sol.por + 20) return "Boa tarde";
  return "Boa noite";
}

/* ── Lua ─────────────────────────────────────────────────── */

const LUA_NOVA_REF = Date.UTC(2000, 0, 6, 18, 14);
const MES_SINODICO = 29.530588853;

/** Fase da lua às 18h de Recife do dia: 0 = nova, 0,5 = cheia, volta a 1. */
export function faseDaLua(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  const dias = (Date.UTC(a, m - 1, d, 21) - LUA_NOVA_REF) / 86_400_000;
  return (((dias / MES_SINODICO) % 1) + 1) % 1;
}

/** Fração iluminada (0–1). */
export function iluminacaoDaLua(fase: number): number {
  return (1 - Math.cos(2 * Math.PI * fase)) / 2;
}

export function nomeDaFase(fase: number): string {
  if (fase < 0.03 || fase > 0.97) return "Lua nova";
  if (fase < 0.22) return "Lua crescente";
  if (fase < 0.28) return "Quarto crescente";
  if (fase < 0.47) return "Crescente gibosa";
  if (fase < 0.53) return "Lua cheia";
  if (fase < 0.72) return "Minguante gibosa";
  if (fase < 0.78) return "Quarto minguante";
  return "Lua minguante";
}

/**
 * Parte iluminada da lua num disco de raio 50 (viewBox 0 0 100 100). Hemisfério sul: crescendo, a
 * parte iluminada fica à ESQUERDA; minguando, o mesmo caminho é espelhado (`espelho`).
 */
export function caminhoDaLua(fase: number): { d: string; espelho: boolean } {
  const k = Math.cos(2 * Math.PI * fase);
  const rx = Math.abs(k) * 50;
  const fina = k > 0; // menos da metade iluminada
  const d = `M50 0 A50 50 0 0 0 50 100 A${rx.toFixed(2)} 50 0 0 ${fina ? 1 : 0} 50 0 Z`;
  return { d, espelho: fase > 0.5 };
}

/* ── Modelo do céu (hora canônica) ───────────────────────── */

function hexParaRgb(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbParaHex(rgb: number[]): string {
  return "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function lerpHex(a: string, b: string, t: number): string {
  const ra = hexParaRgb(a);
  const rb = hexParaRgb(b);
  return rgbParaHex(ra.map((v, i) => lerp(v, rb[i], t)));
}
/** `#RRGGBB` + alfa (0–1) → `#RRGGBBAA`. */
export function comAlfa(hex: string, alfa: number): string {
  return hex + Math.round(Math.max(0, Math.min(1, alfa)) * 255).toString(16).padStart(2, "0");
}
function rgba(hex: string, alfa: number): string {
  const [r, g, b] = hexParaRgb(hex);
  return `rgba(${r},${g},${b},${alfa})`;
}

/**
 * Chaves do céu: `g` = gradiente de base (4 paradas), `a` = as 3 cores da aurora (manchas suaves por
 * cima). Entre duas chaves tudo é interpolado pela hora.
 */
const CHAVES = [
  { h: 0, g: ["#050817", "#0E1A36", "#152348", "#1C2D58"], a: ["#3B2A7A", "#1F6F8B", "#5B3A8C"] },
  { h: 5, g: ["#1C2D58", "#6B3D5E", "#C97968", "#F5C18F"], a: ["#F28A6B", "#B85C8C", "#F5C18F"] },
  { h: 7, g: ["#4A8FC8", "#7AB6E0", "#A8D0E8", "#C2DDF0"], a: ["#9CD3F2", "#FFE2B8", "#7FB8E8"] },
  { h: 12, g: ["#2D7CB8", "#5BA0D8", "#80BBE0", "#9BCBE8"], a: ["#7CC4F0", "#BFE3F7", "#4A9AD6"] },
  { h: 16, g: ["#4F8BB8", "#9FB3C0", "#D8C8A8", "#F2C898"], a: ["#F2D09A", "#9FC2DA", "#F5B98A"] },
  { h: 17, g: ["#2A1D4E", "#7B3D5E", "#C8543A", "#F5A85E"], a: ["#FF8A4C", "#C84B7A", "#6A3D9A"] },
  { h: 18.3, g: ["#0A0E2E", "#1A1D3E", "#1A2545", "#1C2D58"], a: ["#3A2D7A", "#1E5A7A", "#5A2D6E"] },
  { h: 24, g: ["#050817", "#0E1A36", "#152348", "#1C2D58"], a: ["#3B2A7A", "#1F6F8B", "#5B3A8C"] },
];

export type Ceu = ReturnType<typeof calcularCeu>;

/** O céu numa hora canônica (0–24). */
export function calcularCeu(hora: number) {
  const h = ((hora % 24) + 24) % 24;
  let i = 0;
  while (i < CHAVES.length - 1 && CHAVES[i + 1].h <= h) i++;
  const a = CHAVES[i];
  const b = CHAVES[i + 1] ?? CHAVES[0];
  const t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h || 1)));
  const c = a.g.map((s, j) => lerpHex(s, b.g[j], t));
  const aurora = a.a.map((s, j) => lerpHex(s, b.a[j], t));

  // Sol: arco das 5h às 18h.
  const solNoCeu = h >= 5 && h <= 18;
  const tSol = solNoCeu ? (h - 5) / 13 : 0;
  const arcoSol = Math.sin(Math.PI * tSol);
  let solOpacidade = 0;
  if (solNoCeu) solOpacidade = h < 5.4 ? (h - 5) / 0.4 : h > 17.6 ? (18 - h) / 0.4 : 1;

  // Lua: arco das 18h às 6h.
  let horaLua = -1;
  if (h >= 18) horaLua = h - 18;
  else if (h <= 6) horaLua = h + 6;
  const tLua = horaLua >= 0 ? horaLua / 12 : 0;
  const arcoLua = Math.sin(Math.PI * tLua);
  let luaOpacidade = 0;
  if (horaLua >= 0) luaOpacidade = horaLua < 0.6 ? horaLua / 0.6 : horaLua > 11.4 ? (12 - horaLua) / 0.6 : 1;

  let estrelas = h < 4.5 || h > 19 ? 1 : h < 6 ? (6 - h) / 1.5 : h > 18 ? h - 18 : 0;
  estrelas = Math.max(0, Math.min(1, estrelas));

  let nevoa: string;
  if (h < 4) nevoa = "#2A1D4E";
  else if (h < 7) nevoa = lerpHex("#2A1D4E", "#FFE8C8", (h - 4) / 3);
  else if (h < 16) nevoa = "#FFFFFF";
  else if (h < 17) nevoa = lerpHex("#FFFFFF", "#FFD89A", h - 16);
  else if (h < 18) nevoa = lerpHex("#FFD89A", "#C8543A", h - 17);
  else if (h < 20) nevoa = lerpHex("#C8543A", "#2A1D4E", (h - 18) / 2);
  else nevoa = "#2A1D4E";

  const noite = Math.min(1, h < 5 || h > 19 ? 1 : h < 6 ? 6 - h : h > 18 ? h - 18 : 0);
  const claridade = Math.max(
    0,
    Math.min(1, h < 5.5 ? 0 : h < 7 ? (h - 5.5) / 1.5 : h < 17 ? 1 : h < 18.5 ? 1 - (h - 17) / 1.5 : 0),
  );
  const textoEscuro = claridade > 0.5;
  // Véu atrás do texto: nunca passa pelo cinza. Branco quando o texto é escuro; azul-noite com um
  // toque da cor do céu quando o texto é claro — troca no mesmo instante que o texto.
  const veu = textoEscuro ? "#FFFFFF" : lerpHex("#080E26", c[1], 0.22);
  const solNucleo = lerpHex("#F5A85E", "#FFFAD8", arcoSol);

  return {
    gradiente: `linear-gradient(160deg, ${c[0]} 0%, ${c[1]} 40%, ${c[2]} 72%, ${c[3]} 100%)`,
    aurora,
    solDireita: 8 + (1 - tSol) * 75,
    solTopo: 56 - arcoSol * 46,
    solTamanho: 40 + (1 - arcoSol) * 24,
    solNucleo,
    solHalo: lerpHex("#F5A85E", "#FFEEBB", arcoSol),
    solBrilho: arcoSol,
    solOpacidade,
    // A lua anda só pela metade direita: à esquerda ficaria atrás do véu de leitura e pareceria apagada.
    luaDireita: 10 + (1 - tLua) * 42,
    luaTopo: 40 - arcoLua * 30,
    luaTamanho: 38 + (1 - arcoLua) * 10,
    luaOpacidade,
    estrelas,
    nevoa,
    noite,
    claridade,
    textoEscuro,
    veu: rgba(veu, 0.88),
    veuMeio: rgba(veu, 0.5),
    /** Cor do ponto "agora" na linha do expediente: a do sol quando ele está no céu. */
    corDoAgora: solOpacidade > 0.05 ? solNucleo : "#E2E8F0",
  };
}
