import { Component, type ErrorInfo, type ReactNode } from "react";
import { Skeleton } from "@bb/shared-ui/skeleton";
import { Button } from "@bb/shared-ui/button";

/**
 * Shown while a lazy route chunk is in flight. Every main-content route is
 * `React.lazy`, and `AppLayout` renders eagerly around them, so without a
 * visible fallback a slow chunk leaves the sidebar and header intact while the
 * content area stays blank. Navigating then looks identical to a dead button —
 * the reason this file exists.
 */
export function RouteChunkFallback() {
  return (
    <div className="h-full overflow-y-auto" data-testid="route-chunk-fallback">
      <div className="mx-auto w-full max-w-5xl px-4 pb-4 pt-2 md:px-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

interface RouteChunkBoundaryProps {
  children: ReactNode;
}

interface RouteChunkBoundaryState {
  error: Error | null;
}

/**
 * Catches a route chunk that fails to load — an offline or unresponsive server,
 * or a stale hashed asset after a redeploy. Without this the rejection escapes
 * `React.lazy` with nothing to catch it and unmounts the whole tree, so the
 * window goes white instead of showing what went wrong.
 *
 * Recovery is a reload, not a re-render: `React.lazy` caches the settled
 * promise, so a rejected chunk re-throws on every subsequent render. Clearing
 * this boundary's state alone would loop straight back into the same error.
 */
export class RouteChunkBoundary extends Component<
  RouteChunkBoundaryProps,
  RouteChunkBoundaryState
> {
  constructor(props: RouteChunkBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): RouteChunkBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(
      `route chunk failed to load: ${error.message}`,
      info.componentStack,
    );
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="flex h-full items-center justify-center p-6"
        data-testid="route-chunk-error"
      >
        <div className="max-w-md space-y-3 text-center">
          <p className="text-sm font-medium">This view failed to load.</p>
          <p className="text-muted-foreground text-xs">
            The app could not fetch part of the interface. This usually means
            the bb server is unreachable or was restarted.
          </p>
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
