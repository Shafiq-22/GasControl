export default function SetupPage() {
  return <main className="mx-auto max-w-xl px-6 py-16">
    <h1 className="text-2xl font-semibold">Gas Control needs its database connection</h1>
    <p className="mt-4">The deployment administrator must configure the Supabase project URL and public publishable key, then redeploy this application.</p>
    <p className="mt-4">No transactions can be entered until setup is complete.</p>
  </main>;
}
