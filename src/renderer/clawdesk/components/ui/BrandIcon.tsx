// Brand icon component - Sarah keyboard key with waveform bars
// Adapted from Sarah design system brand-logo.html

interface BrandIconProps {
  size?: number;
  variant?: 'outline' | 'filled' | 'tray';
  className?: string;
}

export function BrandIcon({ size = 18, variant = 'outline', className = '' }: BrandIconProps) {
  if (variant === 'tray') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
        <rect x="17" y="25" width="7" height="14" rx="3.5" fill="currentColor"/>
        <rect x="28.5" y="17" width="7" height="22" rx="3.5" fill="currentColor"/>
        <rect x="40" y="23" width="7" height="16" rx="3.5" fill="currentColor"/>
      </svg>
    );
  }

  if (variant === 'filled') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
        <rect x="2" y="2" width="60" height="56" rx="14" fill="currentColor"/>
        <path d="M26 58 L26 62 Q32 64.5 38 62 L38 58" fill="currentColor"/>
        <rect x="17" y="26" width="7" height="13" rx="3.5" fill="white" opacity="0.95"/>
        <rect x="28.5" y="18" width="7" height="21" rx="3.5" fill="white" opacity="0.95"/>
        <rect x="40" y="24" width="7" height="15" rx="3.5" fill="white" opacity="0.95"/>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
      <rect x="4" y="4" width="56" height="52" rx="13" fill="none" stroke="currentColor" strokeWidth="3.5"/>
      <path d="M26 56 L26 60 Q32 62 38 60 L38 56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="17" y="25" width="7" height="14" rx="3.5" fill="currentColor"/>
      <rect x="28.5" y="17" width="7" height="22" rx="3.5" fill="currentColor"/>
      <rect x="40" y="23" width="7" height="16" rx="3.5" fill="currentColor"/>
    </svg>
  );
}
