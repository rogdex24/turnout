/** The grievance officer as `GET /config` carries it. */
export interface GrievanceOfficer {
  name: string;
  address: string;
  email: string;
  phone: string;
}

/**
 * The placeholders the server fills in for development and staging (`src/app-api/env.ts`): "(not set)" in the name, "not set" in
 * the address, an example.com address and a +1 202 555 01xx number (a number reserved for fiction). Production refuses to start
 * without real values, so seeing one of these means the details were never entered for this host.
 */
export function grievanceNotSet(officer: GrievanceOfficer): boolean {
  const compactPhone = officer.phone.replace(/[\s()-]/g, "");
  return (
    /not set/i.test(officer.name) ||
    /not set/i.test(officer.address) ||
    /@example\.(com|org|net)$/i.test(officer.email.trim()) ||
    /^\+1202555\d{4}$/.test(compactPhone)
  );
}

/** The phone number as the `tel:` link wants it: digits and a leading plus. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function mailtoHref(email: string): string {
  return `mailto:${email.trim()}`;
}
