import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RootLayout } from './components/layout/RootLayout';
import { HomePage } from './components/pages/HomePage';
import { LeaderboardPage } from './components/pages/LeaderboardPage';
import { AgentHubPage } from './components/pages/AgentHubPage';
import { StatsPage } from './components/pages/StatsPage';

function PlaceholderPage({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-xl text-muted-foreground">
      {name} — coming soon
    </div>
  );
}

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'leaderboard', element: <LeaderboardPage /> },
        { path: 'stats', element: <StatsPage /> },
        { path: 'stats/:pair', element: <StatsPage /> },
        { path: 'agent-hub', element: <AgentHubPage /> },
        { path: 'agent-hub/:token', element: <AgentHubPage /> },
        { path: 'trader/deploy', element: <PlaceholderPage name="Deploy" /> },
        { path: 'trader/:id', element: <PlaceholderPage name="Contract Detail" /> },
      ],
    },
  ],
  { basename: '/v2' },
);

export function App() {
  return <RouterProvider router={router} />;
}
