import { useEffect } from 'react'
import type { AppRoute } from '../lib/routing'
import { trackPageVisit } from '../lib/analytics/visits'

export function usePageVisitTracker(route: AppRoute): void {
  useEffect(() => {
    void trackPageVisit(route)
  }, [route])
}
