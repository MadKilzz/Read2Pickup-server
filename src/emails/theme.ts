/**
 * Email theme – hex equivalents of client index.css for maximum email client support.
 * Light theme: background, card, foreground, muted.
 * Primary: dark mode primary (oklch(59.113% 0.14841 149.716) → #34b87a).
 */
export const emailTheme = {
    /** Outer / page background */
    background: "#f0f0f0",
    /** Card background */
    card: "#ffffff",
    /** Main text / headings – from --foreground oklch(0.141 0.005 285.823) */
    foreground: "#1a1a1a",
    /** Body text */
    body: "#333333",
    /** Muted / closing – from --muted-foreground oklch(0.552 0.016 285.938) */
    muted: "#737373",
    /** CTA button – from .dark --primary oklch(59.113% 0.14841 149.716) */
    primary: "#34b87a",
    /** Button text */
    primaryForeground: "#ffffff",
} as const;
