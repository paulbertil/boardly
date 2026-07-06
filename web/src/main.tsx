import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import './index.css'
import './App.css'
import { AuthProvider } from './auth/AuthProvider'
import { router } from './router'

// AuthProvider sits ABOVE the router: it does async session work (Supabase
// detectSessionInUrl on the OAuth return) that the router's guards may read.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
