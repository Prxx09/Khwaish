import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./refinements.css";
export const metadata: Metadata = {
  title: "Khwaish — A little space for your next big want",
  description:
    "Save what catches your eye. Build your personal wishlist, dream together in shared libraries, and keep an eye on prices.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16181d",
};
const themeScript = `(function(){try{var t=localStorage.getItem('khwahish:theme')||'dark';document.documentElement.dataset.theme=t;}catch(e){}})()`;
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
