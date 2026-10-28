import { createContext, use } from "react";
import type { OnboardingStep } from "../model/gates";

export const StepContext = createContext<OnboardingStep>("welcome");

/** The step the root layout settled on. The onboarding layout reads it to open one screen at a time. */
export function useStep(): OnboardingStep {
  return use(StepContext);
}
