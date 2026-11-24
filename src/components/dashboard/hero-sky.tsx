import type { CSSProperties } from "react";
import { caminhoDaLua, comAlfa, iluminacaoDaLua, lerp, lerpHex, type Ceu } from "@/modules/dashboard/hero/ceu";
import type { Campanha, TemaDaEpoca } from "@/modules/dashboard/hero/epoca";

/*
 * Pseudo-aleatório estável: hash inteiro (sem `Math.sin`, cuja última casa pode variar entre o Node
 * e o navegador e desencontrar a hidratação), arredondado a 4 casas.
 */
function aleatorio(i: number, sal: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(sal + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return Math.round(((h >>> 0) / 4294967296) * 10000) / 10000;
}
const casas = (n: number) => Math.round(n * 100) / 100;

const ESTRELAS = Array.from({ length: 46 }, (_, i) => ({
  x: casas(3 + aleatorio(i, 1) * 94),
  y: casas(3 + aleatorio(i, 2) * 55),
  tamanho: casas(1 + aleatorio(i, 3) * 1.8),
  o: casas(0.35 + aleatorio(i, 4) * 0.65),
  atraso: casas(aleatorio(i, 5) * 4),
}));

/* Faixas de névoa que atravessam devagar. */
const NEVOAS = [
  { left: "-8%", top: "18%", w: "55%", h: "26%", alfa: 0.34, dur: 38, atraso: 0 },
  { left: "38%", top: "46%", w: "62%", h: "30%", alfa: 0.26, dur: 46, atraso: -12 },
  { left: "10%", top: "68%", w: "70%", h: "34%", alfa: 0.22, dur: 54, atraso: -27 },
];

/* ── Skyline de obra (prédios isométricos + grua) ─────────── */
const CHAO = 160;
const PROF = { dx: 12, dy: -7 };
const PREDIOS = [
  { x: 262, w: 38, h: 58 },
  { x: 312, w: 48, h: 98 },
  { x: 372, w: 34, h: 72 },
  { x: 418, w: 58, h: 128 },
  { x: 490, w: 42, h: 64 },
  { x: 544, w: 46, h: 90 },
];

type Janela = { x: number; y: number; o: number; atraso: number };
const JANELAS: Janela[] = PREDIOS.flatMap((p, pi) => {
  const lista: Janela[] = [];
  const colunas = Math.floor((p.w - 8) / 9);
  const linhas = Math.floor((p.h - 12) / 11);
  for (let r = 0; r < linhas; r++) {
    for (let c = 0; c < colunas; c++) {
      const k = pi * 400 + r * 20 + c;
      if (aleatorio(k, 7) < 0.38) continue; // janela apagada a noite toda
      lista.push({ x: p.x + 6 + c * 9, y: CHAO - p.h + 8 + r * 11, o: casas(0.45 + aleatorio(k, 8) * 0.55), atraso: casas(aleatorio(k, 9) * 2.4) });
    }
  }
  return lista;
});

/* Pisca-pisca de Natal nas coberturas. */
const CORES_NATAL = ["#FFF4D6", "#FF5A5F", "#4ADE80", "#FFD166"];
const LUZES_NATAL = PREDIOS.flatMap((p, pi) => {
  const lista: { x: number; y: number; cor: string; fase: "a" | "b" }[] = [];
  for (let x = p.x + 2.5, n = 0; x <= p.x + p.w - 2; x += 5, n++) {
    lista.push({ x, y: CHAO - p.h - 0.4, cor: CORES_NATAL[(n + pi) % CORES_NATAL.length], fase: n % 2 ? "a" : "b" });
  }
  return lista;
});

/* Bandeirinhas de São João: dois varais. */
const CORES_JUNINAS = ["#E63946", "#F4C430", "#2A9D8F", "#3A86FF", "#FB8500", "#8338EC"];
const VARAIS = [0, 1].map((v) => {
  const x0 = v * 350;
  const largura = 350;
  const flecha = 16 + v * 2;
  const bandeiras: { d: string; cor: string; atraso: number }[] = [];
  for (let x = x0 + 12, n = 0; x < x0 + largura - 8; x += 21, n++) {
    const t = (x - x0) / largura;
    const y = 2 + flecha * 4 * t * (1 - t) * 0.995;
    bandeiras.push({
      d: `M${x - 6} ${y} H${x + 6} V${y + 13} L${x} ${y + 9} L${x - 6} ${y + 13} Z`,
      cor: CORES_JUNINAS[(n + v * 3) % CORES_JUNINAS.length],
      atraso: casas(-aleatorio(n + v * 50, 11) * 3),
    });
  }
  return { corda: `M${x0} 2 Q${x0 + largura / 2} ${2 + flecha * 2} ${x0 + largura} 2`, bandeiras };
});

/* Carnaval: sombrinhas de frevo sobre as coberturas (centro da copa e cor de cada gomo). */
const CORES_FREVO = ["#E63946", "#F4C430", "#2A9D8F", "#3A86FF"];
const SOMBRINHAS = [
  { cx: 281, cy: 84, atraso: 0 },
  { cx: 336, cy: 44, atraso: -1.1 },
  { cx: 511, cy: 78, atraso: -2.3 },
];
function gomosDaSombrinha(cx: number, cy: number, r = 12) {
  return CORES_FREVO.map((cor, k) => {
    const a0 = Math.PI + (k * Math.PI) / 4;
    const a1 = a0 + Math.PI / 4;
    const p = (a: number) => `${casas(cx + r * Math.cos(a))} ${casas(cy + r * Math.sin(a))}`;
    return { cor, d: `M${cx} ${cy} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z` };
  });
}

/* Serpentinas penduradas no alto (Carnaval). */
const SERPENTINAS = Array.from({ length: 9 }, (_, i) => {
  const x = 60 + i * 66 + Math.round(aleatorio(i, 21) * 20);
  const voltas = 1 + Math.floor(aleatorio(i, 22) * 2);
  let d = `M${x} 0`;
  for (let v = 0; v < voltas; v++) d += " q7 8 0 16 q-7 8 0 16";
  return { d, cor: CORES_FREVO[(i + 1) % CORES_FREVO.length], atraso: casas(-aleatorio(i, 23) * 3) };
});

/* Páscoa: orelhas de coelho atrás do primeiro prédio (fora do painel de aniversariantes, que cobre o canto direito). */
const ORELHAS = [
  { cx: 275, giro: -12 },
  { cx: 285, giro: 9 },
];

/* Páscoa: ovos pintados ao pé da obra. */
const OVOS = [
  { cx: 440, cor: "#F9A8D4" },
  { cx: 453, cor: "#93C5FD" },
  { cx: 466, cor: "#FDE68A" },
];

function Skyline({ ceu, tema, campanha }: { ceu: Ceu; tema: TemaDaEpoca; campanha: Campanha | null }) {
  const b = ceu.claridade;
  const traco = comAlfa(lerpHex("#A9C4E0", "#1E3C64", b), lerp(0.42, 0.3, b));
  const corFachada = lerpHex("#0C1630", "#FFFFFF", b);
  const alfaFachada = lerp(0.55, 0.22, b);
  const fachada = comAlfa(corFachada, alfaFachada);
  const lateral = comAlfa(corFachada, alfaFachada * 0.6);
  const topo = comAlfa(corFachada, Math.min(1, alfaFachada * 1.3));
  const TRANS = "fill 1.5s linear, stroke 1.5s linear";
  const acesas = 1 - b;

  return (
    <svg
      className="pointer-events-none absolute right-0 bottom-0 h-[78%] w-[72%] opacity-50 sm:opacity-100"
      viewBox="150 0 450 160"
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden
    >
      {/* Grua: mastro treliçado, lança, contra-lança e gancho balançando */}
      <g stroke={traco} strokeWidth={1} fill="none" style={{ transition: TRANS }}>
        <line x1={228} y1={CHAO} x2={228} y2={22} />
        <line x1={236} y1={CHAO} x2={236} y2={22} />
        {Array.from({ length: 12 }, (_, k) => (
          <line key={k} x1={228} y1={CHAO - k * 11.5} x2={236} y2={CHAO - (k + 1) * 11.5} />
        ))}
        <line x1={176} y1={22} x2={348} y2={22} />
        <line x1={190} y1={28} x2={236} y2={22} />
        <line x1={232} y1={8} x2={176} y2={22} />
        <line x1={232} y1={8} x2={348} y2={22} />
        <line x1={232} y1={8} x2={232} y2={22} />
      </g>
      <rect x={180} y={22} width={14} height={8} fill={traco} style={{ transition: TRANS }} />
      <g className="animate-hero-gancho" style={{ transformOrigin: "318px 22px" }}>
        <line x1={318} y1={22} x2={318} y2={70} stroke={traco} strokeWidth={0.8} />
        <path d="M314 70 h8 v5 h-8 z" fill={traco} />
      </g>
      {/* Topo da grua: luz de balizamento — no Natal, uma estrela */}
      {tema === "natal" ? (
        <path
          d="M232 -1 l2.2 5 5.4 .5 -4.1 3.6 1.2 5.3 -4.7 -2.8 -4.7 2.8 1.2 -5.3 -4.1 -3.6 5.4 -.5 z"
          fill="#FFD166"
          className="animate-hero-pisca-a"
          style={{ animationDuration: "3.2s", filter: "drop-shadow(0 0 3px #FFD166)" }}
        />
      ) : (
        <circle cx={232} cy={7} r={2} fill="#FF5A4E" className="animate-hero-baliza" />
      )}

      {/* Mês de campanha: o laço da cor da campanha pendurado no mastro da grua */}
      {campanha && (
        <path
          d="M-5.5 13 L2.5 -1 C6 -7 4 -12 0 -12 C-4 -12 -6 -7 -2.5 -1 L5.5 13"
          transform="translate(232 50) scale(1.15)"
          fill="none"
          stroke={campanha.cor}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 2px ${comAlfa(campanha.cor, 0.6)})` }}
        />
      )}

      {/* Prédios: fachada, lateral e cobertura */}
      {PREDIOS.map((p, k) => {
        const topoY = CHAO - p.h;
        return (
          <g key={k} stroke={traco} strokeWidth={1} strokeLinejoin="round" style={{ transition: TRANS }}>
            <polygon
              points={`${p.x + p.w},${topoY} ${p.x + p.w + PROF.dx},${topoY + PROF.dy} ${p.x + p.w + PROF.dx},${CHAO + PROF.dy} ${p.x + p.w},${CHAO}`}
              fill={lateral}
              style={{ transition: TRANS }}
            />
            <polygon
              points={`${p.x},${topoY} ${p.x + PROF.dx},${topoY + PROF.dy} ${p.x + p.w + PROF.dx},${topoY + PROF.dy} ${p.x + p.w},${topoY}`}
              fill={topo}
              style={{ transition: TRANS }}
            />
            <rect x={p.x} y={topoY} width={p.w} height={p.h} fill={fachada} style={{ transition: TRANS }} />
          </g>
        );
      })}

      {/* Janelas: acendem em sequência ao anoitecer */}
      {JANELAS.map((j, k) => (
        <rect
          key={k}
          x={j.x}
          y={j.y}
          width={4}
          height={5}
          rx={0.6}
          fill="#FFD48A"
          style={{ opacity: j.o * acesas, transition: `opacity 1.2s ease ${j.atraso}s` }}
        />
      ))}

      {/* Páscoa: orelhas espiando atrás de um prédio e ovos ao pé da obra */}
      {tema === "pascoa" && (
        <g>
          <defs>
            <clipPath id="hero-orelhas">
              <rect x={256} y={60} width={50} height={37} />
            </clipPath>
          </defs>
          <g clipPath="url(#hero-orelhas)">
            {ORELHAS.map((o, k) => (
              <g key={k} className="animate-hero-orelha" style={{ animationDelay: `${-k * 0.35}s` }}>
                <g transform={`rotate(${o.giro} ${o.cx} 100)`}>
                  <ellipse cx={o.cx} cy={88} rx={3.6} ry={12} fill="#F4EEE8" />
                  <ellipse cx={o.cx} cy={89} rx={1.6} ry={8.5} fill="#F9A8D4" />
                </g>
              </g>
            ))}
          </g>
          {OVOS.map((o, k) => (
            <g key={k}>
              <ellipse cx={o.cx} cy={CHAO - 7} rx={5.2} ry={7} fill={o.cor} />
              <path d={`M${o.cx - 5} ${CHAO - 7} l2.5 -2.2 2.5 2.2 2.5 -2.2 2.5 2.2`} fill="none" stroke="#FFFFFF" strokeWidth={1} />
            </g>
          ))}
        </g>
      )}

      {/* Carnaval: sombrinhas de frevo dançando sobre as coberturas */}
      {tema === "carnaval" &&
        SOMBRINHAS.map((sb, k) => (
          <g key={k} className="animate-hero-frevo" style={{ animationDelay: `${sb.atraso}s` }}>
            {gomosDaSombrinha(sb.cx, sb.cy).map((g, j) => (
              <path key={j} d={g.d} fill={g.cor} />
            ))}
            <path d={`M${sb.cx} ${sb.cy} v15 q0 3 -3 3`} fill="none" stroke="#3A2A1A" strokeWidth={1} strokeLinecap="round" />
          </g>
        ))}

      {/* São João: fogueira ao pé da obra */}
      {tema === "junino" && (
        <g>
          <defs>
            <radialGradient id="hero-fogo">
              <stop offset="0" stopColor="#FF9F43" stopOpacity={0.55} />
              <stop offset="1" stopColor="#FF9F43" stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={200} cy={CHAO - 8} r={26} fill="url(#hero-fogo)" />
          <path d={`M190 ${CHAO} l20 -6 M190 ${CHAO - 6} l20 6`} stroke="#6B3A1E" strokeWidth={2.4} strokeLinecap="round" />
          <path
            className="animate-hero-chama"
            d={`M200 ${CHAO - 4} C192 ${CHAO - 10} 196 ${CHAO - 18} 200 ${CHAO - 24} C204 ${CHAO - 18} 208 ${CHAO - 10} 200 ${CHAO - 4} Z`}
            fill="#FFB347"
          />
          <path
            className="animate-hero-chama"
            style={{ animationDelay: "-.4s" }}
            d={`M200 ${CHAO - 5} C196 ${CHAO - 9} 198 ${CHAO - 14} 200 ${CHAO - 17} C202 ${CHAO - 14} 204 ${CHAO - 9} 200 ${CHAO - 5} Z`}
            fill="#FFF1A8"
          />
        </g>
      )}

      {/* Natal: pisca-pisca nas coberturas (mais forte à noite) */}
      {tema === "natal" && (
        <g style={{ opacity: 0.55 + 0.45 * acesas }}>
          {LUZES_NATAL.map((l, k) => (
            <circle key={k} cx={l.x} cy={l.y} r={1.2} fill={l.cor} className={l.fase === "a" ? "animate-hero-pisca-a" : "animate-hero-pisca-b"} />
          ))}
        </g>
      )}

      {/* Linha do chão */}
      <line x1={150} y1={CHAO - 0.5} x2={600} y2={CHAO - 0.5} stroke={traco} strokeWidth={1} />
    </svg>
  );
}

/* Granulado fino por cima de tudo (SVG estático, sem custo de animação). */
const GRAO =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Confete (festa e Carnaval) e pétalas (Dia da Mulher): caem atravessando o card. */
const CORES_CONFETE = ["#E63946", "#F4C430", "#2A9D8F", "#3A86FF", "#FB8500", "#8338EC", "#F472B6"];
const CORES_PETALAS = ["#C084FC", "#E9D5FF", "#A855F7", "#F0ABFC"];
const CONFETE = Array.from({ length: 28 }, (_, i) => ({
  x: casas(30 + aleatorio(i, 31) * 68),
  dur: casas(6 + aleatorio(i, 32) * 4),
  atraso: casas(-aleatorio(i, 33) * 10),
  giro: casas(1.4 + aleatorio(i, 34) * 1.6),
  largo: aleatorio(i, 35) < 0.5,
  cor: CORES_CONFETE[i % CORES_CONFETE.length],
}));
const PETALAS = Array.from({ length: 24 }, (_, i) => ({
  x: casas(30 + aleatorio(i, 41) * 68),
  dur: casas(10 + aleatorio(i, 42) * 5),
  atraso: casas(-aleatorio(i, 43) * 15),
  giro: casas(3 + aleatorio(i, 44) * 2),
  cor: CORES_PETALAS[i % CORES_PETALAS.length],
}));

function Chuva({ tipo }: { tipo: "confete" | "petalas" }) {
  if (tipo === "petalas") {
    return PETALAS.map((p, k) => (
      <span key={k} className="animate-hero-cair absolute inset-0" style={{ animationDuration: p.dur + "s", animationDelay: p.atraso + "s" }}>
        <i
          className="animate-hero-rodopio absolute top-0 block h-3 w-2.5 rounded-[0_100%_0_100%] opacity-90"
          style={{ left: p.x + "%", background: p.cor, animationDuration: p.giro + "s" }}
        />
      </span>
    ));
  }
  return CONFETE.map((c, k) => (
    <span key={k} className="animate-hero-cair absolute inset-0" style={{ animationDuration: c.dur + "s", animationDelay: c.atraso + "s" }}>
      <i
        className={`animate-hero-rodopio absolute top-0 block ${c.largo ? "h-1.5 w-2" : "h-2.5 w-1"}`}
        style={{ left: c.x + "%", background: c.cor, animationDuration: c.giro + "s" }}
      />
    </span>
  ));
}

/* Fogos de Réveillon: estouros no céu da direita, um de cada vez. */
const FOGOS = [
  // O painel de aniversariantes costuma ocupar o canto direito: os fogos ficam entre ele e o véu do texto.
  { right: 33, top: 0, tam: 78, cor: "#FFD166", atraso: 0 },
  { right: 45, top: 2, tam: 64, cor: "#FF5A5F", atraso: -1.1 },
  { right: 38, top: 22, tam: 56, cor: "#4ADE80", atraso: -2.3 },
  { right: 4, top: 0, tam: 84, cor: "#93C5FD", atraso: -3.2 },
];
const RAIOS = Array.from({ length: 14 }, (_, k) => {
  const a = (k / 14) * Math.PI * 2;
  return {
    x1: casas(Math.cos(a) * 12),
    y1: casas(Math.sin(a) * 12),
    x2: casas(Math.cos(a) * 40),
    y2: casas(Math.sin(a) * 40),
    cx: casas(Math.cos(a) * 45),
    cy: casas(Math.sin(a) * 45),
  };
});

const ORBE = "right 1.6s cubic-bezier(.4,0,.2,1), top 1.6s cubic-bezier(.4,0,.2,1), width 1.6s cubic-bezier(.4,0,.2,1), opacity 1s ease";

/**
 * Fundo animado do herocard: aurora, estrelas, sol, lua na fase do dia, névoa, skyline de obra, os
 * temas de época (`epoca.ts`), os fogos de Réveillon, o laço do mês de campanha e o confete do dia
 * da pessoa. Só desenha — as contas são de `modules/dashboard/hero/ceu.ts`.
 */
export function HeroSky({
  ceu,
  faseLua,
  tema,
  fogos,
  campanha,
  festa,
}: {
  ceu: Ceu;
  faseLua: number;
  tema: TemaDaEpoca;
  /** Réveillon: aparecem só à noite. */
  fogos: boolean;
  campanha: Campanha | null;
  /** O dia é da pessoa (aniversário ou ano de casa): confete. */
  festa: boolean;
}) {
  const manchas = [
    { cor: ceu.aurora[0], cls: "animate-hero-aurora-1", pos: { left: "-10%", top: "-35%", width: "65%", height: "120%" } },
    { cor: ceu.aurora[1], cls: "animate-hero-aurora-2", pos: { left: "35%", top: "-20%", width: "60%", height: "110%" } },
    { cor: ceu.aurora[2], cls: "animate-hero-aurora-3", pos: { left: "15%", top: "30%", width: "70%", height: "110%" } },
  ];
  // À noite a aurora fica mais viva; de dia, um véu leve.
  const alfaAurora = lerp(0.75, 0.5, ceu.claridade);
  const lua = caminhoDaLua(faseLua);

  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{ background: ceu.gradiente, transition: "background 1.5s linear" }}
      aria-hidden
    >
      {manchas.map((m, k) => (
        <div
          key={k}
          className={`absolute rounded-full will-change-transform ${m.cls}`}
          style={{
            ...m.pos,
            background: `radial-gradient(closest-side, ${comAlfa(m.cor, alfaAurora)} 0%, ${comAlfa(m.cor, 0)} 100%)`,
            transition: "background 1.5s linear",
          }}
        />
      ))}

      {/* Estrelas + estrela cadente */}
      <div className="absolute inset-0" style={{ opacity: ceu.estrelas, transition: "opacity 1.5s ease" }}>
        {ESTRELAS.map((e, i) => (
          <span
            key={i}
            className="animate-twinkle absolute rounded-full bg-white"
            style={
              {
                left: e.x + "%",
                top: e.y + "%",
                width: e.tamanho,
                height: e.tamanho,
                boxShadow: "0 0 4px rgba(255,255,255,.6)",
                "--s": e.o,
                animationDelay: e.atraso + "s",
              } as CSSProperties
            }
          />
        ))}
        <span className="hero-cadente animate-hero-cadente" style={{ left: "58%", top: "8%" }} />
        <span className="hero-cadente animate-hero-cadente" style={{ left: "80%", top: "4%", animationDelay: "-7s" }} />
      </div>

      {/* Sol — núcleo suave com halo que respira */}
      <div
        className="absolute aspect-square"
        style={{ right: ceu.solDireita + "%", top: ceu.solTopo + "%", width: ceu.solTamanho, opacity: ceu.solOpacidade, transition: ORBE }}
      >
        <span
          className="animate-sunglow absolute rounded-full"
          style={{
            inset: `${-90 - ceu.solBrilho * 40}%`,
            background: `radial-gradient(circle, ${comAlfa(ceu.solHalo, 0.55)} 0%, ${comAlfa(ceu.solHalo, 0.18)} 35%, ${comAlfa(ceu.solHalo, 0)} 70%)`,
          }}
        />
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 40% 38%, #FFFFFF 0%, ${ceu.solNucleo} 55%, ${comAlfa(ceu.solNucleo, 0.85)} 100%)`,
            boxShadow: `0 0 ${18 + ceu.solBrilho * 22}px ${comAlfa(ceu.solHalo, 0.7)}`,
          }}
        />
      </div>

      {/* Lua na fase do dia (hemisfério sul) */}
      <div
        className="absolute aspect-square"
        style={{ right: ceu.luaDireita + "%", top: ceu.luaTopo + "%", width: ceu.luaTamanho, opacity: ceu.luaOpacidade, transition: ORBE }}
      >
        <span
          className="absolute rounded-full"
          style={{
            inset: "-70%",
            background: "radial-gradient(circle, rgba(220,230,255,.22) 0%, rgba(220,230,255,0) 62%)",
            opacity: 0.3 + 0.7 * iluminacaoDaLua(faseLua),
          }}
        />
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" style={{ filter: "drop-shadow(0 0 6px rgba(255,250,225,.45))" }}>
          <defs>
            <radialGradient id="hero-lua" cx="40%" cy="40%" r="65%">
              <stop offset="0" stopColor="#FFFDF2" />
              <stop offset=".7" stopColor="#EDE8D2" />
              <stop offset="1" stopColor="#D9D2B8" />
            </radialGradient>
          </defs>
          <circle cx={50} cy={50} r={50} fill="rgba(220,226,240,.07)" />
          <path d={lua.d} fill="url(#hero-lua)" transform={lua.espelho ? "translate(100 0) scale(-1 1)" : undefined} />
        </svg>
      </div>

      {/* Réveillon: fogos só à noite */}
      {fogos && (
        <div className="absolute inset-0" style={{ opacity: ceu.noite, transition: "opacity 1.5s ease" }}>
          {FOGOS.map((f, k) => (
            <svg
              key={k}
              viewBox="-50 -50 100 100"
              className="animate-hero-fogo absolute overflow-visible"
              style={{ right: f.right + "%", top: f.top + "%", width: f.tam, height: f.tam, animationDelay: f.atraso + "s", filter: `drop-shadow(0 0 4px ${f.cor})` }}
            >
              {RAIOS.map((r, j) => (
                <g key={j}>
                  <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={f.cor} strokeWidth={1.6} strokeLinecap="round" />
                  <circle cx={r.cx} cy={r.cy} r={2.2} fill={f.cor} />
                </g>
              ))}
            </svg>
          ))}
        </div>
      )}

      {/* Carnaval: serpentinas penduradas no alto */}
      {tema === "carnaval" && (
        <svg
          className="pointer-events-none absolute top-0 right-0 h-16 w-[70%] sm:w-[62%]"
          viewBox="0 0 660 64"
          preserveAspectRatio="xMaxYMin slice"
          aria-hidden
        >
          {SERPENTINAS.map((sp, k) => (
            <path
              key={k}
              className="animate-hero-balanco"
              style={{ animationDelay: sp.atraso + "s" }}
              d={sp.d}
              fill="none"
              stroke={sp.cor}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}

      {/* São João: bandeirinhas no alto */}
      {tema === "junino" && (
        <svg
          className="pointer-events-none absolute top-0 right-0 h-[46px] w-[70%] sm:w-[62%]"
          viewBox="0 0 700 46"
          preserveAspectRatio="xMaxYMin slice"
          aria-hidden
        >
          {VARAIS.map((v, k) => (
            <g key={k}>
              <path d={v.corda} fill="none" stroke="rgba(60,40,20,.55)" strokeWidth={1} />
              {v.bandeiras.map((b, j) => (
                <path key={j} className="animate-hero-balanco" style={{ animationDelay: b.atraso + "s" }} d={b.d} fill={b.cor} />
              ))}
            </g>
          ))}
        </svg>
      )}

      {/* Névoa */}
      {NEVOAS.map((n, k) => (
        <div
          key={k}
          className="absolute animate-hero-nevoa will-change-transform"
          style={{
            left: n.left,
            top: n.top,
            width: n.w,
            height: n.h,
            background: `radial-gradient(closest-side, ${comAlfa(ceu.nevoa, n.alfa)} 0%, ${comAlfa(ceu.nevoa, 0)} 100%)`,
            animationDuration: n.dur + "s",
            animationDelay: n.atraso + "s",
            transition: "background 1.5s linear",
          }}
        />
      ))}

      <Skyline ceu={ceu} tema={tema} campanha={campanha} />

      {/* Confete (festa da pessoa, Carnaval) e pétalas (Dia da Mulher) */}
      {(festa || tema === "carnaval" || tema === "mulher") && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {(festa || tema === "carnaval") && <Chuva tipo="confete" />}
          {tema === "mulher" && <Chuva tipo="petalas" />}
        </div>
      )}

      {/* Bruma da noite no pé do card */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(0deg, rgba(28,45,88,.55) 0%, transparent 40%)", opacity: ceu.noite, transition: "opacity 1.5s ease" }}
      />

      {/* Granulado */}
      <div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ backgroundImage: GRAO, opacity: 0.18 }} />

      {/* Véu de leitura atrás do texto: branco de dia, azul-noite à noite */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${ceu.veu} 0%, ${ceu.veu} 22%, ${ceu.veuMeio} 45%, transparent 68%)`,
          transition: "background 1.5s linear",
        }}
      />
    </div>
  );
}
