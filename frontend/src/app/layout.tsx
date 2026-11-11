import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Shell } from '@/components/layout/shell';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'YottaFlex Customer Intelligence',
  description: 'Customer segmentation, next-best-action recommendations and consent-aware execution',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
