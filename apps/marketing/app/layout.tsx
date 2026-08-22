import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tripatlas.schultheiss-j.chatgpt.site"),
  title: "Tripatlas — Deine Tesla-Reisen unter deiner Kontrolle",
  description:
    "Plane Roadtrips, dokumentiere Fahrten automatisch und erlebe deine Tesla-Reisen als visuellen Rückblick – hosted in Deutschland oder self-hosted.",
  applicationName: "Tripatlas",
  icons: [
    { url: "/icon.svg", type: "image/svg+xml" },
    { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
  ],
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "Tripatlas",
    title: "Tripatlas — Deine Tesla-Reisen unter deiner Kontrolle",
    description:
      "Plane Roadtrips, dokumentiere Fahrten automatisch und erlebe deine Reisen als visuellen Rückblick.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Tripatlas — Deine Tesla-Reisen. Unter deiner Kontrolle.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tripatlas — Deine Tesla-Reisen unter deiner Kontrolle",
    description:
      "Plane Roadtrips, dokumentiere Fahrten automatisch und erlebe deine Reisen als visuellen Rückblick.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
