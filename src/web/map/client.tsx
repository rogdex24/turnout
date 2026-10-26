/** Browser entry for /map: hydrates the server-rendered tree from the boot snapshot, then the map takes over. */
import "maplibre-gl/dist/maplibre-gl.css";
import "../ui/styles.css";
import { hydrateRoot } from "react-dom/client";
import type { MapBoot } from "./components/MapApp.js";
import { MapRoot } from "./components/MapRoot.js";

const boot = JSON.parse(document.getElementById("map-boot")!.textContent!) as MapBoot;
hydrateRoot(document.getElementById("root")!, <MapRoot {...boot} />);
