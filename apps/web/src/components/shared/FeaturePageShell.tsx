import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

export interface FeaturePageShellProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function FeaturePageShell({
  title,
  subtitle,
  action,
  children,
  className,
  contentClassName,
}: FeaturePageShellProps) {
  return (
    <div className={cn('space-y-5', className)}>
      {title && <PageHeader title={title} subtitle={subtitle} action={action} />}
      <div className={cn('space-y-5', contentClassName)}>{children}</div>
    </div>
  );
}

