import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RootLayout } from './components/layout/RootLayout';
import { HomePage } from './components/pages/HomePage';
import { LeaderboardPage } from './components/pages/LeaderboardPage';
import { AgentHubPage } from './components/pages/AgentHubPage';
import { StatsPage } from './components/pages/StatsPage';
import { DeployPage } from './components/pages/DeployPage';
import { ContractDetailPage } from './components/pages/ContractDetailPage';

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
        { path: 'trader/deploy', element: <DeployPage /> },
        { path: 'trader/:id', element: <ContractDetailPage /> },
      ],
    },
  ],
  { basename: '/v2' },
);

export function App() {
  return <RouterProvider router={router} />;
}
