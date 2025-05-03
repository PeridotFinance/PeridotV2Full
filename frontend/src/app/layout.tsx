import { EvmProvider } from '@/providers/EvmProvider';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <EvmProvider>
          {children}
        </EvmProvider>
      </body>
    </html>
  );
} 