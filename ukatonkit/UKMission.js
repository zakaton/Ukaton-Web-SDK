import EventDispatcher from "./EventDispatcher.js";
import { Logger, Poll, sendBackgroundMessage, addBackgroundListener, removeBackgroundListener } from "./utils.js";
import UKDiscoveredDevice from "./UKDiscoveredDevice.js";
import { missionsManager } from "./UkatonKit.js";
import { Vector2, Vector3, Quaternion, Euler } from "./three.module.min.js";

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

        this.#sendBackgroundMessage({ type: "getSensorDataConfigurations" });
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
                this.#updateSensorData(message.sensorData, message.timestamp);
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
    get sensorDataConfigurations() {
        return this.#sensorDataConfigurations;
    }
    /** @param {UKSensorDataConfigurations} newValue */
    #updateSensorDataConfigurations(newValue) {
        if (this.#isSensorDataConfigurationsDifferent(newValue)) {
            this.#sensorDataConfigurations = newValue;
            this.logger.log("stopping sensorDataConfigurationsPoll");
            this.#sensorDataConfigurationsPoll.stop();

            this.logger.log(`updated sensorDataConfigurations ${JSON.stringify(newValue)}`);

            this.dispatchEvent({ type: "sensorDataConfigurations", message: { sensorDataConfigurations: newValue } });

            if (this.#isSensorDataConfigurationsEmpty) {
                this.#sensorDataPoll.stop();
            } else {
                this.#sensorDataPoll.interval = this.#shortestSensorDataConfigurationInterval;
                this.#sensorDataPoll.start();
            }
        }
    }
    /**
     *
     * @param {UKSensorDataConfigurations} sensorDataConfigurations
     * @returns {boolean}
     */
    #isSensorDataConfigurationsDifferent(sensorDataConfigurations) {
        if (!this.#sensorDataConfigurations) {
            return true;
        }

        console.log(sensorDataConfigurations, this.#sensorDataConfigurations);

        var isDifferent = false;
        loop: for (const sensorType in sensorDataConfigurations) {
            for (const sensorDataType in sensorDataConfigurations[sensorType]) {
                if (
                    sensorDataConfigurations[sensorType][sensorDataType] !=
                    this.#sensorDataConfigurations[sensorType][sensorDataType]
                ) {
                    isDifferent = true;
                    break loop;
                }
            }
        }
        return isDifferent;
    }
    /** @type {number} */
    get #shortestSensorDataConfigurationInterval() {
        var shortestInterval = Infinity;
        for (const sensorType in this.#sensorDataConfigurations) {
            for (const sensorDataType in this.#sensorDataConfigurations[sensorType]) {
                const interval = this.#sensorDataConfigurations[sensorType][sensorDataType];
                if (interval > 0) {
                    shortestInterval = Math.min(shortestInterval, interval);
                }
            }
        }
        return shortestInterval;
    }
    /** @type {boolean} */
    get #isSensorDataConfigurationsEmpty() {
        var isEmpty = true;
        traversal: for (const sensorType in this.#sensorDataConfigurations) {
            for (const sensorDataType in this.#sensorDataConfigurations[sensorType]) {
                if (this.#sensorDataConfigurations[sensorType][sensorDataType] > 0) {
                    isEmpty = false;
                    break traversal;
                }
            }
        }
        this.logger.log(`isSensorDataConfigurationsEmpty? ${isEmpty}`);
        return isEmpty;
    }

    /** @param {UKSensorDataConfigurations} sensorDataConfigurations */
    async setSensorDataConfigurations(sensorDataConfigurations) {
        if (!this.#isSensorDataConfigurationsDifferent(sensorDataConfigurations)) {
            this.logger.log("redundant sensorDataConfigurations");
            return;
        }
        this.logger.log("starting sensorDataConfigurationsPoll");
        this.#sensorDataConfigurationsPoll.start();
        this.#sendBackgroundMessage({ type: "setSensorDataConfigurations", sensorDataConfigurations });
    }

    #sensorDataConfigurationsPoll = new Poll(this.#checkSensorDataConfigurations.bind(this), 50);
    async #checkSensorDataConfigurations() {
        await this.#sendBackgroundMessage({ type: "getSensorDataConfigurations" });
    }

    /** @type {object} */
    #sensorData;
    #updateSensorData(sensorData, timestamp) {
        this.#sensorData = sensorData;
        this.logger.log("received sensor data", sensorData);
        for (const sensorType in sensorData) {
            for (const sensorDataType in sensorData[sensorType]) {
                const value = sensorData[sensorType][sensorDataType];
                this.#onSensorData(sensorType, sensorDataType, value, timestamp);
            }
        }
    }
    #onSensorData(sensorType, sensorDataType, value, timestamp) {
        switch (sensorType) {
            case "motion":
                switch (sensorDataType) {
                    case "acceleration":
                    case "gravity":
                    case "linearAcceleration":
                    case "rotationRate":
                    case "magnetometer":
                        const vector = new Vector3(...value);
                        this.dispatchEvent({ type: sensorDataType, message: { [sensorDataType]: vector, timestamp } });
                        break;
                    case "quaternion":
                        const quaternion = new Quaternion(...value);
                        this.dispatchEvent({ type: "quaternion", message: { quaternion, timestamp } });

                        const euler = new Euler().setFromQuaternion(quaternion);
                        euler.reorder("YXZ");
                        this.dispatchEvent({ type: "euler", message: { euler, timestamp } });
                        break;
                    default:
                        this.logger.log(`uncaught motion data type ${sensorDataType}`);
                        break;
                }
                break;
            case "pressure":
                switch (sensorDataType) {
                    case "pressureSingleByte":
                    case "pressureDoubleByte":
                        this.dispatchEvent({ type: "pressure", message: { pressure: value, timestamp } });
                        this.dispatchEvent({ type: sensorDataType, message: { [sensorDataType]: value, timestamp } });
                        break;
                    case "centerOfMass":
                    case "mass":
                    case "heelToToe":
                        this.dispatchEvent({ type: sensorDataType, message: { [sensorDataType]: value, timestamp } });
                        break;
                    default:
                        this.logger.log(`uncaught pressure data type ${sensorDataType}`);
                        break;
                }
                break;
            default:
                this.logger.log(`uncaught sensor type ${sensorType}`);
                break;
        }
    }

    #sensorDataPoll = new Poll(this.#checkSensorData.bind(this), 200);
    async #checkSensorData() {
        await this.#sendBackgroundMessage({ type: "sensorData" });
    }

    /**
     * @param {[number]} waveformEffects
     */
    async vibrateWaveformEffects(waveformEffects) {
        await this.#sendBackgroundMessage({
            type: "vibrate",
            vibrationType: "waveformEffects",
            vibration: waveformEffects,
        });
    }
    /**
     * @param {[UKVibrationWaveform]} waveforms
     */
    async vibrateWaveforms(waveforms) {
        await this.#sendBackgroundMessage({ type: "vibrate", vibrationType: "waveforms", vibration: waveforms });
    }

    destroy() {
        this.logger.log("destroying self");
        removeBackgroundListener(this.#boundOnBackgroundMessage);
        this.#sensorDataConfigurationsPoll.stop();
        this.#sensorDataPoll.stop();
        missionsManager.remove(this);
    }
}
