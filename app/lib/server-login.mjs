export const CREDENTIAL_SAVED = "hive: the credential is on the server";

export function loginConfirmed(screen) {
  const said = String(screen || "");
  return /Login successful|Logged in|Successfully/i.test(said) || said.includes(CREDENTIAL_SAVED);
}
