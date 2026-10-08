import { existsSync } from "node:fs";

export function installerFor(platform = process.platform, has = existsSync) {
  if (platform === "darwin") return "brew install";
  if (platform === "win32") return "winget install";
  if (has("/usr/bin/dnf")) return "sudo dnf install -y";
  if (has("/usr/bin/pacman")) return "sudo pacman -S --needed";
  if (has("/usr/bin/zypper")) return "sudo zypper install -y";
  return "sudo apt-get install -y";
}

const WINGET_NAMES = { gh: "GitHub.cli", kubectl: "Kubernetes.kubectl", awscli: "Amazon.AWSCLI" };

export const installCommand = (pkg, platform = process.platform, has = existsSync) =>
  `${installerFor(platform, has)} ${platform === "win32" ? WINGET_NAMES[pkg] || pkg : pkg}`;
