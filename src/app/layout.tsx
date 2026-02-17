// /Users/alphabetagamma/work/APP/household_account_book/src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

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
      <body className={`${inter.className} min-h-screen bg-gray-50 flex flex-col items-center`}>
        <AuthProvider>
          <div className="w-full max-w-7xl p-6 md:p-12 flex-grow">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
