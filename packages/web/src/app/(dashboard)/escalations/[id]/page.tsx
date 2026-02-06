'use client';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  AlertTriangle,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, use } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  useEscalation,
  useRecordDecision,
  formatEscalationTime,
  getRiskLevelVariant,
} from '@/lib/hooks';
import type { EscalationOption } from '@/types';

/**
 * Option card for displaying decision options
 */
function OptionCard({
  option,
  isRecommended,
  isSelected,
  onSelect,
  disabled,
}: {
  option: EscalationOption;
  isRecommended: boolean;
  isSelected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected
          ? 'border-2 border-primary ring-2 ring-primary/20'
          : 'hover:border-primary/50'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      onClick={() => !disabled && onSelect()}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/30'
              }`}
            >
              {isSelected && <CheckCircle2 className="h-3 w-3" />}
            </div>
            <CardTitle className="text-base">{option.label}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isRecommended && (
              <Badge variant="default" className="bg-blue-600">
                <Lightbulb className="mr-1 h-3 w-3" />
                Recommended
              </Badge>
            )}
            <Badge variant={getRiskLevelVariant(option.riskLevel)}>
              {option.riskLevel} risk
            </Badge>
          </div>
        </div>
        <CardDescription className="mt-2 pl-7">{option.description}</CardDescription>
      </CardHeader>

      <CardContent className="pl-7">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Pros */}
          <div>
            <h4 className="mb-2 flex items-center gap-1 text-sm font-medium text-green-700">
              <ThumbsUp className="h-4 w-4" />
              Pros
            </h4>
            <ul className="space-y-1">
              {option.pros.map((pro, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-green-600" />
                  {pro}
                </li>
              ))}
            </ul>
          </div>

          {/* Cons */}
          <div>
            <h4 className="mb-2 flex items-center gap-1 text-sm font-medium text-red-700">
              <ThumbsDown className="h-4 w-4" />
              Cons
            </h4>
            <ul className="space-y-1">
              {option.cons.map((con, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-red-600" />
                  {con}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Escalation detail page
 *
 * Full-screen decision interface for reviewing and deciding on escalations.
 */
export default function EscalationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: escalation, isLoading, error } = useEscalation(id);
  const recordDecision = useRecordDecision();

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedOption || !escalation) return;

    setIsSubmitting(true);
    try {
      await recordDecision.mutateAsync({
        id: escalation.id,
        decision: selectedOption,
        notes: notes.trim() || undefined,
      });
      router.push('/escalations');
    } catch (error) {
      console.error('Failed to record decision:', error);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !escalation) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h3 className="text-lg font-medium">Escalation not found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This escalation may have been resolved or expired.
        </p>
        <Link href="/escalations" className="mt-4">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Escalations
          </Button>
        </Link>
      </div>
    );
  }

  const isPending = escalation.status === 'pending';
  const decidedOption = escalation.options.find((o) => o.id === escalation.userDecision);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Link href="/escalations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <Badge variant={isPending ? 'warning' : 'success'}>
          {isPending ? (
            <>
              <Clock className="mr-1 h-3 w-3" />
              Pending Decision
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Decided
            </>
          )}
        </Badge>
      </div>

      {/* Title and context */}
      <div>
        <h1 className="text-2xl font-bold">{escalation.title}</h1>
        <p className="mt-2 text-muted-foreground">{escalation.context.summary}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Created {formatEscalationTime(escalation.createdAt)}
          {escalation.decidedAt && (
            <> - Decided {formatEscalationTime(escalation.decidedAt)}</>
          )}
        </p>
      </div>

      {/* Triggering signals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Triggering Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {escalation.context.triggeringSignals.map((signal, index) => (
              <li key={index} className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5">
                  {signal.source}
                </Badge>
                <div className="flex-1">
                  <p className="text-sm">{signal.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatEscalationTime(signal.timestamp)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Relevant artefacts */}
          {escalation.context.relevantArtefacts &&
            escalation.context.relevantArtefacts.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="mb-2 text-sm font-medium">Relevant Artefacts</h4>
                <ul className="space-y-2">
                  {escalation.context.relevantArtefacts.map((artefact, index) => (
                    <li key={index} className="text-sm text-muted-foreground">
                      <Badge variant="secondary" className="mr-2">
                        {artefact.artefactType.replace('_', ' ')}
                      </Badge>
                      {artefact.excerpt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Precedents */}
          {escalation.context.precedents && escalation.context.precedents.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <h4 className="mb-2 text-sm font-medium">Historical Precedents</h4>
              <ul className="space-y-1">
                {escalation.context.precedents.map((precedent, index) => (
                  <li key={index} className="text-sm text-muted-foreground">
                    - {precedent}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent's rationale */}
      {escalation.agentRationale && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-blue-900">
              <Lightbulb className="h-5 w-5" />
              Agent Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-800">{escalation.agentRationale}</p>
          </CardContent>
        </Card>
      )}

      {/* Decision options */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          {isPending ? 'Choose an Option' : 'Options Considered'}
        </h2>
        <div className="space-y-4">
          {escalation.options.map((option) => (
            <OptionCard
              key={option.id}
              option={option}
              isRecommended={option.id === escalation.agentRecommendation}
              isSelected={
                isPending
                  ? selectedOption === option.id
                  : escalation.userDecision === option.id
              }
              onSelect={() => isPending && setSelectedOption(option.id)}
              disabled={!isPending}
            />
          ))}
        </div>
      </div>

      {/* Decision form for pending escalations */}
      {isPending && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Record Your Decision</CardTitle>
            <CardDescription>
              Add any notes to explain your reasoning (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="decision-notes">Decision Notes (Optional)</Label>
              <textarea
                id="decision-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about your decision..."
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                This decision will be recorded and the agent will proceed accordingly
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!selectedOption || isSubmitting}
                className="min-w-[150px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Decision
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decision record for decided escalations */}
      {!isPending && escalation.userDecision && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-green-900">
              <CheckCircle2 className="h-5 w-5" />
              Decision Recorded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-medium">Chosen option:</span>{' '}
                {decidedOption?.label || escalation.userDecision}
              </p>
              {escalation.userNotes && (
                <p className="text-sm">
                  <span className="font-medium">Notes:</span> {escalation.userNotes}
                </p>
              )}
              {escalation.decidedAt && (
                <p className="text-xs text-muted-foreground">
                  Decided {formatEscalationTime(escalation.decidedAt)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
