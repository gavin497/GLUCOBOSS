import type { Metadata } from 'next';
import './globals.css';
import './landing.css';

export const metadata: Metadata = {
  title: 'GLUCOBOSS',
  description: 'MDI daily management cockpit for Type 1 diabetes',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
