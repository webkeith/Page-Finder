import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Page Finder',
  description: 'Find which page of a site contains the text or form you were asked to change.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
