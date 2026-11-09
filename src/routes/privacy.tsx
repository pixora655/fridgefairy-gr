import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftPage } from "../components/legal-draft-page";
import { privacyDraft } from "../lib/legal-drafts";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Πολιτική απορρήτου — προσχέδιο | Fridgie" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <LegalDraftPage title="Πολιτική απορρήτου — προσχέδιο" text={privacyDraft} />,
});
