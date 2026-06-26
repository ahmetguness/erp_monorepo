import { Providers } from "@/lib/providers";
import { ToastContainer } from "@/components/ui/Toast";
import "./globals.css";

export const metadata = {
  title: "Axon ERP | Profesyonel Kurumsal İş Yönetim Yazılımı",
  description: "İşletmenizi dijitalleştiren, uçtan uca yönetim sağlayan güvenilir ERP çözümü. Muhasebe, stok, CRM ve İK süreçlerinizi profesyonelce yönetin.",
  icons: {
    icon: "/icon.png",
  },
  robots: "index, follow",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" data-scroll-behavior="smooth" className="scroll-smooth">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="font-sans relative text-slate-900 bg-white selection:bg-blue-50 selection:text-blue-900">
        <main id="main-content" role="main">
          <Providers>{children}</Providers>
          <ToastContainer />
        </main>
      </body>
    </html>
  );
}
