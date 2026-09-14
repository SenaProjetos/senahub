import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Red_Hat_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { VisualInspector } from "@/components/dev/visual-inspector";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./globals.css";

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted-grotesk",
  subsets: ["latin"],
});

const redHatMono = Red_Hat_Mono({
  variable: "--font-red-hat-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Base para resolver URLs relativas (og:image). server.ts é um HTTP server customizado, então
  // a origem inferida pelo Next é o bind interno — APP_URL é a origem pública em todo ambiente.
  // `||` (não `??`): APP_URL vazio quebraria `new URL("")`.
  metadataBase: new URL(process.env.APP_URL || "https://hub.senaprojetos.com.br"),
  title: {
    default: "SenaHub",
    template: "%s · SenaHub",
  },
  description: "Plataforma de gestão integrada — engenharia BIM",
  robots: { index: false, follow: false },
  // Card de prévia padrão (WhatsApp, Telegram, Slack). As páginas públicas por token
  // sobrescrevem via `metadataPublica()` — openGraph não é mesclado em profundidade.
  openGraph: {
    siteName: "SenaHub",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "SenaHub" }],
  },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "SenaHub", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      // Favicon transparente que acompanha o tema do navegador (símbolo da marca)
      { url: "/MARCA/logo_light.svg", type: "image/svg+xml", media: "(prefers-color-scheme: light)" },
      { url: "/MARCA/logo_dark.svg", type: "image/svg+xml", media: "(prefers-color-scheme: dark)" },
      // Fallback para navegadores sem suporte a favicon SVG
      { url: "/icons/icon-192.png", type: "image/png" },
    ],
    // iOS espera ícone opaco (mantém o fundo Navy)
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1428",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${schibstedGrotesk.variable} ${redHatMono.variable}`}
    >
      <body className="brand-backdrop antialiased">
        <Providers>
          {children}
          {process.env.NODE_ENV === "development" ? <VisualInspector /> : null}
        </Providers>
      </body>
    </html>
  );
}
