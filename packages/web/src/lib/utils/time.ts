/**
 * Time formatting utilities
 *
 * Consolidated time formatting functions for consistent date/time display
 * across the application.
 */

/**
 * Format a timestamp as a relative time string
 *
 * @param timestamp - ISO timestamp string
 * @returns Human-readable relative time (e.g., "Just now", "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return 'Just now';
  }

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  if (diffDays < 30) {
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks}w ago`;
  }

  // Fall back to formatted date for older items
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Format a timestamp as a full date/time string
 *
 * @param timestamp - ISO timestamp string
 * @param options - Formatting options
 * @returns Formatted date/time string
 */
export function formatDateTime(
  timestamp: string | Date,
  options: {
    includeTime?: boolean;
    includeSeconds?: boolean;
    use24Hour?: boolean;
  } = {}
): string {
  const {
    includeTime = true,
    includeSeconds = false,
    use24Hour = true,
  } = options;
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

  const dateOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };

  if (includeTime) {
    dateOptions.hour = '2-digit';
    dateOptions.minute = '2-digit';
    if (includeSeconds) {
      dateOptions.second = '2-digit';
    }
    dateOptions.hour12 = !use24Hour;
  }

  return date.toLocaleString('en-GB', dateOptions);
}

/**
 * Calculate remaining time until a deadline
 *
 * @param deadline - ISO timestamp string of the deadline
 * @returns Object with time remaining breakdown and formatted string
 */
export function calculateTimeRemaining(deadline: string | Date): {
  isExpired: boolean;
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
} {
  const deadlineDate =
    typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const isExpired = diffMs <= 0;

  if (isExpired) {
    return {
      isExpired: true,
      totalMs: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: 'Expired',
    };
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  let formatted: string;
  if (days > 0) {
    formatted = `${days}d ${hours}h`;
  } else if (hours > 0) {
    formatted = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    formatted = `${minutes}m`;
  } else {
    formatted = `${seconds}s`;
  }

  return {
    isExpired,
    totalMs: diffMs,
    days,
    hours,
    minutes,
    seconds,
    formatted,
  };
}

/**
 * Format a timestamp for the last heartbeat display
 *
 * @param timestamp - ISO timestamp string or null
 * @returns Human-readable string
 */
export function formatLastHeartbeat(timestamp: string | null): string {
  if (!timestamp) {
    return 'Never';
  }
  return formatRelativeTime(timestamp);
}

/**
 * Format a timestamp for event time display
 *
 * @param timestamp - ISO timestamp string
 * @returns Human-readable string for event times
 */
export function formatEventTime(timestamp: string): string {
  return formatRelativeTime(timestamp);
}

/**
 * Format a timestamp for last activity display
 *
 * @param timestamp - ISO timestamp string
 * @returns Human-readable string with "min" for minutes
 */
export function formatLastActivity(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return 'Just now';
  }

  if (diffMins < 60) {
    return `${diffMins} min ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
