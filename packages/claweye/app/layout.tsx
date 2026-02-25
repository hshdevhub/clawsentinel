import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClawEye — Security Dashboard',
  description: 'Real-time security monitoring for ClawSentinel',
  robots: 'noindex, nofollow',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="bg-claw-bg text-claw-text antialiased h-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
