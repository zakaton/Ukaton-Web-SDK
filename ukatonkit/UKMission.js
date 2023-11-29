import EventDispatcher from "./EventDispatcher.js";
import { Logger, Poll, sendBackgroundMessage, addBackgroundListener, removeBackgroundListener } from "./utils.js";
import UKDiscoveredDevice from "./UKDiscoveredDevice.js";
import { missionsManager } from "./UkatonKit.js";

/** @typedef {import("./UKDiscoveredDevice.js").UKDeviceType} UKDeviceType */
/** @typedef {import("./UKDiscoveredDevice.js").UKConnectionType} UKConnectionType */
/** @typedef {import("./UKDiscoveredDevice.js").UKConnectionStatus} UKConnectionStatus */

/**
 * @typedef UKSensorDataConfigurations
 * @type {object}
 *
 * @property {object} motion
 * @property {number} motion.acceleration
 * @property {number} motion.gravity
 * @property {number} motion.linearAcceleration
 * @property {number} motion.rotationRate
 * @property {number} motion.magnetometer
 * @property {number} motion.quaternion
 *
 * @property {object} pressure
 * @property {number} pressure.pressureSingleByte
 * @property {number} pressure.pressureDoubleByte
 * @property {number} pressure.centerOfMass
 * @property {number} pressure.mass
 * @property {number} pressure.heelToToe
 */

/**
 * @typedef UKVibrationWaveform
 * @type {object}
 * @property {number} intensity
 * @property {number} delay
 */

/** @typedef {"waveform" | "sequence"} UKVibrationType */

export default class UKMission {
    /** @type {Logger} */
    logger;
    /** @type {UKDiscoveredDevice} */
    #discoveredDevice;

    /** @type {EventDispatcher} */
    #eventDispatcher;
    addEventListener(type, listener, options) {
        this.#eventDispatcher.addEventListener(type, listener, options);
    }
    hasEventListener(type, listener) {
        this.#eventDispatcher.hasEventListener(type, listener);
    }
    removeEventListener(type, listener) {
        this.#eventDispatcher.removeEventListener(type, listener);
    }
    dispatchEvent(event) {
        this.#eventDispatcher.dispatchEvent(event);
    }

    /**
     * @param {UKDiscoveredDevice} discoveredDevice
     */
    constructor(discoveredDevice) {
        this.logger = new Logger(true, this, discoveredDevice.id);
        this.#discoveredDevice = discoveredDevice;
        this.#eventDispatcher = discoveredDevice.eventDispatcher;

        this.logger.log("adding self");
        missionsManager.add(this);

        this.#boundOnBackgroundMessage = this.#onBackgroundMessage.bind(this);
        addBackgroundListener(this.#boundOnBackgroundMessage);
    }

    /**
     *
     * @param {object} message
     * @param {string} message.type
     */
    async #sendBackgroundMessage(message) {
        Object.assign(message, { id: this.id });
        return sendBackgroundMessage(message);
    }

    /**
     * @param {object} message
     * @param {string} message.type
     */
    #onBackgroundMessage(message) {
        if (message.id != this.id) {
            return;
        }

        this.logger.log(`received background message of type ${message.type}`, message);
        switch (message.type) {
            case "sensorDataConfigurations":
                this.#updateSensorDataConfigurations(message.sensorDataConfigurations);
                break;
            case "sensorData":
                // FILL
                break;
            default:
                this.logger.log(`uncaught message type ${message.type}`);
                break;
        }
    }
    /** @type {function} */
    #boundOnBackgroundMessage;

    /**
     * @param {UKConnectionType} connectionType
     */
    async connect(connectionType) {
        await this.#discoveredDevice.connect(connectionType);
    }
    async disconnect() {
        await this.#discoveredDevice.disconnect();
    }

    /** @type {string} */
    get id() {
        return this.#discoveredDevice.id;
    }

    /** @type {string} */
    get name() {
        return this.#discoveredDevice.name;
    }
    /** @param {string} newName */
    async setName(newName) {
        if (newName != this.name) {
            // FILL
        }
    }

    /** @type {UKDeviceType} */
    get deviceType() {
        return this.#discoveredDevice.deviceType;
    }
    /** @param {UKDeviceType} newDeviceType */
    async setDeviceType(newDeviceType) {
        if (newDeviceType != this.deviceType) {
            // FILL
        }
    }

    /** @type {UKConnectionStatus} */
    get connectionStatus() {
        return this.#discoveredDevice.connectionStatus;
    }
    get isConnected() {
        return this.connectionStatus == "connected";
    }

    /** @type {UKConnectionType} */
    get connectionType() {
        return this.#discoveredDevice.connectionType;
    }

    /** @type {string|undefined} */
    get ipAddress() {
        return this.#discoveredDevice.ipAddress;
    }

    /** @type {UKSensorDataConfigurations} */
    #sensorDataConfigurations;
    /** @param {UKSensorDataConfigurations} newValue */
    #updateSensorDataConfigurations(newValue) {
        this.#sensorDataConfigurations = newValue;
        this.dispatchEvent({ type: "sensorDataConfigurations", message: { sensorDataConfigurations: newValue } });
    }

    async getSensorDataConfigurations() {
        if (this.#sensorDataConfigurations) {
            return this.#sensorDataConfigurations;
        }
        const promise = this.#waitForSensorDataConfigurations();
        this.#sendBackgroundMessage({ type: "getSensorDataConfigurations" });
        return promise;
    }
    /** @param {UKSensorDataConfigurations} sensorDataConfigurations */
    async setSensorDataConfigurations(sensorDataConfigurations = {}) {
        const promise = this.#waitForSensorDataConfigurations();
        this.#sendBackgroundMessage({ type: "setSensorDataConfigurations", sensorDataConfigurations });
        this.#sensorDataConfigurationsPoll.start();
        return promise;
    }
    async #waitForSensorDataConfigurations() {
        return new Promise((resolve) => {
            this.addEventListener(
                "sensorDataConfigurations",
                (event) => {
                    this.logger.log("received sensorDataConfigurations", event);
                    this.#sensorDataConfigurationsPoll.stop();
                    resolve(event.message.sensorDataConfigurations);
                },
                { once: true }
            );
        });
    }

    #sensorDataConfigurationsPoll = new Poll(this.#checkSensorDataConfigurations.bind(this), 200);
    async #checkSensorDataConfigurations() {
        await this.#sendBackgroundMessage({ type: "getSensorDataConfigurations" });
    }

    // FILL - SensorData

    /**
     * @param {[number]} waveformEffects
     */
    async vibrateWaveformEffects(waveformEffects) {
        await this.#sendBackgroundMessage({ type: "vibrateWaveformEffects", waveformEffects });
    }
    /**
     * @param {[UKVibrationWaveform]} waveforms
     */
    async vibrateWaveforms(waveforms) {
        await this.#sendBackgroundMessage({ type: "vibrateWaveforms", waveforms });
    }

    destroy() {
        this.logger.log("destroying self");
        removeBackgroundListener(this.#boundOnBackgroundMessage);
        this.#sensorDataConfigurationsPoll.stop();
        missionsManager.remove(this);
    }
}
