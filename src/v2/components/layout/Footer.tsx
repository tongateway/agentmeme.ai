import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-6 mt-auto">
      <div className="mx-auto w-full max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Build on TON</span>
        <div className="flex items-center gap-4">
          <Link to="/docs" className="hover:text-foreground underline-offset-4 hover:underline">
            Docs
          </Link>
          <a
            href="https://github.com/tongateway/orderbook-protocol"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Orderbook Protocol
          </a>
          <a
            href="https://github.com/tongateway/agentmeme.ai"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            App
          </a>
          <a
            href="https://github.com/tongateway/agentmeme-ai-backend-go"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Backend
          </a>
        </div>
      </div>
    </footer>
  );
}
