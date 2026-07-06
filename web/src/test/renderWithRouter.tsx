// Test helper: mount the real route tree over an in-memory history at a given URL.
// Every route-level test drives the app exactly as the browser would — the same
// guards, redirects, and search-param (de)serialization run.

import { RouterProvider, createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { AuthProvider } from '../auth/AuthProvider'
import { createAppRouter } from '../router'

export function renderWithRouter(initialPath = '/') {
  const history = createMemoryHistory({ initialEntries: [initialPath] })
  const router = createAppRouter(history)
  const utils = render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return { router, history, ...utils }
}
