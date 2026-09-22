/** The supplied NOVA wordmark, exported with a transparent raster canvas. */
export default function NovaMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "nova-mark compact" : "nova-mark"}>
      <span className="nova-wordmark">
        <svg viewBox="0 0 281 93" aria-label="NOVA AI" role="img" preserveAspectRatio="xMidYMid meet">
          <image href="/nova-wordmark-transparent.png" width="281" height="93" />
        </svg>
      </span>
    </span>
  );
}
