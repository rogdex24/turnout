import { useState } from "react";
import { ErrorAlert, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { request } from "../api";

/** The list holds hashes only, so there is nothing to show: the operator lifts one by typing the number. */
export function BansPage() {
  const [phone, setPhone] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [result, setResult] = useState<string>();

  const lift = async () => {
    setFailure(undefined);
    setResult(undefined);
    try {
      await request("/api/bans/lift", { method: "POST", body: { phone } });
      setResult("The number is off the ban list. It can sign up again.");
      setPhone("");
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Ban list"
        description="The list keeps a keyed hash of each number, never the number or an account. Type a number to lift its ban."
      />
      {failure && <ErrorAlert error={failure} title="Could not lift the ban" />}
      {result && <p className="mb-4 text-sm">{result}</p>}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (phone.trim()) void (confirming ? lift() : setConfirming(true));
        }}
      >
        <Input
          aria-label="Phone number"
          placeholder="Number with country code"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setConfirming(false);
          }}
          className="max-w-xs"
        />
        <Button type="submit" variant={confirming ? "destructive" : "outline"} disabled={!phone.trim()}>
          {confirming ? "Confirm lift" : "Lift ban"}
        </Button>
      </form>
    </>
  );
}
