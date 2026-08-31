import type { Metadata, Viewport } from "next";
import { Ojuju, Questrial, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";

const ojuju = Ojuju({
  variable: "--font-ojuju",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

const questrial = Questrial({
  variable: "--font-questrial",
  subsets: ["latin"],
  weight: "400",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kènè — La beauté mélanoderme, de A à Z.",
  description:
    "Plateforme beauté et bien-être panafricaine : diagnostic de peau par IA calibrée peaux mélanodermes, instituts partenaires, boutique cosmétique aux botaniques africains, et gestion complète d'institut (RDV, caisse, paie CNPS/IPM, compta SYSCOHADA).",
  keywords: ["Kènè", "beauté", "mélanoderme", "peau noire", "diagnostic IA", "institut", "Afrique", "Wave", "Orange Money", "CNPS", "SYSCOHADA"],
  authors: [{ name: "Kènè" }],
  icons: { icon: "/kene-logo.svg" },
};

export const viewport: Viewport = {
  themeColor: "#C8951E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${ojuju.variable} ${questrial.variable} ${plexMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
