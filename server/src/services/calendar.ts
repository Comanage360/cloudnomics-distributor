export interface ReminderInput {
  customerName: string;
  customerEmail: string;
  daysOut?: number;
}

const z = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");

/**
 * Build a 3-day follow-up reminder as ready-to-use calendar links plus a
 * downloadable .ics. Direct OAuth event creation (Google Calendar /
 * Microsoft Graph) is the Phase-3 upgrade — see README roadmap.
 */
export function buildReminder({ customerName, customerEmail, daysOut = 3 }: ReminderInput) {
  const start = new Date(Date.now() + daysOut * 86400000);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60000);

  const title = `Follow up: ${customerName} — Palo Alto quote`;
  const details = `Follow up on the Cloudnomics / Palo Alto Networks quote sent to ${customerName} (${customerEmail}).`;

  const google =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${z(start)}/${z(end)}` +
    `&details=${encodeURIComponent(details)}`;

  const outlook =
    "https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose" +
    `&subject=${encodeURIComponent(title)}` +
    `&body=${encodeURIComponent(details)}` +
    `&startdt=${start.toISOString()}&enddt=${end.toISOString()}`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cloudnomics//Console//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@cloudnomics`,
    `DTSTAMP:${z(new Date())}`,
    `DTSTART:${z(start)}`,
    `DTEND:${z(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return { title, start: start.toISOString(), google, outlook, ics };
}
