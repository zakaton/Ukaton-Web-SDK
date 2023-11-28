import { bluetoothManager } from "./UkatonKit.js";

export default class UKScanController {
    host;

    constructor(host) {
        (this.host = host).addController(this);
        this._onScanUpdate = this._onScanUpdate.bind(this);
    }

    _onScanUpdate() {
        this.host.requestUpdate();
    }

    hostConnected() {
        bluetoothManager.eventDispatcher.addEventListener("isScanning", this._onScanUpdate);
    }

    hostDisconnected() {
        bluetoothManager.eventDispatcher.removeEventListener("isScanning", this._onScanUpdate);
    }
}
