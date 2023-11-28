import EventDispatcher from "./EventDispatcher.js";
import {
    is_iOS,
    Logger,
    Poll,
    sendBackgroundMessage,
    addBackgroundListener,
    removeBackgroundListener,
} from "./utils.js";
import UKDiscoveredDevice from "./UKDiscoveredDevice.js";
import { missionsManager } from "./UkatonKit.js";

/** @typedef {import("./UKDiscoveredDevice.js").UKDeviceType} UKDeviceType */
/** @typedef {import("./UKDiscoveredDevice.js").UKConnectionType} UKConnectionType */
/** @typedef {import("./UKDiscoveredDevice.js").UKConnectionStatus} UKConnectionStatus */

/**
 * @typedef UKSensorDataConfiguration
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

/** @typedef {"waveform" | "sequence"} UKVibrationType */

export default class UKMission {
    logger;

    /** @type {EventDispatcher} */
    #eventDispatcher;
    addEventListener(type, listener) {
        this.#eventDispatcher.addEventListener(type, listener);
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

    /** @type {UKDiscoveredDevice} */
    #discoveredDevice;
    /**
     * @param {UKDiscoveredDevice} discoveredDevice
     */
    #updateDiscoveredDevice(discoveredDevice) {
        this.logger = new Logger(true, this, discoveredDevice.id);

        this.#eventDispatcher = discoveredDevice.eventDispatcher;

        this.#id = discoveredDevice.id;

        this.#discoveredDevice = discoveredDevice;

        this.#name = discoveredDevice.name;
        this.#deviceType = discoveredDevice.deviceType;

        this.#connectionStatus = discoveredDevice.connectionStatus;
        this.#connectionType = discoveredDevice.connectionType;

        this.#ipAddress = discoveredDevice.ipAddress;

        this.#boundOnBackgroundMessage = this.#onBackgroundMessage.bind(this);
        addBackgroundListener(this.#boundOnBackgroundMessage);
    }

    /**
     * @param {UKDiscoveredDevice} discoveredDevice
     */
    constructor(discoveredDevice) {
        super();

        this.#updateDiscoveredDevice(discoveredDevice);

        this.logger.log("adding self");
        missionsManager.add(this);
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
    #id;
    get id() {
        return this.id;
    }

    /** @type {string} */
    #name;
    get name() {
        return this.#name;
    }
    /** @param {string} newName */
    async setName(newName) {
        if (newName != this.#name) {
            // FILL
        }
    }

    /** @type {UKDeviceType} */
    #deviceType;
    get deviceType() {
        return this.#deviceType;
    }
    /** @param {UKDeviceType} newDeviceType */
    async setDeviceType(newDeviceType) {
        if (newDeviceType != this.#deviceType) {
            // FILL
        }
    }

    /** @type {UKConnectionStatus} */
    #connectionStatus;
    get connectionStatus() {
        return this.#connectionStatus;
    }
    get isConnected() {
        return this.#connectionStatus == "connected";
    }

    /** @type {UKConnectionType} */
    #connectionType;
    get connectionType() {
        return this.#connectionType;
    }

    /** @type {string|undefined} */
    #ipAddress;
    get ipAddress() {
        return this.#ipAddress;
    }

    async getSensorDataConfigurations() {
        // FILL
    }
    /** @param {UKSensorDataConfiguration} configurations */
    async setSensorDataConfigurations(configurations = {}) {
        // FILL
    }

    // FILL - SensorData

    async vibrateWaveform(waveform) {
        // FILL
    }
    async vibrateSequence(sequence) {
        // FILL
    }

    destroy() {
        this.logger.log("destroying self");
        missionsManager.remove(this);
    }
}
