import { app } from 'electron';

const TICK_MS = 30_000;

function mb(bytes: number): string {
  return `${String(Math.round(bytes / 1024))} MB`;
}

/**
 * Development-only memory reporting, so the targets in the README stay
 * honest rather than aspirational: cold start under 2s, a new tab under
 * 100ms, and idle memory under 400 MB with five tabs open.
 *
 * Does nothing in a packaged build.
 */
export function startDevMetrics(isDev: boolean, countTabs: () => number): () => void {
  if (!isDev) return () => undefined;

  const started = Date.now();

  const report = (): void => {
    void process
      .getProcessMemoryInfo()
      .then((info) => {
        const totals = app.getAppMetrics().reduce(
          (sum, metric) => ({
            processes: sum.processes + 1,
            working: sum.working + metric.memory.workingSetSize,
          }),
          { processes: 0, working: 0 },
        );

        console.log(
          `[metrics] uptime ${String(Math.round((Date.now() - started) / 1000))}s · ` +
            `tabs ${String(countTabs())} · processes ${String(totals.processes)} · ` +
            `main private ${mb(info.private)} · all working sets ${mb(totals.working)}`,
        );
      })
      .catch(() => {
        // Metrics are a convenience; never let them take the app down.
      });
  };

  app.whenReady().then(report, () => undefined);
  const timer = setInterval(report, TICK_MS);
  timer.unref();

  return () => {
    clearInterval(timer);
  };
}
