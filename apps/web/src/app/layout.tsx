import { IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/lib/providers";
import { ToastContainer } from "@/components/ui/Toast";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

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
    <html lang="tr" className={`${ibmPlexSans.variable} scroll-smooth`}>
      <body className="font-sans relative text-slate-900 bg-white selection:bg-blue-50 selection:text-blue-900">
        <main id="main-content" role="main">
          <Providers>{children}</Providers>
          <ToastContainer />
        </main>
      </body>
    </html>
  );
}
