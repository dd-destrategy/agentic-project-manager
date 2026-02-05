import { AgentStatus } from '@/components/agent-status';
import { ActivityFeed } from '@/components/activity-feed';
import { ProjectCards } from '@/components/project-cards';
import { EscalationBanner } from '@/components/escalation-banner';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mission Control</h1>
        <AgentStatus />
      </div>

      <EscalationBanner />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProjectCards />
        </div>
        <div>
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
