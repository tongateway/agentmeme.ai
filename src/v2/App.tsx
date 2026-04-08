import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <div className="flex min-h-screen items-center justify-center">
          <h1 className="text-2xl font-semibold">v2 works!</h1>
        </div>
      ),
    },
  ],
  { basename: '/v2' },
);

export default function App() {
  return <RouterProvider router={router} />;
}
