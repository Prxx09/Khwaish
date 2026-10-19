"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal">
      <h1>Let’s get you back to your wishes.</h1>
      <p>
        Something didn’t load correctly. Your saved items are still in your
        account.
      </p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
