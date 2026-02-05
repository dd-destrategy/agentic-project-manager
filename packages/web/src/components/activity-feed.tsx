'use client';

/**
 * Activity feed component
 *
 * Shows scrolling feed of agent events with infinite scroll.
 */
export function ActivityFeed() {
  // TODO: Implement with TanStack Query in Sprint 5
  const events: Array<{
    id: string;
    type: string;
    summary: string;
    timestamp: string;
  }> = [];

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <h2 className="font-semibold">Recent Activity</h2>
      </div>

      <div className="max-h-96 overflow-auto">
        {events.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <p>No recent activity</p>
            <p className="mt-1">
              Events will appear here when the agent starts running
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {events.map((event) => (
              <div key={event.id} className="p-4">
                <p className="text-sm">{event.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(event.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
