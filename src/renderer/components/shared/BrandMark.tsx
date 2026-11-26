import { useId } from 'react';
import { cn } from '@/lib/utils';

interface BrandIconProps {
    className?: string | undefined;
}

export function DevLedgerIcon({ className }: BrandIconProps) {
    const uid = useId().replace(/:/g, '');
    const bgId = `${uid}-bg`;
    const glowId = `${uid}-glow`;
    const spineId = `${uid}-spine`;
    const pageId = `${uid}-page`;
    const ribbonId = `${uid}-ribbon`;

    return (
        <svg
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            className={cn('size-8 shrink-0 select-none', className)}
        >
            <defs>
                <linearGradient id={bgId} x1="4" y1="2" x2="60" y2="62" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1B2232" />
                    <stop offset="100%" stopColor="#0B0E15" />
                </linearGradient>
                <radialGradient
                    id={glowId}
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(16 12) rotate(45) scale(42)"
                >
                    <stop offset="0%" stopColor="#4F7DF3" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#4F7DF3" stopOpacity="0" />
                </radialGradient>
                <linearGradient id={spineId} x1="18" y1="12" x2="18" y2="52" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#6FA2FA" />
                    <stop offset="100%" stopColor="#254EB8" />
                </linearGradient>
                <linearGradient id={pageId} x1="36" y1="12" x2="36" y2="52" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="100%" stopColor="#E6ECF7" />
                </linearGradient>
                <linearGradient
                    id={ribbonId}
                    x1="42.5"
                    y1="12"
                    x2="42.5"
                    y2="22"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop offset="0%" stopColor="#6094F6" />
                    <stop offset="100%" stopColor="#2958CE" />
                </linearGradient>
            </defs>

            <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${bgId})`} />
            <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${glowId})`} />
            <rect
                x="2.75"
                y="2.75"
                width="58.5"
                height="58.5"
                rx="14.25"
                stroke="#FFFFFF"
                strokeOpacity="0.14"
                strokeWidth="1.5"
            />

            <path
                d="M21 12H45C48.3137 12 51 14.6863 51 18V46C51 49.3137 48.3137 52 45 52H21V12Z"
                fill={`url(#${pageId})`}
            />
            <rect x="21" y="12" width="2" height="40" fill="#0F172A" fillOpacity="0.10" />
            <path
                d="M14 16C14 13.7909 15.7909 12 18 12H22V52H18C15.7909 52 14 50.2091 14 48V16Z"
                fill={`url(#${spineId})`}
            />
            <rect x="16" y="19" width="3.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.32" />
            <rect x="16" y="22.5" width="3.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.20" />
            <path d="M40 12H45V22L42.5 20L40 22V12Z" fill={`url(#${ribbonId})`} />
            <path
                d="M27.5 25L35 31L27.5 37"
                stroke="#111622"
                strokeWidth="3.75"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <rect x="37" y="34.5" width="8.5" height="3.75" rx="1.875" fill="#2F63E0" />
            <rect x="27" y="42.5" width="18" height="2.75" rx="1.375" fill="#B8C4D9" />
        </svg>
    );
}

interface BrandLogoProps {
    className?: string | undefined;
    iconClassName?: string | undefined;
    subtitle?: string | undefined;
    collapsed?: boolean | undefined;
}

export function DevLedgerLogo({ className, iconClassName, subtitle, collapsed = false }: BrandLogoProps) {
    return (
        <div className={cn('flex min-h-9 items-center gap-2.5', className)}>
            <DevLedgerIcon className={iconClassName} />
            {!collapsed && (
                <div className="min-w-0 group-data-[state=collapsed]/sidebar-provider:hidden">
                    <div className="text-[14px] font-semibold leading-tight tracking-tight">DevLedger</div>
                    {subtitle && (
                        <div className="truncate text-[10.5px] font-medium text-muted-foreground">
                            {subtitle}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
