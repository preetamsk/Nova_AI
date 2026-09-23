/** The supplied NOVA wordmark, exported with a high-definition transparent canvas. */
export default function NovaMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "nova-mark compact" : "nova-mark"}>
      <span className="nova-wordmark">
        <svg viewBox="0 0 713 222" aria-label="NOVA AI" role="img" preserveAspectRatio="xMidYMid meet">
          <image href="/nova-wordmark-transparent.png" width="713" height="222" />
        </svg>
      </span>
    </span>
  );
}
