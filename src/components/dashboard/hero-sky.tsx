"use client";

import { useMemo, type CSSProperties } from "react";

/* ── Sky model helpers ────────────────────────────────────── */
function hexToRgb(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb: number[]): string {
  return "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a),
    rb = hexToRgb(b);
  return rgbToHex(ra.map((v, i) => lerp(v, rb[i], t)));
}

const SKY_KEYS = [
  { h: 0, g: ["#050817", "#0E1A36", "#152348", "#1C2D58"] },
  { h: 5, g: ["#1C2D58", "#6B3D5E", "#C97968", "#F5C18F"] },
  { h: 7, g: ["#4A8FC8", "#7AB6E0", "#A8D0E8", "#C2DDF0"] },
  { h: 12, g: ["#2D7CB8", "#5BA0D8", "#80BBE0", "#9BCBE8"] },
  { h: 16, g: ["#4F8BB8", "#9FB3C0", "#D8C8A8", "#F2C898"] },
  { h: 17, g: ["#2A1D4E", "#7B3D5E", "#C8543A", "#F5A85E"] },
  { h: 18.3, g: ["#0A0E2E", "#1A1D3E", "#1A2545", "#1C2D58"] },
  { h: 24, g: ["#050817", "#0E1A36", "#152348", "#1C2D58"] },
];

export function computeSky(hour: number) {
  const h = ((hour % 24) + 24) % 24;

  let i = 0;
  while (i < SKY_KEYS.length - 1 && SKY_KEYS[i + 1].h <= h) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1] ?? SKY_KEYS[0];
  const span = b.h - a.h || 1;
  const t = Math.min(1, Math.max(0, (h - a.h) / span));
  const c = a.g.map((s, j) => lerpHex(s, b.g[j], t));
  const gradient = `linear-gradient(160deg, ${c[0]} 0%, ${c[1]} 40%, ${c[2]} 72%, ${c[3]} 100%)`;

  // Sun arc 5h→18h
  const sunUp = h >= 5 && h <= 18;
  const tSun = sunUp ? (h - 5) / 13 : 0;
  const sunArc = Math.sin(Math.PI * tSun);
  const sunRight = 8 + (1 - tSun) * 75;
  const sunTop = 56 - sunArc * 46;
  const sunSize = 44 + (1 - sunArc) * 28;
  const sunCore = lerpHex("#F5A85E", "#FFFAD8", sunArc);
  const sunHalo = lerpHex("#F5A85E", "#FFEEBB", sunArc);
  const sunGlow = sunArc;
  let sunOpacity = 0;
  if (sunUp) {
    if (h < 5.4) sunOpacity = (h - 5) / 0.4;
    else if (h > 17.6) sunOpacity = (18 - h) / 0.4;
    else sunOpacity = 1;
  }

  // Moon arc 18h→6h
  let moonH = -1;
  if (h >= 18) moonH = h - 18;
  else if (h <= 6) moonH = h + 6;
  const moonUp = moonH >= 0;
  const tMoon = moonUp ? moonH / 12 : 0;
  const moonArc = Math.sin(Math.PI * tMoon);
  const moonRight = 12 + (1 - tMoon) * 70;
  const moonTop = 40 - moonArc * 30;
  const moonSize = 48 + (1 - moonArc) * 12;
  let moonOpacity = 0;
  if (moonUp) {
    if (moonH < 0.6) moonOpacity = moonH / 0.6;
    else if (moonH > 11.4) moonOpacity = (12 - moonH) / 0.6;
    else moonOpacity = 1;
  }

  // Stars — full at night, fade at dawn/dusk
  let starOpacity: number;
  if (h < 4.5 || h > 19) starOpacity = 1;
  else if (h < 6) starOpacity = (6 - h) / 1.5;
  else if (h > 18) starOpacity = (h - 18) / 1;
  else starOpacity = 0;
  starOpacity = Math.max(0, Math.min(1, starOpacity));

  // Cloud tint
  let cloudTint: string;
  if (h < 4) cloudTint = "#2A1D4E";
  else if (h < 7) cloudTint = lerpHex("#2A1D4E", "#FFE8C8", (h - 4) / 3);
  else if (h < 16) cloudTint = "#FFFFFF";
  else if (h < 17) cloudTint = lerpHex("#FFFFFF", "#FFD89A", h - 16);
  else if (h < 18) cloudTint = lerpHex("#FFD89A", "#C8543A", h - 17);
  else if (h < 20) cloudTint = lerpHex("#C8543A", "#2A1D4E", (h - 18) / 2);
  else cloudTint = "#2A1D4E";

  const hazeOpacity = Math.min(1, h < 5 || h > 19 ? 1 : h < 6 ? 6 - h : h > 18 ? h - 18 : 0);

  // Text-area backdrop: interpolates between dark-navy (night) and white (day)
  // so text colors can adapt purely by time — independent of the CSS theme.
  const brightness = Math.max(
    0,
    Math.min(1, h < 5.5 ? 0 : h < 7 ? (h - 5.5) / 1.5 : h < 17 ? 1 : h < 18.5 ? 1 - (h - 17) / 1.5 : 0),
  );
  const fadeR = Math.round(8 + brightness * (255 - 8));
  const fadeG = Math.round(14 + brightness * (255 - 14));
  const fadeB = Math.round(38 + brightness * (255 - 38));
  const textFadeColor = `rgba(${fadeR},${fadeG},${fadeB},0.88)`;
  const textFadeColorMid = `rgba(${fadeR},${fadeG},${fadeB},0.50)`;
  const textIsLight = brightness > 0.5;

  return {
    gradient,
    sunRight,
    sunTop,
    sunSize,
    sunCore,
    sunHalo,
    sunGlow,
    sunOpacity,
    moonRight,
    moonTop,
    moonSize,
    moonOpacity,
    starOpacity,
    cloudTint,
    hazeOpacity,
    textFadeColor,
    textFadeColorMid,
    textIsLight,
  };
}

