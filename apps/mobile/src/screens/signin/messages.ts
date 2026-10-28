import { signin } from "@/copy/signin";
import type { SendFailure, VerifyFailure } from "@/model/otpFlow";

export function sendFailureText(failure: SendFailure): string {
  const text = signin.phone.errors;
  switch (failure.kind) {
    case "bad_phone":
      return text.badPhone;
    case "refused":
      return text.refused;
    case "paused":
      return text.paused;
    case "wait":
      return text.wait(failure.seconds);
    case "could_not_send":
      return text.couldNotSend;
    case "offline":
      return text.offline;
    case "server":
      return text.server;
  }
}

/** The same failures, as the code screen says them when a new code was asked for. */
export function resendFailureText(failure: SendFailure): string {
  const text = signin.code;
  switch (failure.kind) {
    case "refused":
      return text.refused;
    case "paused":
      return text.paused;
    case "wait":
      return text.wait(failure.seconds);
    case "could_not_send":
      return text.couldNotSend;
    case "offline":
      return text.offline;
    case "bad_phone":
    case "server":
      return text.server;
  }
}

export function verifyFailureText(failure: VerifyFailure): string {
  const text = signin.code;
  switch (failure.kind) {
    case "wrong_code":
      return text.wrong(failure.triesLeft);
    case "too_many_tries":
      return text.tooManyTries;
    case "refused":
      return text.refused;
    case "update_app":
      return text.updateApp;
    case "wait":
      return text.wait(failure.seconds);
    case "offline":
      return text.offline;
    case "server":
      return text.server;
  }
}
