import "leaflet/dist/leaflet.css";
import "./style.css";
import leaflet from "leaflet";
import luck from "./luck";
import "./leafletWorkaround";
import { Cell, Board } from "./board";
import { Coin, Geocache } from "./geocache";

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 1e-2;
const BIN_SPAWN_PROBABILITY = 0.01;
const MAX_ZOOM = 19;
const NULL_ISLAND = leaflet.latLng({
  lat: 0,
  lng: 0,
});

const MERRILL_CLASSROOM = leaflet.latLng({
  lat: 36.9995,
  lng: -122.0533,
});

const mapContainer = document.querySelector<HTMLElement>("#map")!;
const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

let currentBins: leaflet.Rectangle[] = [];
const playerCoins: Coin[] = [];
const playerPos = leaflet.latLng(MERRILL_CLASSROOM);
let playerMarker = leaflet.marker(playerPos);
const momentos = new Map<Cell, string>();

const map = leaflet.map(mapContainer, {
  center: NULL_ISLAND,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: 0,
  zoomControl: true,
  scrollWheelZoom: true,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: MAX_ZOOM,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

leaflet
  .tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      minZoom: 0,
      maxZoom: MAX_ZOOM,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }
  )
  .addTo(map);

const sensorButton = document.querySelector("#sensor")!;
sensorButton.addEventListener("click", () => {
  updatePosition()
    .then(() => {
      playerMarker.setLatLng(leaflet.latLng(playerPos.lat, playerPos.lng));
      updateMap();
      map.setZoom(MAX_ZOOM);
    })
    .catch(() => {
      console.error();
    });
});

let buttonisDown: "north" | "south" | "west" | "east" | null = null;
const northButton = document.querySelector("#north")!;
northButton.addEventListener("mousedown", () => {
  buttonisDown = "north";
});
const southButton = document.querySelector("#south")!;
southButton.addEventListener("mousedown", () => {
  buttonisDown = "south";
});
const westButton = document.querySelector("#west")!;
westButton.addEventListener("mousedown", () => {
  buttonisDown = "west";
});
const eastButton = document.querySelector("#east")!;
eastButton.addEventListener("mousedown", () => {
  buttonisDown = "east";
});
document.addEventListener("mouseup", () => {
  buttonisDown = null;
});
document.addEventListener("mouseleave", () => {
  buttonisDown = null;
});

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

const pointsDisplay: HTMLDivElement = document.createElement("div");
pointsDisplay.id = "pointsDisplay";
pointsDisplay.innerHTML = "No points yet...";
const messages: HTMLDivElement = document.createElement("div");
messages.id = "messages";
statusPanel.append(pointsDisplay, messages);

function updatePosition(): Promise<string> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.watchPosition(
      (position) => {
        playerPos.lat = position.coords.latitude;
        playerPos.lng = position.coords.longitude;
        resolve("success");
      },
      (error) => {
        reject(error);
      }
    );
  });
}
function updatePlayerMarker() {
  playerMarker.remove();
  playerMarker = leaflet.marker(playerPos);
  playerMarker.bindTooltip("You are here");
  playerMarker.addTo(map);
}

function updateMap() {
  updatePlayerMarker();
  map.setView(playerMarker.getLatLng());
  currentBins.forEach((bin) => {
    bin.remove();
  });
  currentBins = [];
  spawnBinsAroundPoint(playerPos);
}

function makeBin(cell: Cell) {
  const geocache: Geocache = new Geocache(cell);

  if (momentos.has(cell)) {
    geocache.fromMomento(momentos.get(cell)!);
  }

  const bin = leaflet.rectangle(board.getCellBounds(cell), { opacity: 1 });
  currentBins.push(bin);

  function updateBinColor() {
    const minMid = 10;
    const maxMid = 30;
    const numCoins = geocache.getNumCoins();
    if (numCoins <= 0) bin.setStyle({ color: "grey" });
    if (numCoins > 0 && numCoins < minMid) bin.setStyle({ color: "red" });
    if (numCoins >= minMid && numCoins < maxMid)
      bin.setStyle({ color: "yellow" });
    if (numCoins >= maxMid) bin.setStyle({ color: "blue" });

    bin.setTooltipContent(`${numCoins} coins`);
  }

  updateBinColor();

  bin.bindPopup(() => {
    const container = document.createElement("div");
    container.innerHTML = `
    <div>There is a bin here at "${cell.i},${
      cell.j
    }". It has <span id="numCoins">${geocache.getNumCoins()} coins.</span>.</div>
      <button id="collect">collect</button>
      <button id="deposit">deposit</button>`;

    function updateUI() {
      container.querySelector<HTMLSpanElement>("#numCoins")!.innerText =
        geocache.getNumCoins().toString();
      pointsDisplay.innerText = `${playerCoins.length} points accumulated`;

      updateBinColor();
      momentos.set(cell, geocache.toMomento()); //cache new bin state
    }
    const collect = container.querySelector<HTMLButtonElement>("#collect")!;
    const deposit = container.querySelector<HTMLButtonElement>("#deposit")!;

    collect.addEventListener("click", () => {
      const popped = geocache.removeCoin();
      if (popped !== undefined) {
        playerCoins.push(popped);
        messages.innerText = `Collected coin: ${popped.toString()}`;
        updateUI();
      }
    });

    deposit.addEventListener("click", () => {
      const popped = playerCoins.pop();
      if (popped !== undefined) {
        geocache.addCoin(popped);
        messages.innerText = `Deposited coin: ${popped.toString()}`;
      }
      updateUI();
    });
    return container;
  });

  bin.addTo(map);
}

function spawnBinsAroundPoint(point: leaflet.LatLng) {
  const nearbyCells = board.getCellsNearPoint(point);
  nearbyCells.forEach((cell) => {
    if (luck([cell.i, cell.j].toString()) < BIN_SPAWN_PROBABILITY) {
      makeBin(cell);
    }
  });
}

function update() {
  // player movement
  if (buttonisDown !== null) {
    switch (buttonisDown) {
      case "north":
        playerPos.lat += TILE_DEGREES;
        updateMap();
        break;
      case "south":
        playerPos.lat -= TILE_DEGREES;
        updateMap();
        break;
      case "west":
        playerPos.lng -= TILE_DEGREES;
        updateMap();
        break;
      case "east":
        playerPos.lng += TILE_DEGREES;
        updateMap();
        break;
    }
  }
  requestAnimationFrame(update);
}
updateMap();
update();
