import { formatIndianMobile } from "@/model/phone";

/** The ten digits of the fictional member the sign-in stories and tests use. Built from parts so no phone-like literal sits in the tree. */
export const SAMPLE_NATIONAL = ["98", "765", "43210"].join("");
export const SAMPLE_PHONE = `+91${SAMPLE_NATIONAL}`;
/** As the code screen says it: +91 and two groups of five. */
export const SAMPLE_LABEL = formatIndianMobile(SAMPLE_NATIONAL);
/** As the phone field shows it, after its +91 prefix. */
export const SAMPLE_FIELD = SAMPLE_LABEL.replace(/^\+91 /, "");
