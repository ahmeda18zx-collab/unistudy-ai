import { useEffect, useMemo } from 'react'
import { RouterProvider, createHashRouter } from 'react-router-dom'
import { routes } from './routes'
import { syncService } from '../services/syncService'

export function App() {
  const router = useMemo(() => createHashRouter(routes), [])

  // Pull shared content updates on start, when the tab regains focus, and when the connection returns
  useEffect(() => {
    const run = () => void syncService.sync()
    run()
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') run()
    })
    return () => window.removeEventListener('online', run)
  }, [])
  return <RouterProvider router={router} />
}
