import { randomBytes } from "node:crypto";
import { type CryptoKey, calculateJwkThumbprint, exportJWK, generateKeyPair, importPKCS8, importSPKI, type KeyObject } from "jose";
import { DEFAULT_TUNABLES, type Tunables, tunables } from "../social/model/tunables.js";
import type { S3Config } from "../utils/objectStore.js";

export const TURNOUT_ENVS = ["production", "staging", "development", "test"] as const;
export type TurnoutEnv = (typeof TURNOUT_ENVS)[number];

type KeyLike = CryptoKey | KeyObject;

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  appSecret: string;
  verifyToken: string;
}

export interface JwtKeys {
  privateKey: KeyLike;
  publicKey: KeyLike;
  /** The key before the last change. Tokens it signed stay valid until they expire. */
  previousPublicKey: KeyLike | null;
  kid: string;
}

export interface AppConfig {
  env: TurnoutEnv;
  otpPepper: string;
  banPepper: string;
  fileLinkSecret: string;
  jwt: JwtKeys;
  whatsapp: WhatsAppConfig | null;
  otpSender: "whatsapp" | "fake";
  /** Exact E.164 numbers outside +91 that may sign in (test phones). */
  phoneAllowlist: readonly string[];
  reviewer: { phone: string; code: string } | null;
  /** Numbers the fake sender reports as unreachable on WhatsApp (staging and tests only). */
  fakeUndeliverable: readonly string[];
  /** The request header that carries the client address behind the proxy, lower case; null means use the socket's address. */
  trustProxyHeader: string | null;
  minAppVersion: string;
  support: { email: string };
  grievance: { name: string; address: string; email: string; phone: string };
  push: { android: boolean; ios: boolean };
  /** `expo` sends through Expo's push service; `fake` sends nothing (tests, development, staging). */
  pushSender: "expo" | "fake";
  /** Optional: only needed when the Expo project turns on enhanced push security. */
  expoAccessToken: string | null;
  alertWebhookUrl: string | null;
  stagingTestToken: string | null;
  objectStore: "disk" | "s3" | "memory";
  filesDir: string;
  s3: S3Config | null;
  tunables: Tunables;
  /** Names (never values) of the settings that were missing and filled with a random value for this run. */
  ephemeral: readonly string[];
}

/** Startup refused: the message names what is wrong, never a value. */
export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

/** The staging test routes can read any sign-in code, so their token is not a short word. */
export const STAGING_TEST_TOKEN_MIN_LENGTH = 32;

const REVIEWER_PHONE = /^\+1\d{3}55501\d{2}$/;
const E164 = /^\+[1-9]\d{6,14}$/;
const VERSION = /^\d+\.\d+\.\d+$/;

