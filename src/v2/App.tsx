import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RootLayout } from './components/layout/RootLayout';
import { HomePage } from './components/pages/HomePage';
import { LeaderboardPage } from './components/pages/LeaderboardPage';
import { AgentHubPage } from './components/pages/AgentHubPage';
import { StatsPage } from './components/pages/StatsPage';
import { DeployPage } from './components/pages/DeployPage';
import { ContractDetailPage } from './components/pages/ContractDetailPage';
import { StatusPage } from './components/pages/StatusPage';
import { DocsPage } from './components/pages/DocsPage';

const router = createBrowserRouter([
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
      { path: 'trader/deploy', element: <DeployPage /> },
      { path: 'trader/:id', element: <ContractDetailPage /> },
      { path: 'status', element: <StatusPage /> },
      { path: 'docs', element: <DocsPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
