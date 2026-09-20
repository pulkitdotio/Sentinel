export function RouteLoadingFallback() {
  return (
    <main className="route-loading" role="status" aria-label="Loading Sentinel page" aria-live="polite">
      <div className="route-loading__brand">SENTINEL</div>
      <div className="route-loading__signal" aria-hidden="true"><span /></div>
      <p>Loading your Sentinel view…</p>
    </main>
  );
}

export function ContentLoadingFallback() {
  return (
    <div className="route-content-loading" role="status" aria-label="Loading Sentinel view" aria-live="polite">
      <div className="route-content-loading__signal" aria-hidden="true"><span /></div>
      <p>Loading view…</p>
    </div>
  );
}
