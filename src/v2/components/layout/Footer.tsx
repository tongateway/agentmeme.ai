import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-6 mt-auto">
      <div className="mx-auto w-full max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          Build on TON
          <svg viewBox="0 0 56 56" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M28 56C43.4639 56 56 43.4639 56 28C56 12.5361 43.4639 0 28 0C12.5361 0 0 12.5361 0 28C0 43.4639 12.5361 56 28 56ZM17.0375 15.75H38.9625C39.675 15.75 40.386 15.9453 41.0125 16.3375C41.7063 16.7672 42.2359 17.4062 42.525 18.1625C42.8016 18.8844 42.8797 19.6766 42.7375 20.4375C42.6 21.1953 42.2531 21.9047 41.7375 22.4875L29.5125 36.4375C29.2203 36.768 28.8609 37.0328 28.4578 37.2141C28.0547 37.3953 27.6188 37.4891 27.1781 37.4891C26.7375 37.4891 26.3016 37.3953 25.8984 37.2141C25.4953 37.0328 25.136 36.768 24.8438 36.4375L12.625 22.4875C12.1094 21.9047 11.7625 21.1953 11.625 20.4375C11.4828 19.6766 11.5609 18.8844 11.8375 18.1625C12.1266 17.4062 12.6562 16.7672 13.35 16.3375C13.9766 15.9453 14.6875 15.75 15.4 15.75H17.0375ZM25.8562 19.425H15.8688C15.7203 19.4234 15.575 19.4656 15.45 19.5469C15.325 19.6281 15.225 19.7453 15.1625 19.8828C15.1047 20.0266 15.0875 20.1844 15.1141 20.3375C15.1406 20.4906 15.2094 20.6328 15.3125 20.75L25.8562 32.7875V19.425ZM30.1437 19.425V32.7875L40.6875 20.75C40.7906 20.6328 40.8594 20.4906 40.8859 20.3375C40.9125 20.1844 40.8953 20.0266 40.8375 19.8828C40.775 19.7453 40.675 19.6281 40.55 19.5469C40.425 19.4656 40.2797 19.4234 40.1312 19.425H30.1437Z" />
          </svg>
        </span>
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
