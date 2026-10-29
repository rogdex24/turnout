import { htmlResponse } from "./html.js";
import { DeleteAccount } from "./site/DeleteAccount.js";
import { renderDocument } from "./site/Document.js";
import type { GrievanceBlock } from "./site/Privacy.js";

/** The store deletion URL. The grievance block comes from the host's settings, as on /privacy. */
export function deleteAccountPage(grievance: GrievanceBlock | null): Response {
  return htmlResponse(renderDocument({ title: "Delete your account", children: DeleteAccount({ grievance }) }));
}
