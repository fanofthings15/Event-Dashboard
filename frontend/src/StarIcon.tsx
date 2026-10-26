// A drawn star, so the outline is the same weight all the way round (the ☆/★
// characters depend on whichever font has them). Filled when on.
export default function StarIcon({ filled, size = 20 }: { filled: boolean; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3.3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.7l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z" />
    </svg>
  );
}
