'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Eye, FileEdit, Zap, AlertTriangle } from 'lucide-react';
import type { AutonomyLevel } from '@/types';

/**
 * Autonomy level configuration
 */
const AUTONOMY_LEVELS: {
  level: AutonomyLevel;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}[] = [
  {
    level: 'monitoring',
    label: 'Observe',
    shortLabel: 'Observe',
    description: 'Watch and log only. All actions require approval.',
    icon: Eye,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  {
    level: 'artefact',
    label: 'Maintain',
    shortLabel: 'Maintain',
    description: 'Update artefacts and send internal notifications autonomously.',
    icon: FileEdit,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  {
    level: 'tactical',
    label: 'Act',
    shortLabel: 'Act',
    description: 'Send stakeholder emails and update Jira via hold queue.',
    icon: Zap,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
];

interface AutonomyDialProps {
  value: AutonomyLevel;
  onChange: (level: AutonomyLevel) => void;
  disabled?: boolean;
  showWarning?: boolean;
  className?: string;
}

/**
 * Autonomy Dial Component
 *
 * A visual slider for selecting the agent's autonomy level.
 * Displays three levels: Observe / Maintain / Act
 */
export function AutonomyDial({
  value,
  onChange,
  disabled = false,
  showWarning = false,
  className,
}: AutonomyDialProps) {
  const currentIndex = AUTONOMY_LEVELS.findIndex((l) => l.level === value);
  const currentConfig = AUTONOMY_LEVELS[currentIndex] ?? AUTONOMY_LEVELS[0];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Dial Track */}
      <div className="relative">
        {/* Background Track */}
        <div className="flex h-12 rounded-lg border bg-muted/30 p-1">
          {AUTONOMY_LEVELS.map((config, index) => {
            const isActive = config.level === value;
            const Icon = config.icon;

            return (
              <button
                key={config.level}
                type="button"
                onClick={() => onChange(config.level)}
                disabled={disabled}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium transition-all',
                  isActive
                    ? cn(config.bgColor, config.color, 'shadow-sm')
                    : 'text-muted-foreground hover:text-foreground',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{config.label}</span>
              </button>
            );
          })}
        </div>

        {/* Progress indicator */}
        <div className="mt-2 flex justify-between px-1">
          {AUTONOMY_LEVELS.map((config, index) => (
            <div
              key={config.level}
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-colors',
                index <= currentIndex ? currentConfig?.color.replace('text-', 'bg-') : 'bg-muted'
              )}
            />
          ))}
        </div>
      </div>

      {/* Current Level Description */}
      <div
        className={cn(
          'rounded-lg border p-4 transition-colors',
          currentConfig?.bgColor,
          currentConfig?.borderColor
        )}
      >
        <div className="flex items-start gap-3">
          {currentConfig && (
            <>
              <currentConfig.icon className={cn('h-5 w-5 mt-0.5', currentConfig.color)} />
              <div className="flex-1">
                <h4 className={cn('font-medium', currentConfig.color)}>
                  {currentConfig.label} Mode
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">{currentConfig.description}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Warning for higher autonomy levels */}
      {showWarning && value !== 'monitoring' && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
          <div>
            <span className="font-medium text-yellow-800">Higher autonomy enabled.</span>
            <span className="text-yellow-700">
              {' '}
              The agent will take actions autonomously. Review the hold queue regularly.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version of the autonomy dial for use in headers/sidebars
 */
export function AutonomyDialCompact({
  value,
  onChange,
  disabled = false,
  className,
}: Omit<AutonomyDialProps, 'showWarning'>) {
  const currentConfig = AUTONOMY_LEVELS.find((l) => l.level === value) ?? AUTONOMY_LEVELS[0];
  const Icon = currentConfig?.icon ?? Eye;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
          currentConfig?.bgColor,
          currentConfig?.color
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{currentConfig?.shortLabel}</span>
      </div>

      <div className="flex gap-0.5">
        {AUTONOMY_LEVELS.map((config) => (
          <button
            key={config.level}
            type="button"
            onClick={() => onChange(config.level)}
            disabled={disabled}
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              config.level === value
                ? currentConfig?.color.replace('text-', 'bg-')
                : 'bg-muted hover:bg-muted-foreground/30',
              disabled && 'cursor-not-allowed'
            )}
            title={config.label}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Get the display configuration for an autonomy level
 */
export function getAutonomyLevelConfig(level: AutonomyLevel) {
  return AUTONOMY_LEVELS.find((l) => l.level === level) ?? AUTONOMY_LEVELS[0];
}
