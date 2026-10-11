function DraftBlock({ block }: { block: string }) {
  if (block.startsWith("### ")) return <h2 className="pt-4 text-xl font-bold">{block.slice(4)}</h2>;
  if (block.startsWith("|")) {
    const rows = block.split("\n").filter((row) => !/^\|[-| ]+\|$/.test(row)).map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
    return <div role="region" aria-label="Απογραφή αποθήκευσης — οριζόντια κύλιση με τα βέλη όταν χρειάζεται" tabIndex={0} className="overflow-x-auto rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"><table className="w-full min-w-[36rem] text-left text-sm"><caption className="sr-only">Απογραφή αποθήκευσης — προσχέδιο</caption><thead><tr>{rows[0].map((cell, i) => <th key={i} scope="col" className="border-b border-border bg-card p-3">{cell}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border-b border-border p-3 align-top">{cell}</td>)}</tr>)}</tbody></table></div>;
  }
  if (block.split("\n").every((line) => line.startsWith("- "))) return <ul className="list-disc space-y-3 pl-5 leading-7">{block.split("\n").map((line, i) => <li key={i}>{line.slice(2)}</li>)}</ul>;
  if (block.split("\n").every((line) => /^\d+\. /.test(line))) return <ol className="list-decimal space-y-3 pl-5 leading-7">{block.split("\n").map((line, i) => <li key={i}>{line.replace(/^\d+\. /, "")}</li>)}</ol>;
  return <p className="whitespace-pre-wrap break-words leading-7">{block}</p>;
}

export function LegalDraftPage({ title, text }: { title: string; text: string }) {
  return (
    <main lang="el" className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <a href="/" className="inline-flex min-h-11 items-center rounded-md px-2 py-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">Επιστροφή στο Fridgie</a>
      <h1 className="text-3xl font-bold">{title}</h1>
      <aside aria-label="Κατάσταση προσχεδίου" className="rounded-2xl border-2 border-border bg-card p-4">
        <p className="font-bold">Προσχέδιο για έλεγχο — όχι τελική πολιτική</p>
        <p>11 Οκτωβρίου 2026. Μόνο δοκιμαστικό preview, όχι δημοσίευση στο live. Περιέχει εκκρεμότητες και δεν αποτελεί πιστοποίηση συμμόρφωσης. Οι αγκύλες είναι σκόπιμα πεδία προς συμπλήρωση.</p>
      </aside>
      {text.split("\n\n").map((block, index) => <DraftBlock key={index} block={block} />)}
      <p>Επικοινωνία: <a className="inline-flex min-h-11 items-center rounded-md px-2 py-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground" href="mailto:pixora.studio.edits@gmail.com">pixora.studio.edits@gmail.com</a></p>
    </main>
  );
}
