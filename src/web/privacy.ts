import { htmlResponse } from "./html.js";
import { renderDocument } from "./site/Document.js";
import { type GrievanceBlock, Privacy } from "./site/Privacy.js";

export type { GrievanceBlock };

/** The store privacy URL. The text is the app's notice from the shared contract; the grievance block comes from the host's settings. */
export function privacyPage(grievance: GrievanceBlock | null): Response {
  return htmlResponse(renderDocument({ title: "Privacy notice", children: Privacy({ grievance }) }));
}
