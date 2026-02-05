/**
 * TanStack Query hooks for data fetching
 *
 * All hooks use 30-second polling interval by default.
 */

export { useAgentStatus, formatLastHeartbeat } from './use-agent-status';
export { useEvents, useInfiniteEvents, formatEventTime } from './use-events';
export { useProjects, getTotalPendingEscalations, formatLastActivity } from './use-projects';
export {
  useArtefacts,
  parseArtefactContent,
  getArtefactByType,
  formatArtefactType,
} from './use-artefacts';
export {
  useActivityStats,
  formatCompactNumber,
  formatChange,
  getChangeClassName,
} from './use-activity-stats';
export {
  useEscalations,
  usePendingEscalations,
  usePendingEscalationCount,
  useEscalation,
  useRecordDecision,
  formatEscalationTime,
  getRiskLevelVariant,
} from './use-escalations';