export function getTodLabel(h: number): string {
  if (h < 5) return "Noite";
  if (h < 7) return "Madrugada";
  if (h < 11) return "Manhã";
  if (h < 16) return "Meio-dia";
  if (h < 17) return "Tarde";
  if (h < 18) return "Pôr do sol";
  return "Noite";
}

/* ── Stable star field (seeded PRNG) ─────────────────────── */
const STARS = Array.from({ length: 40 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280;
  const r1 = seed / 233280;
  const r2 = ((seed * 1103515245 + 12345) % 233280) / 233280;
  const r3 = ((seed * 22695477 + 1) % 233280) / 233280;
  return { x: 4 + r1 * 92, y: 4 + r2 * 65, size: 1.2 + r3 * 2.4, o: 0.4 + r3 * 0.6, delay: r2 * 3 };
});

/* ── Cloud shapes ─────────────────────────────────────────── */
const CLOUDS = [
  { kind: "puff" as const, w: 150, opacity: 0.85, left: "8%", top: "30%", dur: 14 },
  { kind: "puff" as const, w: 120, opacity: 0.78, left: "44%", top: "58%", dur: 18 },
  { kind: "wisp" as const, w: 240, opacity: 0.55, left: "0%", top: "78%", dur: 20 },
  { kind: "wisp" as const, w: 200, opacity: 0.55, left: "52%", top: "22%", dur: 16 },
  { kind: "puff" as const, w: 85, opacity: 0.55, left: "30%", top: "44%", dur: 22 },
];

function PuffCloud({ w, opacity, fill, style }: { w: number; opacity: number; fill: string; style?: CSSProperties }) {
  return (
    <svg
      style={{ position: "absolute", width: w, height: w * 0.5, opacity, ...style }}
      viewBox="0 0 120 60"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        fill={fill}
        style={{ transition: "fill 1.5s linear" }}
        d="M18 44 Q8 44 8 36 Q8 28 18 28 Q20 18 32 18 Q40 10 52 16 Q60 8 72 14 Q86 14 90 24 Q102 22 104 32 Q112 34 110 44 Z"
      />
    </svg>
  );
}

