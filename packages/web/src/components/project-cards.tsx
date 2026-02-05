'use client';

/**
 * Project cards component
 *
 * Shows summary cards for active projects.
 */
export function ProjectCards() {
  // TODO: Implement with TanStack Query in Sprint 5
  const projects: Array<{
    id: string;
    name: string;
    status: string;
    autonomyLevel: string;
    healthStatus: string;
    pendingEscalations: number;
  }> = [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Projects</h2>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <h3 className="font-medium">No projects yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect to Jira to start monitoring your first project
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <div key={project.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{project.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {project.autonomyLevel} mode
                  </p>
                </div>
                <StatusBadge status={project.healthStatus} />
              </div>

              {project.pendingEscalations > 0 && (
                <div className="mt-4 rounded bg-yellow-50 p-2 text-sm text-yellow-800">
                  {project.pendingEscalations} pending escalation(s)
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    healthy: { label: 'Healthy', className: 'bg-green-100 text-green-800' },
    warning: { label: 'Warning', className: 'bg-yellow-100 text-yellow-800' },
    error: { label: 'Error', className: 'bg-red-100 text-red-800' },
  };

  const { label, className } = config[status as keyof typeof config] ?? config.healthy;

  return (
    <span className={`rounded-full px-2 py-1 text-xs ${className}`}>
      {label}
    </span>
  );
}
