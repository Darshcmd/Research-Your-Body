import type { Claim, ReviewStatus } from "../types";

const STATUS_STYLES: Record<ReviewStatus, string> = {
  pending: "bg-clay/20 text-clay",
  approved: "bg-emerald-700/40 text-emerald-300",
  rejected: "bg-rust-700/40 text-rust-500",
};

interface Props {
  claims: Claim[];
  onReview: (claimId: string, status: ReviewStatus) => void;
}

export default function ClaimsPanel({ claims, onReview }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-clay">
        Each claim links to the exact sentence, section, and page in the source
        paper. Approve or reject to gate what goes into the carousel.
      </p>
      {claims.map((claim) => (
        <article key={claim.id} className="rounded-xl bg-ink-800 p-5">
          <div className="flex items-start justify-between gap-4">
            <p className="font-medium leading-relaxed">{claim.text}</p>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[claim.reviewStatus]}`}
            >
              {claim.reviewStatus}
            </span>
          </div>

          <blockquote className="mt-4 border-l-2 border-ember/60 bg-ink-900/60 p-3 text-sm italic text-blush">
            “{claim.evidence.quote}”
          </blockquote>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-clay">
            <span>Section: {claim.evidence.section}</span>
            <span>Page: {claim.evidence.page}</span>
            {claim.evidence.start !== null && (
              <span>
                Offset: [{claim.evidence.start}, {claim.evidence.end}]
              </span>
            )}
            <span>Score: {claim.score}</span>
          </div>

          <div className="mt-4 flex gap-2">
            {(["approved", "pending", "rejected"] as ReviewStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => onReview(claim.id, status)}
                disabled={claim.reviewStatus === status}
                className={`rounded-lg px-3 py-1 text-sm transition ${
                  claim.reviewStatus === status
                    ? "cursor-default bg-ink-700 text-clay"
                    : "bg-ink-700 text-cream hover:bg-rust-700"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          {claim.note && <p className="mt-2 text-xs text-clay">Note: {claim.note}</p>}
        </article>
      ))}
    </div>
  );
}
