// /Users/alphabetagamma/work/APP/household_account_book/src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import Header from "@/components/layout/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "収支管理アプリ",
  description: "Next.jsとFirebaseで作成した家計簿アプリ",
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
          <Header />
          <div className="w-full max-w-screen-2xl mx-auto p-4 md:p-8 lg:p-12 flex-grow">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
