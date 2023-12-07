import EventDispatcher from "./EventDispatcher.js";
import { Poll, Logger, sendBackgroundMessage, addBackgroundListener } from "./utils.js";
import { Vector3, Quaternion, Euler, MathUtils } from "./three.module.min.js";

/** @typedef {"default" | "left headphone" | "right headphone" | "unknown"} UKHeadphoneMotionSensorLocation */

/**
 * @typedef UKHeadphoneMotionRawData
 * @type {object}
 *
 * @property {number} timestamp
 * @property {UKHeadphoneMotionSensorLocation} sensorLocation
 * @property {[number]} quaternion
 * @property {[number]} userAcceleration
 * @property {[number]} rotationRate
 * @property {[number]} gravity
 */

/**
 * @typedef UKHeadphoneMotionData
 * @type {object}
 *
 * @property {number} timestamp
 * @property {UKHeadphoneMotionSensorLocation} sensorLocation
 * @property {Quaternion} quaternion
 * @property {Vector3} userAcceleration
 * @property {Euler} euler
 * @property {Euler} rotationRate
 * @property {Vector3} gravity
 *
 */

class UKHeadphoneMotionManager {
    logger = new Logger(false, this);
    eventDispatcher = new EventDispatcher();

    static #shared = new UKHeadphoneMotionManager();
    static get shared() {
        return this.#shared;
    }

    /** UKHeadphoneMotionManager is a singleton - use UKHeadphoneMotionManager.shared */
    constructor() {
        if (this.shared) {
            throw new Error("UKHeadphoneMotionManager is a singleton - use UKHeadphoneMotionManager.shared");
        }

        addBackgroundListener(this.#onBackgroundMessage.bind(this));

        window.addEventListener("load", () => {
            this.checkIsAvailable();
        });
        window.addEventListener("unload", () => {
            if (this.#isActive) {
                //this.stopMotionUpdates();
            }
        });
    }

    /**
     * @param {object} message
     * @param {string} message.type
     */
    async #sendBackgroundMessage(message) {
        return sendBackgroundMessage(message);
    }

    /** @type {boolean} */
    #isAvailable = null;
    get isAvailable() {
        return this.#isAvailable;
    }
    /** @param {boolean} newValue */
    #updateIsAvailable(newValue) {
        if (this.#isAvailable != newValue) {
            this.#isAvailable = newValue;
            this.logger.log(`updated isAvailable to ${newValue}`);
            this.eventDispatcher.dispatchEvent({
                type: "isAvailable",
                message: { isAvailable: this.isAvailable },
            });
            if (this.#isAvailable) {
                this.checkIsActive();
            }
        }
    }

    async checkIsAvailable() {
        this.logger.log("checking isAvailable");
        await this.#sendBackgroundMessage({ type: "isHeadphoneMotionAvailable" });
    }

    /** @type {boolean} */
    #isActive = null;
    get isActive() {
        return this.#isActive;
    }
    /** @param {boolean} newValue */
    #updateIsActive(newValue) {
        if (this.#isActive != newValue) {
            this.#isActive = newValue;
            this.logger.log(`updated isActive to ${newValue}`);
            this.eventDispatcher.dispatchEvent({
                type: "isActive",
                message: { isActive: this.isActive },
            });
            this.#isActivePoll.stop();

            if (this.#isActive) {
                this.logger.log("starting motion data poll");
                this.#motionDataPoll.start();
            } else {
                this.logger.log("stopping motion data poll");
                this.#motionDataPoll.stop();
            }
        }
    }

    async checkIsActive() {
        this.logger.log("checking isActive");
        await this.#sendBackgroundMessage({ type: "isHeadphoneMotionActive" });
    }

    #isActivePoll = new Poll(this.checkIsActive.bind(this), 50);

    async startMotionUpdates() {
        if (!this.isAvailable) {
            this.logger.log("not available");
            return;
        }
        if (this.isActive) {
            this.logger.log("already active");
            return;
        }
        this.logger.log("starting motion updates");
        this.#isActivePoll.start();
        await this.#sendBackgroundMessage({ type: "startHeadphoneMotionUpdates" });
    }
    async stopMotionUpdates() {
        if (!this.isAvailable) {
            this.logger.log("not available");
            return;
        }
        if (!this.isActive) {
            this.logger.log("already inactive");
            return;
        }
        this.logger.log("stopping motion updates");
        this.#isActivePoll.start();
        await this.#sendBackgroundMessage({ type: "stopHeadphoneMotionUpdates" });
    }

    async toggleMotionUpdates() {
        if (!this.isAvailable) {
            this.logger.log("not available");
            return;
        }
        if (this.isActive) {
            this.stopMotionUpdates();
        } else {
            this.startMotionUpdates();
        }
    }

    /** @type {UKHeadphoneMotionData} */
    #motionData;
    get motionData() {
        return this.#motionData;
    }
    /** @type {number} */
    get #motionDataTimestamp() {
        return this.motionData?.timestamp || 0;
    }
    /**
     *
     * @param {UKHeadphoneMotionRawData} rawMotionData
     */
    #updateMotionData(rawMotionData) {
        const {
            timestamp,
            sensorLocation,
            quaternion: quaternionArray,
            userAcceleration: userAccelerationArray,
            gravity: gravityArray,
            rotationRate: rotationRateArray,
        } = rawMotionData;

        /** @type {UKHeadphoneMotionData} */
        const motionData = {
            timestamp,
            sensorLocation,
            quaternion: new Quaternion(...quaternionArray),
            userAcceleration: new Vector3(...userAccelerationArray),
            gravity: new Vector3(...gravityArray),
            rotationRate: new Euler(...rotationRateArray.map((value) => value)),
        };
        motionData.euler = new Euler().setFromQuaternion(motionData.quaternion).reorder("YXZ");
        this.#motionData = motionData;
        this.logger.log("received headphone motion data", motionData);
        this.eventDispatcher.dispatchEvent({ type: "motionData", message: { motionData } });
    }

    async checkMotionData() {
        this.logger.log("checkMotionData");
        await this.#sendBackgroundMessage({ type: "headphoneMotionData", timestamp: this.#motionDataTimestamp });
    }
    #motionDataPoll = new Poll(this.checkMotionData.bind(this), 20);

    /**
     * @param {object} message
     * @param {string} message.type
     */
    #onBackgroundMessage(message) {
        this.logger.log(`received background message of type ${message.type}`, message);

        switch (message.type) {
            case "isHeadphoneMotionAvailable":
                this.#updateIsAvailable(message.isHeadphoneMotionAvailable);
                break;
            case "isHeadphoneMotionActive":
                this.#updateIsActive(message.isHeadphoneMotionActive);
                break;
            case "headphoneMotionData":
                this.#updateMotionData(message);
                break;
            default:
                //this.logger.log(`uncaught message type ${message.type}`);
                break;
        }
    }
}

export default UKHeadphoneMotionManager.shared;
