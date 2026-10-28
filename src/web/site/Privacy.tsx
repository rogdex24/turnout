import { NOTICE_PARAGRAPHS, NOTICE_VERSION } from "@turnout/contract/app/notice";
import { Header } from "./Header.js";

export interface GrievanceBlock {
  name: string;
  address: string;
  email: string;
  phone: string;
}

/** /privacy: the notice the app shows before sign-in, word for word, and the grievance officer. The store listings link here. */
export function Privacy({ grievance }: { grievance: GrievanceBlock | null }) {
  return (
    <>
      <Header />
      <h1>Privacy notice</h1>
      <p>Version {NOTICE_VERSION}</p>
      {NOTICE_PARAGRAPHS.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <h2>Grievance officer</h2>
      {grievance ? (
        <dl>
          <dt>Name</dt>
          <dd>{grievance.name}</dd>
          <dt>Address</dt>
          <dd>{grievance.address}</dd>
          <dt>Email</dt>
          <dd>
            <a className="link" href={`mailto:${grievance.email}`}>
              {grievance.email}
            </a>
          </dd>
          <dt>Phone</dt>
          <dd>{grievance.phone}</dd>
        </dl>
      ) : (
        <p>Details not set.</p>
      )}
    </>
  );
}
