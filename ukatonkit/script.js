import UKDiscoveredDevice from "./UKDiscoveredDevice.js";
import { bluetoothManager, missionsManager } from "./UkatonKit.js";

// SCAN
const toggleScanButton = document.getElementById("toggleScan");
function updateToggleScanButton() {
    toggleScanButton.innerText = bluetoothManager.isScanning ? "scanning for devices..." : "scan for devices";
}
toggleScanButton.addEventListener("click", () => {
    bluetoothManager.toggleScan();
});
updateToggleScanButton();
bluetoothManager.eventDispatcher.addEventListener("isScanning", () => {
    updateToggleScanButton();
});

// DISCOVERED DEVICES
const discoveredDevicesContainer = document.getElementById("discoveredDevices");
/** @type {Object.<string, HTMLElement>} */
const discoveredDeviceContainers = {};
/** @type {HTMLTemplateElement} */
const discoveredDevicesTemplate = document.getElementById("discoveredDeviceTemplate");

function updateDiscoveredDevices() {
    const discoveredDevices = bluetoothManager.discoveredDevices;
    console.log(discoveredDevices);
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

            discoveredDevice.eventDispatcher.addEventListener("update", () => updateDiscoveredDevice(discoveredDevice));

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

    container.querySelector(".rssi").innerText = discoveredDevice.rssi;
    if ("timestampDifference" in discoveredDevice) {
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
