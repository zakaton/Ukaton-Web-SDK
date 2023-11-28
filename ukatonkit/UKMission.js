import EventDispatcher from "./EventDispatcher.js";
import { Logger, sendBackgroundMessage, addBackgroundListener, removeBackgroundListener } from "./utils.js";
import UKDiscoveredDevice from "./UKDiscoveredDevice.js";
import { missionsManager } from "./UkatonKit.js";

export default class UKMission extends EventDispatcher {
    logger = new Logger(true, this);

    /** @type {UKDiscoveredDevice} */
    #discoveredDevice;

    /**
     * @param {UKDiscoveredDevice} discoveredDevice
     */
    constructor(discoveredDevice) {
        super();

        this.#discoveredDevice = discoveredDevice;

        this.logger.log("adding self");
        missionsManager.add(this);
    }

    destroy() {
        this.logger.log("destroying self");
        missionsManager.remove(this);
    }
}
