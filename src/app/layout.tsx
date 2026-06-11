import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Red_Hat_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
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
  title: {
    default: "SenaHub",
    template: "%s · SenaHub",
  },
  description: "Plataforma de gestão integrada — engenharia BIM",
  robots: { index: false, follow: false },
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
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${schibstedGrotesk.variable} ${redHatMono.variable} brand-backdrop antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
