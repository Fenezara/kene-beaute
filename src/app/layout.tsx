import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";

// Typographie Kènè: Fraunces (serif éditorial chaleureux) pour l'identité,
// Plus Jakarta Sans (sans moderne très lisible) pour le corps de texte.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kènè — La beauté mélanoderme, enfin comprise.",
  description:
    "Plateforme beauté et bien-être panafricaine : diagnostic de peau par IA calibrée peaux mélanodermes, instituts partenaires, boutique cosmétique aux botaniques africains, et gestion complète d'institut (RDV, caisse, paie CNPS/IPM, compta SYSCOHADA).",
  keywords: ["Kènè", "beauté", "mélanoderme", "peau noire", "diagnostic IA", "institut", "Afrique", "Wave", "Orange Money", "CNPS", "SYSCOHADA"],
  authors: [{ name: "Kènè" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kènè",
  },
  icons: {
    icon: [
      { url: "/kene-mark.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  // Sceau Kènè — identité visuelle des partages réseaux sociaux
  openGraph: {
    title: "Kènè — La beauté mélanoderme, enfin comprise.",
    description:
      "Diagnostic de peau par IA calibrée peaux mélanodermes, instituts partenaires, boutique aux botaniques africains.",
    type: "website",
    locale: "fr_FR",
    siteName: "Kènè",
    images: [
      {
        url: "/brand/kene-emblem-light.png",
        width: 512,
        height: 512,
        alt: "Le Sceau Kènè — portrait aux ors antiques et peigne Duafe",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Kènè — La beauté mélanoderme, enfin comprise.",
    images: ["/brand/kene-emblem-light.png"],
  },
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
        className={`${fraunces.variable} ${jakarta.variable} ${plexMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
