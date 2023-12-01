import EventDispatcher from "./EventDispatcher.js";
import UKMission from "./UKMission.js";
import { Logger } from "./utils.js";

class UKMissionsManager {
    logger = new Logger(false, this);
    eventDispatcher = new EventDispatcher();

    static #shared = new UKMissionsManager();
    static get shared() {
        return this.#shared;
    }

    /** @type {[UKMission]} */
    #missions = [];
    get missions() {
        return this.#missions;
    }

    /** UKMissionsManager is a singleton - use UKMissionsManager.shared */
    constructor() {
        if (this.shared) {
            throw new Error("UKMissionsManager is a singleton - use UKMissionsManager.shared");
        }
    }

    /**
     *
     * @param {UKMission} mission
     */
    add(mission) {
        if (!this.#missions.includes(mission)) {
            this.#missions.push(mission);
            this.logger.log("added mission", mission);

            this.eventDispatcher.dispatchEvent({ type: "addedMission", message: { mission } });
            this.eventDispatcher.dispatchEvent({ type: "missions", message: { mission: this.missions } });
        } else {
            this.logger.log("already has mission", mission);
        }
    }

    /**
     *
     * @param {UKMission} mission
     */
    remove(mission) {
        if (this.#missions.includes(mission)) {
            this.#missions.splice(this.#missions.indexOf(mission), 1);
            this.logger.log("removed mission", mission);

            this.eventDispatcher.dispatchEvent({ type: "removedMission", message: { mission } });
            this.eventDispatcher.dispatchEvent({ type: "missions", message: { mission: this.missions } });
        } else {
            this.logger.log("mission not found", mission);
        }
    }
}

export default UKMissionsManager.shared;
