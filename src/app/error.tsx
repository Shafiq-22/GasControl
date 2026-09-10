'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <section className="mx-auto max-w-xl p-6" role="alert">
    <h1 className="text-xl font-semibold">The gas-store records could not be loaded</h1>
    <p className="my-4">No balances or charges are shown while the database is unavailable. Ask the administrator to check the connection, database migrations and your access, then retry.</p>
    <button className="btn btn-primary" onClick={reset}>Try again</button>
  </section>;
}
