'use client';

import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Plug,
  X,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

interface ConnectorSetupConfig {
  connectorId: string;
  connectorName: string;
  icon: string;
  credentialFields: CredentialField[];
  /** Additional configuration fields (baseUrl, projectKey, etc.) */
  configFields?: CredentialField[];
}

interface ConnectorSetupWizardProps {
  config: ConnectorSetupConfig;
  onComplete: (
    credentials: Record<string, string>,
    parameters: Record<string, string>
  ) => void;
  onCancel: () => void;
  onTestConnection: (
    credentials: Record<string, string>,
    parameters: Record<string, string>
  ) => Promise<{ healthy: boolean; error?: string; latencyMs?: number }>;
}

type WizardStep = 'credentials' | 'configure' | 'test' | 'complete';

// ============================================================================
// Setup Wizard
// ============================================================================

export function ConnectorSetupWizard({
  config,
  onComplete,
  onCancel,
  onTestConnection,
}: ConnectorSetupWizardProps) {
  const [step, setStep] = React.useState<WizardStep>('credentials');
  const [credentials, setCredentials] = React.useState<Record<string, string>>(
    {}
  );
  const [parameters, setParameters] = React.useState<Record<string, string>>(
    {}
  );
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    healthy: boolean;
    error?: string;
    latencyMs?: number;
  } | null>(null);

  const hasConfigFields = config.configFields && config.configFields.length > 0;
  const steps: WizardStep[] = hasConfigFields
    ? ['credentials', 'configure', 'test', 'complete']
    : ['credentials', 'test', 'complete'];

  const stepIndex = steps.indexOf(step);
  const isFirstStep = stepIndex === 0;
  const canProceed = React.useMemo(() => {
    if (step === 'credentials') {
      return config.credentialFields
        .filter((f) => f.required)
        .every((f) => credentials[f.key]?.trim());
    }
    if (step === 'configure') {
      return (config.configFields ?? [])
        .filter((f) => f.required)
        .every((f) => parameters[f.key]?.trim());
    }
    if (step === 'test') {
      return testResult?.healthy === true;
    }
    return true;
  }, [step, credentials, parameters, testResult, config]);

  const handleNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
      setTestResult(null);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTestConnection(credentials, parameters);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        healthy: false,
        error: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleComplete = () => {
    onComplete(credentials, parameters);
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Plug className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                Connect {config.connectorName}
              </CardTitle>
              <CardDescription>
                Step {stepIndex + 1} of {steps.length}
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mt-4">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                  i < stepIndex
                    ? 'bg-green-100 text-green-700'
                    : i === stepIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {i < stepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    i < stepIndex ? 'bg-green-300' : 'bg-muted'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {/* Credentials Step */}
        {step === 'credentials' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your authentication credentials. These will be stored
              securely in AWS Secrets Manager.
            </p>
            {config.credentialFields.map((field) => (
              <CredentialInput
                key={field.key}
                field={field}
                value={credentials[field.key] ?? ''}
                onChange={(value) =>
                  setCredentials((prev) => ({ ...prev, [field.key]: value }))
                }
              />
            ))}
          </div>
        )}

        {/* Configure Step */}
        {step === 'configure' && config.configFields && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure connection parameters for this connector.
            </p>
            {config.configFields.map((field) => (
              <CredentialInput
                key={field.key}
                field={field}
                value={parameters[field.key] ?? ''}
                onChange={(value) =>
                  setParameters((prev) => ({ ...prev, [field.key]: value }))
                }
              />
            ))}
          </div>
        )}

        {/* Test Step */}
        {step === 'test' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Test the connection to verify your credentials work.
            </p>

            <div className="flex flex-col items-center gap-4 py-6">
              {!testing && !testResult && (
                <Button onClick={handleTestConnection} size="lg">
                  <Plug className="h-4 w-4 mr-2" />
                  Test Connection
                </Button>
              )}

              {testing && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Testing connection...</span>
                </div>
              )}

              {testResult && (
                <div
                  className={cn(
                    'w-full rounded-lg border p-4',
                    testResult.healthy
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {testResult.healthy ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="font-medium text-green-800">
                          Connection successful
                        </span>
                        {testResult.latencyMs && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            {testResult.latencyMs}ms
                          </Badge>
                        )}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <span className="font-medium text-red-800">
                          Connection failed
                        </span>
                      </>
                    )}
                  </div>
                  {testResult.error && (
                    <p className="mt-2 text-sm text-red-700">
                      {testResult.error}
                    </p>
                  )}
                  {!testResult.healthy && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={handleTestConnection}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">
                {config.connectorName} connected
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Signals will begin flowing on the next agent cycle.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <Button variant="ghost" onClick={handleBack} disabled={isFirstStep}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>

          {step === 'complete' ? (
            <Button onClick={handleComplete}>Done</Button>
          ) : (
            <Button onClick={handleNext} disabled={!canProceed}>
              Next
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Credential Input Field
// ============================================================================

function CredentialInput({
  field,
  value,
  onChange,
}: {
  field: CredentialField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.key} className="flex items-center gap-1.5">
        {field.label}
        {field.required && <span className="text-red-500 text-xs">*</span>}
      </Label>
      <Input
        id={field.key}
        type={field.type === 'password' ? 'password' : 'text'}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}

export type { ConnectorSetupConfig, ConnectorSetupWizardProps };
