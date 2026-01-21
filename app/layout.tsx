import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@fontsource/press-start-2p";
import "./globals.css";
import { MenuNav } from "./components/MenuNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meebits Runway by Shawn T. Art",
  description: "Pick any Meebit you want and send them down the runway—this is your street-lit fashion show.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-end px-6 sm:px-10">
            <div className="pointer-events-auto">
              <MenuNav />
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
