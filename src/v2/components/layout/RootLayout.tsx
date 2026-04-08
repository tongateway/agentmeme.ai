import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Toaster } from '@/v2/components/ui/sonner';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container max-w-screen-2xl px-4 py-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
