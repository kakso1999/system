import { AlertCircle, CheckCircle } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import type { ClaimResultData } from "./wheel-support";

function RewardCodeCard({ rewardCode }: { rewardCode: string }) {
  return (
    <div className="mt-4 rounded-xl border-2 border-primary bg-white p-4">
      <p className="text-xs font-bold text-outline uppercase tracking-wider mb-1">Your Reward Code</p>
      <p className="font-mono text-2xl font-extrabold text-primary tracking-wider">{rewardCode}</p>
      <button
        onClick={() => copyToClipboard(rewardCode)}
        className="mt-2 text-xs text-primary font-bold hover:underline"
      >
        Copy Code
      </button>
    </div>
  );
}

export function ClaimResultCard({
  claimResult,
  redirectCountdown,
}: {
  claimResult: ClaimResultData;
  redirectCountdown: number | null;
}) {
  return (
    <div className={`rounded-xl p-6 text-center ${claimResult.success ? "bg-green-50" : "bg-red-50"}`}>
      {claimResult.success ? (
        <CheckCircle className="w-12 h-12 text-green-600 mb-3 mx-auto block" />
      ) : (
        <AlertCircle className="w-12 h-12 text-error mb-3 mx-auto block" />
      )}
      <h3 className={`font-bold text-xl mb-2 ${claimResult.success ? "text-green-700" : "text-error"}`}>
        {claimResult.success ? "Prize Claimed!" : "Claim Failed"}
      </h3>
      <p className="text-sm text-on-surface-variant">{claimResult.message}</p>
      {claimResult.reward_code && <RewardCodeCard rewardCode={claimResult.reward_code} />}
      {claimResult.success && redirectCountdown !== null && (
        <p className="mt-3 text-xs font-semibold text-on-surface-variant">
          Redirecting to result page in {redirectCountdown}s...
        </p>
      )}
      {claimResult.redirect_url && (
        <a
          href={claimResult.redirect_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-4 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm"
        >
          Go to Prize Website
        </a>
      )}
    </div>
  );
}
