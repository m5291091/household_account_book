// /Users/alphabetagamma/work/APP/household_account_book/src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Header from "@/components/layout/Header";
import ShortcutProvider from "@/components/providers/ShortcutProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "収支管理アプリ",
  description: "Next.jsとFirebaseで作成した家計簿アプリ",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
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
      <body className={`${inter.className} min-h-screen bg-gray-50 dark:bg-gray-900 dark:bg-gray-900 dark:text-gray-100 flex flex-col`}>
        <AuthProvider>
          <ThemeProvider>
            <ShortcutProvider>
              <Header />
              <div className="w-full max-w-screen-2xl mx-auto p-4 md:p-8 lg:p-12 flex-grow">
                {children}
              </div>
            </ShortcutProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
