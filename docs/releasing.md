# Releasing

A commit to `main` runs the tests (`.github/workflows/ci.yml`) and nothing else.
No app is built on a commit. A release is a decision someone takes.

## Cutting a release

1. Check that the ci run of the commit on `main` you want to ship is green.
2. Open **Actions → release → Run workflow** on GitHub, or run:

   ```
   gh workflow run release.yml -R <owner>/hive
   ```

3. Wait for the run. It builds the app on GitHub's own machines and publishes
   one release with every platform in it:

   | Platform | Files |
   |---|---|
   | macOS (Apple silicon) | `Hive-arm64.dmg`, `Hive-arm64.zip` |
   | Linux (x86_64) | `Hive-x86_64.AppImage`, `Hive-x86_64.rpm` |
   | Windows (x64) | `Hive-x64.exe` |

The run stops at its first step if the ci run of that commit did not pass.

The release is tagged `hive-<date>-<short sha>` and titled `Hive <number>`.
The number counts the commits that changed the app, the server or the release
scripts. Each installed hive reads the releases of the repository it was built
from, offers the newest one, and lists what changed since its own commit, from
the commit messages. Write those messages for the person who updates.

Only the ten newest releases are kept. An older one stays while it still holds
the newest build of some platform.

## Signing

Without secrets, the apps go out unsigned. macOS asks the first person who
opens the app to allow it in **System Settings → Privacy & Security**, and
Windows shows its SmartScreen warning once.

To sign the macOS app, add these secrets to the repository:

| Secret | What |
|---|---|
| `MACOS_CERTIFICATE_P12` | a Developer ID Application certificate, as base64 |
| `MACOS_CERTIFICATE_PASSWORD` | its password |
| `APPLE_API_KEY_P8` | an App Store Connect API key, as base64, to notarize |
| `APPLE_API_KEY_ID` | that key's id |
| `APPLE_API_ISSUER` | that key's issuer |

With the certificate alone the app is signed but not notarized. With the
API key as well it is notarized too.
