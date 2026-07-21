import { useCallback, useEffect, useState } from 'react'
import { fetchPlanksEnabled, setPlanksEnabledRemote } from '../lib/featureFlags'

export function useFeatureFlags() {
  const [planksEnabled, setPlanksEnabledState] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchPlanksEnabled().then((enabled) => {
      if (!cancelled) {
        setPlanksEnabledState(enabled)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setPlanksEnabled = useCallback(async (enabled: boolean) => {
    await setPlanksEnabledRemote(enabled)
    setPlanksEnabledState(enabled)
  }, [])

  return { planksEnabled, setPlanksEnabled, loading }
}
