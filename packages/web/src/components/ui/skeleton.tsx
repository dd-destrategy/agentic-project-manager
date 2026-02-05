import { cn } from '@/lib/utils';

/**
 * Skeleton loading placeholder component
 *
 * @remarks
 * Uses aria-hidden="true" to prevent screen reader announcement while content is loading.
 * This is WCAG 2.1 AA compliant - skeleton animations are purely visual indicators
 * and should not be announced to assistive technologies.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
