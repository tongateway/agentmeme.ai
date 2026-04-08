import { Link, useLocation } from 'react-router-dom';
import { TonConnectButton } from '@tonconnect/ui-react';
import { Bot, BarChart3, Layers, Rocket, Menu, Activity } from 'lucide-react';
import { Button } from '@/v2/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/v2/components/ui/sheet';
import { Separator } from '@/v2/components/ui/separator';
import { cn } from '@/v2/lib/utils';

const NAV_LINKS = [
  { to: '/', label: 'Home', icon: Bot },
  { to: '/agent-hub', label: 'Agent Hub', icon: Layers },
  { to: '/stats', label: 'Order Book', icon: BarChart3 },
  { to: '/status', label: 'Status', icon: Activity },
  { to: '/trader/deploy', label: 'My Agents', icon: Rocket },
];

export function Navbar() {
  const location = useLocation();

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  const linkElements = NAV_LINKS.map((link) => (
    <Link
      key={link.to}
      to={link.to}
      className={cn(
        'flex items-center gap-2 text-sm font-medium transition-colors hover:text-foreground',
        isActive(link.to) ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <link.icon className="h-4 w-4" />
      {link.label}
    </Link>
  ));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center px-4">
        <Link to="/" className="mr-6 flex items-center">
          <img src="/logo.png" alt="AgntM" className="h-8 invert" />
        </Link>

        <nav className="hidden md:flex items-center gap-6 flex-1">
          {linkElements}
        </nav>

        <div className="flex items-center gap-3 ml-auto">
          <TonConnectButton />

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <nav className="flex flex-col gap-4 mt-8">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={cn(
                      'flex items-center gap-3 text-sm font-medium transition-colors hover:text-foreground py-2',
                      isActive(link.to) ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                ))}
                <Separator />
                <div className="pt-2">
                  <TonConnectButton />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
