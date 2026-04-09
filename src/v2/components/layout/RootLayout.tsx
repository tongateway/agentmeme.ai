import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { Toaster } from '@/v2/components/ui/sonner';

export function RootLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">
        <Outlet />
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}
