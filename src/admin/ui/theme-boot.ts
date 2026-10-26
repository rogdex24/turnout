import { themeProtocol } from "../../utils/theme";

themeProtocol("class");
// While the choice is "auto", an OS switch changes the page too.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => themeProtocol("class"));

// The favicon is served by the admin server (the same mark as the public site). The HTML bundler
// cannot resolve a root-relative href, so the link is added here.
const icon = document.createElement("link");
icon.rel = "icon";
icon.type = "image/svg+xml";
icon.href = "/favicon.svg";
document.head.append(icon);