function clean(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

/** A PEM set in an environment variable often has its line breaks written as `\n`. */
function pem(value: string): string {
  return value.replace(/\\n/g, "\n");
}

async function thumbprint(publicKey: KeyLike): Promise<string> {
  return (await calculateJwkThumbprint(await exportJWK(publicKey))).slice(0, 16);
}

/**
 * Reads and checks every setting the app API needs. Production refuses to start without the grievance block, the secrets, the signing
 * keys and the WhatsApp settings, and refuses the fake sender. The other environments fill a missing secret with a random one for this
 * run (sessions then end at a restart) and say which, by name, in `ephemeral`. With `requireEnv` (the `serve` command) a missing
 * `TURNOUT_ENV` is refused instead of meaning development. `STAGING_TEST_TOKEN`, when set, must be at least 32 characters.
 */
export async function loadAppConfig(env: Env, options: { requireEnv?: boolean } = {}): Promise<AppConfig> {
  const problems: string[] = [];
  // A served process must say what it is: a missing name must never quietly turn on the development fakes.
  if (options.requireEnv && clean(env.TURNOUT_ENV) === undefined) {
    throw new ConfigError(`TURNOUT_ENV is required: set it to ${TURNOUT_ENVS.filter((name) => name !== "test").join(", ")}`);
  }
  const rawEnv = clean(env.TURNOUT_ENV) ?? "development";
  if (!(TURNOUT_ENVS as readonly string[]).includes(rawEnv)) {
    throw new ConfigError(`TURNOUT_ENV must be one of ${TURNOUT_ENVS.join(", ")}`);
  }
  const turnoutEnv = rawEnv as TurnoutEnv;
  const production = turnoutEnv === "production";
  const ephemeral: string[] = [];

  const need = (name: string): string => {
    const value = clean(env[name]);
    if (value === undefined && production) problems.push(`${name} is required in production`);
    return value ?? "";
  };
  const secret = (name: string): string => {
    const value = clean(env[name]);
    if (value !== undefined) return value;
    if (production) problems.push(`${name} is required in production`);
    ephemeral.push(name);
    return randomBytes(32).toString("base64url");
  };

  const grievance = {
    name: need("GRIEVANCE_NAME"),
    address: need("GRIEVANCE_ADDRESS"),
    email: need("GRIEVANCE_EMAIL"),
    phone: need("GRIEVANCE_PHONE"),
  };
  // The notice and the store page show these; outside production a visible placeholder is better than a blank.
  if (!production) {
    grievance.name ||= "Grievance officer (not set)";
    grievance.address ||= "Address not set";
    grievance.email ||= "grievance@example.com";
    grievance.phone ||= "+1 202 555 0100";
  }

  const otpPepper = secret("OTP_PEPPER");
  const banPepper = secret("BAN_PEPPER");
  const fileLinkSecret = secret("FILE_LINK_SECRET");

  // Signing keys.
  let jwt: JwtKeys | null = null;
  const privatePem = clean(env.AUTH_JWT_PRIVATE_KEY);
  const publicPem = clean(env.AUTH_JWT_PUBLIC_KEY);
  try {
    if (privatePem !== undefined && publicPem !== undefined) {
      const privateKey = await importPKCS8(pem(privatePem), "ES256");
      const publicKey = await importSPKI(pem(publicPem), "ES256");
      const previousPem = clean(env.AUTH_JWT_PREVIOUS_PUBLIC_KEY);
      const previousPublicKey = previousPem === undefined ? null : await importSPKI(pem(previousPem), "ES256");
      jwt = { privateKey, publicKey, previousPublicKey, kid: await thumbprint(publicKey) };
    } else if (production) {
      problems.push("AUTH_JWT_PRIVATE_KEY and AUTH_JWT_PUBLIC_KEY are required in production");
    } else if (privatePem !== undefined || publicPem !== undefined) {
      problems.push("AUTH_JWT_PRIVATE_KEY and AUTH_JWT_PUBLIC_KEY go together");
    } else {
      const pair = await generateKeyPair("ES256");
      jwt = { privateKey: pair.privateKey, publicKey: pair.publicKey, previousPublicKey: null, kid: await thumbprint(pair.publicKey) };
      ephemeral.push("AUTH_JWT_PRIVATE_KEY", "AUTH_JWT_PUBLIC_KEY");
    }
  } catch {
    problems.push("AUTH_JWT_PRIVATE_KEY, AUTH_JWT_PUBLIC_KEY or AUTH_JWT_PREVIOUS_PUBLIC_KEY is not a valid ES256 PEM key");
  }

  // WhatsApp and the sender in use.
  const whatsappValues = {
    accessToken: clean(env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: clean(env.WHATSAPP_PHONE_NUMBER_ID),
    templateName: clean(env.WHATSAPP_TEMPLATE_NAME),
    appSecret: clean(env.WHATSAPP_APP_SECRET),
    verifyToken: clean(env.WHATSAPP_VERIFY_TOKEN),
  };
  const whatsappComplete = Object.values(whatsappValues).every((v) => v !== undefined);
  const senderChoice = clean(env.OTP_SENDER);
  if (senderChoice !== undefined && senderChoice !== "whatsapp" && senderChoice !== "fake") {
    problems.push("OTP_SENDER must be whatsapp or fake");
  }
  let otpSender: "whatsapp" | "fake";
  if (production) {
    if (senderChoice === "fake") problems.push("OTP_SENDER=fake is not allowed in production");
    otpSender = "whatsapp";
  } else if (senderChoice === "whatsapp") {
    otpSender = "whatsapp";
  } else if (senderChoice === "fake") {
    otpSender = "fake";
  } else {
    // Staging and tests never message anyone; development does only when asked.
    otpSender = "fake";
  }
  if (otpSender === "whatsapp" && !whatsappComplete) {
    problems.push(
      "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME, WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN are required for the WhatsApp sender",
    );
  }
  // The webhook works whenever its two secrets are set, even with the fake sender (staging can test it).
  const whatsapp = whatsappComplete ? (whatsappValues as WhatsAppConfig) : null;

  // Test phones and the reviewer.
  const allowlist = (clean(env.TEST_PHONE_ALLOWLIST) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of allowlist) if (!E164.test(entry)) problems.push("TEST_PHONE_ALLOWLIST entries must be E.164 numbers");
  const reviewerPhone = clean(env.REVIEWER_PHONE);
  const reviewerCode = clean(env.REVIEWER_OTP);
  let reviewer: AppConfig["reviewer"] = null;
  if (reviewerPhone !== undefined || reviewerCode !== undefined) {
    if (reviewerPhone === undefined || reviewerCode === undefined) problems.push("REVIEWER_PHONE and REVIEWER_OTP go together");
    else if (!REVIEWER_PHONE.test(reviewerPhone)) problems.push("REVIEWER_PHONE must be a +1 <area> 555-01xx number");
    else if (!/^\d{6}$/.test(reviewerCode)) problems.push("REVIEWER_OTP must be 6 digits");
    else reviewer = { phone: reviewerPhone, code: reviewerCode };
  }
  if (production && allowlist.some((entry) => entry !== reviewer?.phone)) {
    problems.push("TEST_PHONE_ALLOWLIST may hold only the reviewer number in production");
  }
  const fakeUndeliverable = (clean(env.FAKE_UNDELIVERABLE_PHONES) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of fakeUndeliverable) if (!E164.test(entry)) problems.push("FAKE_UNDELIVERABLE_PHONES entries must be E.164 numbers");
  const phoneAllowlist = [...new Set([...allowlist, ...(reviewer ? [reviewer.phone] : [])])];

  // Numbers and switches.
  let dailyCap = DEFAULT_TUNABLES.otp.dailyCap;
  const capText = clean(env.OTP_DAILY_CAP);
  if (capText !== undefined) {
    if (!/^\d{1,6}$/.test(capText)) problems.push("OTP_DAILY_CAP must be a whole number");
    else dailyCap = Number(capText);
  }
  const minAppVersion = clean(env.MIN_APP_VERSION) ?? "1.0.0";
  if (!VERSION.test(minAppVersion)) problems.push("MIN_APP_VERSION must look like 1.0.0");
  const platforms = (clean(env.PUSH_PLATFORMS) ?? "android").split(",").map((p) => p.trim());
  for (const platform of platforms)
    if (platform && platform !== "android" && platform !== "ios") problems.push("PUSH_PLATFORMS holds android, ios or both");

  const pushChoice = clean(env.PUSH_SENDER);
  if (pushChoice !== undefined && pushChoice !== "expo" && pushChoice !== "fake") problems.push("PUSH_SENDER must be expo or fake");
  if (production && pushChoice === "fake") problems.push("PUSH_SENDER=fake is not allowed in production");
  // Like the code sender, a served production process always pushes for real; the other environments send nothing unless asked.
  const pushSender: "expo" | "fake" = production || pushChoice === "expo" ? "expo" : "fake";

  const store = clean(env.OBJECT_STORE) ?? (turnoutEnv === "test" ? "memory" : "disk");
  if (store !== "disk" && store !== "s3" && store !== "memory") problems.push("OBJECT_STORE must be disk, s3 or memory");
  if (production && store === "memory") problems.push("OBJECT_STORE=memory is not allowed in production");
  let s3: S3Config | null = null;
  if (store === "s3") {
    const parts = {
      bucket: clean(env.S3_BUCKET),
      endpoint: clean(env.S3_ENDPOINT),
      region: clean(env.S3_REGION),
      accessKeyId: clean(env.S3_ACCESS_KEY_ID),
      secretAccessKey: clean(env.S3_SECRET_ACCESS_KEY),
    };
    if (parts.bucket === undefined || parts.accessKeyId === undefined || parts.secretAccessKey === undefined) {
      problems.push("S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for OBJECT_STORE=s3");
    } else {
      s3 = {
        bucket: parts.bucket,
        accessKeyId: parts.accessKeyId,
        secretAccessKey: parts.secretAccessKey,
        endpoint: parts.endpoint,
        region: parts.region,
      };
    }
  }

  const alertWebhookUrl = clean(env.OPERATOR_ALERT_WEBHOOK_URL) ?? null;
  if (alertWebhookUrl !== null && !/^https:\/\//.test(alertWebhookUrl)) problems.push("OPERATOR_ALERT_WEBHOOK_URL must be an https URL");

  const stagingTestToken = clean(env.STAGING_TEST_TOKEN) ?? null;
  if (!production && stagingTestToken !== null && stagingTestToken.length < STAGING_TEST_TOKEN_MIN_LENGTH) {
    problems.push(`STAGING_TEST_TOKEN must be at least ${STAGING_TEST_TOKEN_MIN_LENGTH} characters`);
  }

  const supportEmail = clean(env.SUPPORT_EMAIL) ?? grievance.email;

  if (problems.length > 0 || jwt === null) throw new ConfigError(`Settings problem: ${problems.join("; ")}`);

  return {
    env: turnoutEnv,
    otpPepper,
    banPepper,
    fileLinkSecret,
    jwt,
    whatsapp,
    otpSender,
    phoneAllowlist,
    reviewer,
    fakeUndeliverable,
    trustProxyHeader: clean(env.TRUST_PROXY_HEADER)?.toLowerCase() ?? null,
    minAppVersion,
    support: { email: supportEmail },
    grievance,
    push: { android: platforms.includes("android"), ios: platforms.includes("ios") },
    pushSender,
    expoAccessToken: clean(env.EXPO_ACCESS_TOKEN) ?? null,
    alertWebhookUrl,
    // The staging test routes exist only outside production, and only with a token.
    stagingTestToken: production ? null : stagingTestToken,
    objectStore: store as AppConfig["objectStore"],
    filesDir: clean(env.FILES_DIR) ?? "data/files",
    s3,
    tunables: tunables({ otp: { dailyCap } }),
    ephemeral,
  };
}
