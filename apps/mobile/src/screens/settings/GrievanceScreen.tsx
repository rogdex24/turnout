import { useQuery } from "@tanstack/react-query";
import { Linking } from "react-native";
import { configQuery } from "@/api/config";
import { grievanceNotSet, mailtoHref, telHref } from "@/model/grievance";
import { useApi } from "@/providers/hooks";
import { GrievanceView, type GrievanceViewState } from "./GrievanceView";

/**
 * The grievance officer from `GET /config`. Development and staging hosts return placeholders, which read as "details not set"; a
 * release build refuses to start with them (the root layout checks), so a real person never sees that state.
 */
export function GrievanceScreen({ onBack }: { onBack: () => void }) {
  const api = useApi();
  const config = useQuery(configQuery(api));
  const officer = config.data?.grievance;

  let state: GrievanceViewState = { kind: "loading" };
  if (officer) state = grievanceNotSet(officer) ? { kind: "not_set" } : { kind: "ready", officer };
  else if (config.isError || config.fetchStatus === "paused") state = { kind: "failed", onRetry: () => void config.refetch() };

  return (
    <GrievanceView
      state={state}
      onBack={onBack}
      onEmail={() => officer && void Linking.openURL(mailtoHref(officer.email))}
      onCall={() => officer && void Linking.openURL(telHref(officer.phone))}
    />
  );
}
