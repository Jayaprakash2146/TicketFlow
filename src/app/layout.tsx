import type { Metadata } from "next";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { Navbar, Footer } from "@/components/nav";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "TicketFlow - Book movie and concert tickets",
  description:
    "Book tickets with a live seat map, timed seat holds, automatic waitlist re-assignment and instant QR tickets.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <ToastProvider>
          <div className="flex min-h-screen flex-col">
            <Navbar user={user} />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
