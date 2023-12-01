import UKDiscoveredDevice from "./UKDiscoveredDevice.js";
import { bluetoothManager, missionsManager } from "./UkatonKit.js";
import { is_iOS } from "./utils.js";

if (is_iOS) {
    document.body.classList.add("iOS");
}

// SCAN
const toggleScanButton = document.getElementById("toggleScan");
function updateToggleScanButton() {
    if (bluetoothManager.isScanning) {
        toggleScanButton.classList.add("pulsating");
    } else {
        toggleScanButton.classList.remove("pulsating");
    }
    toggleScanButton.innerText = bluetoothManager.isScanning ? "scanning for devices..." : "scan for devices";
}
toggleScanButton.addEventListener("click", () => {
    bluetoothManager.toggleScan();
});
updateToggleScanButton();

// DISCOVERED DEVICES
const discoveredDevicesContainer = document.getElementById("discoveredDevices");
/** @type {Object.<string, HTMLElement>} */
const discoveredDeviceContainers = {};
/** @type {HTMLTemplateElement} */
const discoveredDevicesTemplate = document.getElementById("discoveredDeviceTemplate");
function updateDiscoveredDevicesContainer() {
    discoveredDevicesContainer.dataset.isScanning = bluetoothManager.isScanning;
}
updateDiscoveredDevicesContainer();

bluetoothManager.eventDispatcher.addEventListener("isScanning", () => {
    updateToggleScanButton();
    updateDiscoveredDevicesContainer();
});

function updateDiscoveredDevices() {
    const discoveredDevices = bluetoothManager.discoveredDevices;
    console.log("discoveredDevices", discoveredDevices);
    for (const id in discoveredDevices) {
        const discoveredDevice = discoveredDevices[id];
        var container = discoveredDeviceContainers[id];
        if (!container) {
            container = discoveredDevicesTemplate.cloneNode(true).content.querySelector(".discoveredDevice");

            container.querySelector("button.connect.bluetooth").addEventListener("click", () => {
                discoveredDevice.connect("bluetooth");
            });
            container.querySelector("button.connect.udp").addEventListener("click", () => {
                discoveredDevice.connect("udp");
            });
            container.querySelector("button.connect.cancel").addEventListener("click", () => {
                discoveredDevice.disconnect();
            });
            container.querySelector("button.disconnect").addEventListener("click", () => {
                discoveredDevice.disconnect();
            });

            container._destroy = () => {
                delete discoveredDeviceContainers[id];
                container.remove();
            };

            discoveredDevice.eventDispatcher.addEventListener("update", () => updateDiscoveredDevice(discoveredDevice));
            discoveredDevice.eventDispatcher.addEventListener("destroy", () => container._destroy(), { once: true });

            discoveredDeviceContainers[id] = container;
            discoveredDevicesContainer.appendChild(container);
        }

        updateDiscoveredDevice(discoveredDevice);
    }
}

/**
 * @param {UKDiscoveredDevice} discoveredDevice
 */
function updateDiscoveredDevice(discoveredDevice) {
    var container = discoveredDeviceContainers[discoveredDevice.id];

    container.querySelector(".name").innerText = discoveredDevice.name;
    container.dataset.deviceType = discoveredDevice.deviceType;
    container.querySelector(".deviceType").innerText = discoveredDevice.deviceType;

    container.dataset.connectionStatus = discoveredDevice.connectionStatus;
    container.dataset.isConnected = discoveredDevice.isConnected;
    container.querySelectorAll(".connectionType").forEach((span) => (span.innerText = discoveredDevice.connectionType));

    container.querySelector(".rssi").innerText = discoveredDevice.rssi;
    if (discoveredDevice.timestampDifference) {
        container.querySelector(".timestampDifference").innerText = discoveredDevice.timestampDifference.toFixed(3);
    }

    if (discoveredDevice.isConnectedToWifi) {
        container.querySelector(".ipAddress").innerText = discoveredDevice.ipAddress;
        container.classList.add("connectedToWifi");
    } else {
        container.classList.remove("connectedToWifi");
    }
}

bluetoothManager.eventDispatcher.addEventListener("discoveredDevices", () => updateDiscoveredDevices());
updateDiscoveredDevices();
