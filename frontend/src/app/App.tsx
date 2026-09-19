import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from '../auth/AuthProvider';
import { AppRoutes } from './AppRoutes';
import { createSentinelQueryClient } from './query-client';
import { RouteFocusManager } from './RouteFocusManager';

export function App() {
  const [queryClient] = useState(createSentinelQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <RouteFocusManager />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
