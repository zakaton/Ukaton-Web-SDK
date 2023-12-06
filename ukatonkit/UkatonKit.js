import bluetoothManager from "./UKBluetoothManager.js";
import missionsManager from "./UKMissionsManager.js";
import headphoneMotionManager from "./UKHeadphoneMotionManager.js";

const UkatonKit = { bluetoothManager, missionsManager, headphoneMotionManager };

window.UkatonKit = UkatonKit;

export { bluetoothManager, missionsManager, headphoneMotionManager };