function WispCloud({ w, opacity, fill, style }: { w: number; opacity: number; fill: string; style?: CSSProperties }) {
  return (
    <svg
      style={{ position: "absolute", width: w, height: w * 0.18, opacity, ...style }}
      viewBox="0 0 160 30"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        fill={fill}
        style={{ transition: "fill 1.5s linear" }}
        d="M4 18 Q26 8 60 14 Q92 6 124 14 Q146 12 156 18 Q146 22 124 20 Q92 24 60 20 Q26 24 4 18 Z"
      />
    </svg>
  );
}

/* ── HeroSky component ────────────────────────────────────── */
export function HeroSky({ hour }: { hour: number }) {
  const s = useMemo(() => computeSky(hour), [hour]);

  const ORB_TRANS =
    "right 1.6s cubic-bezier(.4,0,.2,1), top 1.6s cubic-bezier(.4,0,.2,1), width 1.6s cubic-bezier(.4,0,.2,1), background 1.5s linear, box-shadow 1.5s linear, opacity 1s ease";
  const MOON_TRANS =
    "right 1.6s cubic-bezier(.4,0,.2,1), top 1.6s cubic-bezier(.4,0,.2,1), width 1.6s cubic-bezier(.4,0,.2,1), opacity 1.2s ease";

  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{ background: s.gradient, transition: "background 1.5s linear" }}
      aria-hidden
    >
      {/* Sun */}
      <div
        style={{
          position: "absolute",
          right: s.sunRight + "%",
          top: s.sunTop + "%",
          width: s.sunSize,
          aspectRatio: "1",
          borderRadius: "50%",
          background: s.sunCore,
          boxShadow: `0 0 ${30 + s.sunGlow * 30}px ${10 + s.sunGlow * 10}px ${s.sunHalo}80`,
          opacity: s.sunOpacity,
          transition: ORB_TRANS,
        }}
      >
        <span
          className="animate-sunglow"
          style={{
            position: "absolute",
            inset: "-50%",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${s.sunHalo}AA 0%, ${s.sunHalo}00 65%)`,
            transition: "background 1.5s linear",
          }}
        />
      </div>

      {/* Moon */}
      <div
        style={{
          position: "absolute",
          right: s.moonRight + "%",
          top: s.moonTop + "%",
          width: s.moonSize,
          aspectRatio: "1",
          opacity: s.moonOpacity,
          transition: MOON_TRANS,
        }}
      >
        <span style={{ position: "absolute", inset: "-40%", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.18) 0%, transparent 65%)" }} />
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#F4F0DC", boxShadow: "inset -8px -4px 0 rgba(0,0,0,.05)" }} />
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 12px -2px 0 -2px #0E1A36" }} />
      </div>

      {/* Stars */}
      <div style={{ position: "absolute", inset: 0, opacity: s.starOpacity, transition: "opacity 1.5s ease" }}>
        {STARS.map((st, i) => (
          <span
            key={i}
            className="animate-twinkle"
            style={
              {
                position: "absolute",
                left: st.x + "%",
                top: st.y + "%",
                width: st.size,
                height: st.size,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 0 4px rgba(255,255,255,.6)",
                "--s": st.o,
                animationDelay: st.delay + "s",
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* Clouds */}
      {CLOUDS.map((c, i) =>
        c.kind === "puff" ? (
          <PuffCloud key={i} w={c.w} opacity={c.opacity} fill={s.cloudTint} style={{ left: c.left, top: c.top, animation: `drift ${c.dur}s ease-in-out infinite alternate` }} />
        ) : (
          <WispCloud key={i} w={c.w} opacity={c.opacity} fill={s.cloudTint} style={{ left: c.left, top: c.top, animation: `drift ${c.dur}s ease-in-out infinite alternate` }} />
        ),
      )}

      {/* Night haze */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "linear-gradient(0deg, rgba(28,45,88,.7) 0%, transparent 45%)",
          opacity: s.hazeOpacity,
          transition: "opacity 1.5s ease",
        }}
      />

      {/* Text-readability fade — time-aware: white at day, dark navy at night */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, ${s.textFadeColor} 0%, ${s.textFadeColor} 22%, ${s.textFadeColorMid} 45%, transparent 68%)`,
          transition: "background 1.5s linear",
        }}
      />
    </div>
  );
}
