import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftPage } from "../components/legal-draft-page";
import { cookiesDraft } from "../lib/legal-drafts";

export const Route = createFileRoute("/cookies")({
  head: () => ({ meta: [{ title: "Cookies και τοπική αποθήκευση — προσχέδιο | Fridgie" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <LegalDraftPage title="Cookies και τοπική αποθήκευση — προσχέδιο" text={cookiesDraft} />,
});
