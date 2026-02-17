// /Users/alphabetagamma/work/APP/household_account_book/src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import Header from "@/components/layout/Header";
import ShortcutProvider from "@/components/providers/ShortcutProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "収支管理アプリ",
  description: "Next.jsとFirebaseで作成した家計簿アプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HABook",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} min-h-screen bg-gray-50 flex flex-col`}>
        <AuthProvider>
          <ShortcutProvider>
            <Header />
            <div className="w-full max-w-screen-2xl mx-auto p-4 md:p-8 lg:p-12 flex-grow">
              {children}
            </div>
          </ShortcutProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
