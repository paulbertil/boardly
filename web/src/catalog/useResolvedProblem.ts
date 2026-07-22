// Resolve a lit-problem id against the offline catalog cache (mirrors
// useActiveQueueProblems). Null while unresolved or when nothing is lit — a
// co-member may have lit a climb this device hasn't synced yet.

import { useEffect, useState } from 'react'
import { getCatalogProblemsByIds, type CatalogProblem } from './catalogSync'

export function useResolvedProblem(problemId: string | null): CatalogProblem | null {
  const [problem, setProblem] = useState<CatalogProblem | null>(null)
  useEffect(() => {
    let cancelled = false
    setProblem(null)
    if (!problemId) return
    void getCatalogProblemsByIds([problemId]).then((m) => {
      if (!cancelled) setProblem(m.get(problemId) ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [problemId])
  return problem
}
