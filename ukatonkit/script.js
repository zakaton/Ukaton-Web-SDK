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

            const toggleQuaternionDataButton = container.querySelector("button.toggleQuaternionData");
            toggleQuaternionDataButton.addEventListener("click", async () => {
                const { mission } = discoveredDevice;
                if (mission) {
                    console.log("toggling motion data");
                    const isQuaternionEnabled = mission.sensorDataConfigurations.motion.quaternion > 0;
                    mission.setSensorDataConfigurations({ motion: { quaternion: isQuaternionEnabled ? 0 : 1000 } });
                }
            });

            const togglePressureDataButton = container.querySelector("button.togglePressureData");
            togglePressureDataButton.addEventListener("click", async () => {
                const { mission } = discoveredDevice;
                if (mission) {
                    console.log("toggling presure data");
                    const isPressureEnabled = mission.sensorDataConfigurations.pressure.pressureSingleByte > 0;
                    mission.setSensorDataConfigurations({
                        pressure: { pressureSingleByte: isPressureEnabled ? 0 : 1000 },
                    });
                }
            });

            const quaternionDataContainer = container.querySelector(".quaternionData");
            discoveredDevice.eventDispatcher.addEventListener("quaternion", (event) => {
                quaternionDataContainer.innerText = JSON.stringify(event.message.quaternion);
            });
            const pressureDataContainer = container.querySelector(".rawPressureData");
            discoveredDevice.eventDispatcher.addEventListener("pressure", (event) => {
                pressureDataContainer.innerText = JSON.stringify(event.message.pressure);
            });

            discoveredDevice.eventDispatcher.addEventListener("sensorDataConfigurations", (event) => {
                const { sensorDataConfigurations } = event.message;
                const isQuaternionEnabled = sensorDataConfigurations.motion.quaternion > 0;
                const isPressureEnabled = sensorDataConfigurations.pressure.pressureSingleByte > 0;

                console.log("isQuaternionEnabled", isQuaternionEnabled);
                console.log("isPressureEnabled", isPressureEnabled);

                toggleQuaternionDataButton.innerText = isQuaternionEnabled
                    ? "disable quaternion data"
                    : "enable quaternion data";
                togglePressureDataButton.innerText = isPressureEnabled
                    ? "disable pressure data"
                    : "enable pressure data";
            });

            const triggerWaveformEffectButton = container.querySelector(".triggerWaveformEffect");
            triggerWaveformEffectButton.addEventListener("click", () => {
                const { mission } = discoveredDevice;
                if (mission) {
                    console.log("triggering waveform effect");
                    mission.vibrateWaveformEffects([2, 3, 4]);
                }
            });

            const triggerWaveformButton = container.querySelector(".triggerWaveform");
            triggerWaveformButton.addEventListener("click", () => {
                const { mission } = discoveredDevice;
                if (mission) {
                    console.log("triggering waveform");
                    mission.vibrateWaveforms([{ intensity: 1, delay: 1000 }]);
                }
            });

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

    container.dataset.connectedToWifi = discoveredDevice.isConnectedToWifi;
    if (discoveredDevice.isConnectedToWifi) {
        container.querySelector(".ipAddress").innerText = discoveredDevice.ipAddress;
    }
}

bluetoothManager.eventDispatcher.addEventListener("discoveredDevices", () => updateDiscoveredDevices());
updateDiscoveredDevices();
