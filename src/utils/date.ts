/**
 * Zelfde formatting als client formatBookingDateTime (DraftInformationCard).
 */
export function formatBookingDateTime(date: Date): string {
    const formatted = date.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });

    const offsetMinutes = -date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetSign = offsetMinutes >= 0 ? "+" : "-";
    const gmtOffset = `(GMT${offsetSign}${String(offsetHours).padStart(2, "0")})`;

    const fixed = formatted.replace(/\b(a\.m\.|p\.m\.)\b/gi, (match) =>
        match.toUpperCase().replace(/\./g, "")
    );

    return `${fixed} ${gmtOffset}`;
}
