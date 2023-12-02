import {
    is_iOS,
    Logger,
    Poll,
    sendBackgroundMessage,
    addBackgroundListener,
    removeBackgroundListener,
} from "./utils.js";
import EventDispatcher from "./EventDispatcher.js";
import UKMission from "./UKMission.js";

/** @typedef {"motion module" | "left insole" | "right insole"} UKDeviceType */
/** @typedef {"bluetooth" | "udp"} UKConnectionType */
/** @typedef {"not connected" | "connecting" | "connected" | "disconnecting"} UKConnectionStatus */

/**
 * @typedef UKDiscoveredDeviceInfo
 * @type {object}
 * @property {string} id
 * @property {string} name
 * @property {number} deviceType
 *
 * @property {number} timestampDifference
 * @property {number} rssi
 * @property {string|undefined} ipAddress
 *
 * @property {string} connectionStatus
 * @property {UKConnectionType|undefined} connectionType
 */

export default class UKDiscoveredDevice {
    eventDispatcher = new EventDispatcher();

    /** @type {UKMission|undefined} */
    #mission;
    get mission() {
        return this.#mission;
    }

    #update(type, newValue) {
        this.logger.log(`updated ${type} to ${newValue}`);
        this.eventDispatcher.dispatchEvent({ type: "update" });
        this.eventDispatcher.dispatchEvent({ type, message: { [type]: newValue } });
    }

    /** @type {string} */
    #id;
    get id() {
        return this.#id;
    }
    #updateId(newValue) {
        if (this.#id != newValue) {
            this.#id = newValue;
            this.#update("id", newValue);
        }
    }

    /** @type {string} */
    #name;
    get name() {
        return this.#name;
    }
    #updateName(newValue) {
        if (this.#name != newValue) {
            this.#name = newValue;
            this.#update("name", newValue);
        }
    }

    /** @type {UKDeviceType} */
    #deviceType;
    get deviceType() {
        return this.#deviceType;
    }
    /** @param {UKDeviceType} newValue */
    #updateDeviceType(newValue) {
        if (this.#deviceType != newValue) {
            this.#deviceType = newValue;
            this.#update("deviceType", newValue);
        }
    }

    /** @type {number} */
    #rssi;
    get rssi() {
        return this.#rssi;
    }
    /** @param {number} newValue */
    #updateRssi(newValue) {
        if (this.#rssi != newValue) {
            this.#rssi = newValue;
            this.#update("rssi", newValue);
        }
    }

    /** @type {number} */
    #timestampDifference;
    get timestampDifference() {
        return this.#timestampDifference;
    }
    /** @param {number} newValue */
    #updateTimestampDifference(newValue) {
        if (this.#timestampDifference != newValue) {
            this.#timestampDifference = newValue;
            this.#update("timestampDifference", newValue);
        }
    }

    /** @type {string|undefined} */
    #ipAddress;
    get ipAddress() {
        return this.#ipAddress;
    }
    /** @param {string} newValue */
    #updateIpAddress(newValue) {
        if (this.#ipAddress != newValue) {
            this.#ipAddress = newValue;
            this.#update("ipAddress", newValue);
        }
    }
    get isConnectedToWifi() {
        return Boolean(this.ipAddress);
    }

    /** @type {UKConnectionStatus|undefined} */
    #connectionStatus;
    get connectionStatus() {
        return this.#connectionStatus;
    }
    /** @param {UKConnectionStatus|undefined} newValue */
    #updateConnectionStatus(newValue) {
        this.logger.log(`updateConnectionStatus from ${this.#connectionStatus} to ${newValue}`);
        if (this.#connectionStatus != newValue) {
            this.#connectionStatus = newValue;
            if (newValue == "connected" || newValue == "not connected") {
                this.logger.log("stopping connectionStatusPoll");
                this.#connectionStatusPoll.stop();
            }

            if (newValue == "connected") {
                this.#mission = new UKMission(this);
            } else if (newValue == "not connected" && this.#mission) {
                //this.#mission.destroy();
                //this.#mission = undefined;
            }

            this.#update("connectionStatus", newValue);
        }
    }
    get isConnected() {
        return this.connectionStatus == "connected";
    }

    /** @type {UKConnectionType|undefined} */
    #connectionType;
    get connectionType() {
        return this.#connectionType;
    }
    /** @param {UKConnectionType} newValue */
    #updateConnectionType(newValue) {
        if (this.#connectionType != newValue) {
            this.#connectionType = newValue;
            this.#update("connectionType", newValue);
        }
    }

    /**
     * @param {UKDiscoveredDeviceInfo} discoveredDeviceInfo
     */
    constructor(discoveredDeviceInfo) {
        this.logger = new Logger(false, this, discoveredDeviceInfo.id);
        this.update(discoveredDeviceInfo);

        this.#boundOnBackgroundMessage = this.#onBackgroundMessage.bind(this);
        addBackgroundListener(this.#boundOnBackgroundMessage);
    }

    /**
     * @param {UKDiscoveredDeviceInfo} discoveredDeviceInfo
     */
    update(discoveredDeviceInfo) {
        const { id, name, deviceType, rssi, timestampDifference, ipAddress, connectionStatus, connectionType } =
            discoveredDeviceInfo;

        this.#updateId(id);
        this.#updateName(name);
        this.#updateDeviceType(deviceType);

        this.#updateRssi(rssi);
        this.#updateTimestampDifference(timestampDifference);

        this.#updateIpAddress(ipAddress);

        this.#updateConnectionStatus(connectionStatus);
        this.#updateConnectionType(connectionType);

        this.logger.log(`updated discovered device ${id}`, discoveredDeviceInfo);
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

    #connectionStatusPoll = new Poll(this.#checkConectionStatus.bind(this), 200);
    async #checkConectionStatus() {
        await this.#sendBackgroundMessage({ type: "connectionStatus" });
    }

    /**
     * @param {UKConnectionType} connectionType
     */
    async connect(connectionType = "bluetooth") {
        if (this.connectionStatus == "connected") {
            this.logger.log("can't connect - already connected");
            return;
        }
        if (connectionType != "bluetooth" && is_iOS) {
            this.logger.log(`unable to connect via ${connectionType} on iOS - changing to bluetooth`);
            connectionType = "bluetooth";
        }
        this.logger.log("starting connectionStatusPoll");
        this.#connectionStatusPoll.start();
        await this.#sendBackgroundMessage({ type: "connect", connectionType });
    }
    async disconnect() {
        if (this.connectionStatus == "not connected") {
            this.logger.log("can't disconnect - not connected");
            return;
        }
        this.logger.log("starting connectionStatusPoll");
        this.#connectionStatusPoll.start();
        await this.#sendBackgroundMessage({ type: "disconnect" });
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
            case "name":
                this.#updateName(message.name);
                break;
            case "deviceType":
                this.#updateDeviceType(message.deviceType);
                break;
            case "ipAddress":
                this.#updateIpAddress(message.ipAddress);
                break;
            case "connectionStatus":
                this.#updateConnectionStatus(message.connectionStatus);
                this.#updateConnectionType(message.connectionType);
                break;
            default:
                // this.logger.log(`uncaught message type ${message.type}`);
                break;
        }
    }
    /** @type {function} */
    #boundOnBackgroundMessage;

    destroy() {
        this.logger.log(`destroying self`);
        this.#connectionStatusPoll.stop();
        removeBackgroundListener(this.#boundOnBackgroundMessage);
        this.eventDispatcher.dispatchEvent({ type: "destroy" });
    }
}
