import type { Metadata } from 'next';
import './globals.css';
import './landing.css';

export const metadata: Metadata = {
  title: 'GLUCOBOSS — Type 1 diabetes, simplified',
  description: 'A clearer, faster way to bring glucose, insulin, food and everyday Type 1 diabetes management together.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
