import { DELETION_ERASED, DELETION_KEPT } from "@turnout/contract/app/deletion";
import { Header } from "./Header.js";
import type { GrievanceBlock } from "./Privacy.js";

/**
 * /delete-account: the store deletion URL. It says how to delete the account in the app, what goes and what stays, and how to
 * ask without the app. The lists are the app's own, from the shared contract.
 */
export function DeleteAccount({ grievance }: { grievance: GrievanceBlock | null }) {
  return (
    <>
      <Header />
      <h1>Delete your Turnout account</h1>
      <p>You can delete your account at any time. It takes a minute and you do not need to write to anyone.</p>
      <h2>In the app</h2>
      <ol>
        <li>Open Turnout and go to the You tab.</li>
        <li>Tap Delete account and read what is deleted.</li>
        <li>Tap Send code to delete. We send a 6-digit code on WhatsApp to your number.</li>
        <li>Enter the code. Your account is deleted at once and you are signed out of every phone.</li>
      </ol>
      <h2>What we delete</h2>
      <ul>
        {DELETION_ERASED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>What we keep</h2>
      <ul>
        {DELETION_KEPT.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>Without the app</h2>
      <p>
        If you no longer have the app or the phone, write to the grievance officer from the number on the account, or say which number it
        is. We confirm the request with you and delete the account within 7 days.
      </p>
      {grievance ? (
        <dl>
          <dt>Name</dt>
          <dd>{grievance.name}</dd>
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
      <p>
        <a className="link" href="/privacy">
          Privacy notice
        </a>
      </p>
    </>
  );
}
