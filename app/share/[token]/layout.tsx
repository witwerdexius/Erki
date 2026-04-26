import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ErKi – Geteilte Planung",
  description: "Planung für die Erstkommunion",
  openGraph: {
    title: "ErKi – Geteilte Planung",
    description: "Planung für die Erstkommunion",
    url: "https://erki.vercel.app",
    siteName: "ErKi",
  },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
