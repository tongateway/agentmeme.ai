import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RootLayout } from './components/layout/RootLayout';
import { HomePage } from './components/pages/HomePage';

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
        { path: 'leaderboard', element: <PlaceholderPage name="Leaderboard" /> },
        { path: 'stats', element: <PlaceholderPage name="Stats" /> },
        { path: 'stats/:pair', element: <PlaceholderPage name="Stats" /> },
        { path: 'agent-hub', element: <PlaceholderPage name="Agent Hub" /> },
        { path: 'agent-hub/:token', element: <PlaceholderPage name="Agent Hub" /> },
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
