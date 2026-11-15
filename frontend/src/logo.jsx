import { useId } from 'react';

/** The app mark: a chat bubble holding voice-wave bars. It follows the brand color. */
export default function Logo({ size = 34, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const bg = `lg-bg-${uid}`;
  const bars = `lg-bars-${uid}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`logo ${className}`} role="img" aria-label="Logo">
      <defs>
        <linearGradient id={bg} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--brand) 78%, #fff)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--brand)' }} />
          <stop offset="1" stopColor="#FF6FB5" />
        </linearGradient>
        <linearGradient id={bars} x1="0" y1="14" x2="0" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--brand)' }} />
          <stop offset="1" stopColor="#F0589F" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${bg})`} />
      <ellipse cx="22" cy="12" rx="22" ry="9" fill="#fff" opacity="0.14" />
      <path d="M23 13H41A10 10 0 0 1 51 23V33A10 10 0 0 1 41 43H34L24 51V43H23A10 10 0 0 1 13 33V23A10 10 0 0 1 23 13Z" fill="#fff" />
      <g fill={`url(#${bars})`}>
        <rect x="20.2" y="24" width="3.6" height="8" rx="1.8" />
        <rect x="25.6" y="20" width="3.6" height="16" rx="1.8" />
        <rect x="31" y="17" width="3.6" height="22" rx="1.8" />
        <rect x="36.4" y="21" width="3.6" height="14" rx="1.8" />
        <rect x="41.8" y="25" width="3.6" height="6" rx="1.8" />
      </g>
    </svg>
  );
}