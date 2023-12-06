import EventDispatcher from "./EventDispatcher.js";
import { Poll, Logger, sendBackgroundMessage, addBackgroundListener } from "./utils.js";

/**
 * @typedef UKHeadphoneMotionData
 * @type {object}
 *
 */

/**
 * @typedef UKHeadphoneMotionRawData
 * @type {object}
 *
 */

class UKHeadphoneMotionManager {
    logger = new Logger(true, this);
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

    /** @type {UKHeadphoneMotionData} */
    #motionData;
    get motionData() {
        return this.#motionData;
    }
    /** @type {number} */
    get #motionDataTimestamp() {
        return this.motionData?.timestamp || 0;
    }
    /** @type {UKHeadphoneMotionRawData} */
    #updateMotionData(rawMotionData) {
        /** @type {UKHeadphoneMotionData} */
        const motionData = {
            // FILL
        };
        this.#motionData = motionData;
        this.logger.log("received headphone motion data", motionData);
    }

    async checkMotionData() {
        this.logger.log("checkMotionData");
        await this.#sendBackgroundMessage({ type: "headphoneMotionData", timestamp: this.#motionDataTimestamp });
    }
    #motionDataPoll = new Poll(this.checkMotionData.bind(this), 500);

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
