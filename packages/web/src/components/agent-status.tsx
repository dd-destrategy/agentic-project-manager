'use client';

/**
 * Agent status indicator
 *
 * Shows current agent state: Active, Paused, or Error
 */
export function AgentStatus() {
  // TODO: Implement with TanStack Query in Sprint 5
  const status = 'active';

  const statusConfig = {
    active: {
      label: 'Active',
      className: 'bg-green-100 text-green-800',
      dot: 'bg-green-500',
    },
    paused: {
      label: 'Paused',
      className: 'bg-yellow-100 text-yellow-800',
      dot: 'bg-yellow-500',
    },
    error: {
      label: 'Error',
      className: 'bg-red-100 text-red-800',
      dot: 'bg-red-500',
    },
    starting: {
      label: 'Starting',
      className: 'bg-blue-100 text-blue-800',
      dot: 'bg-blue-500',
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig];

  return (
    <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${config.className}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  );
}
