// POSITIONING

// using Google Pixel 3 as reference
const screenDimensions = {
  width: 0.0682, // 68.2 mm
  height: 0.1456, // 145.6 mm
  distance: 0.3048 // 1 foot
};
function getElementPositionRelativeToWindow(element) {
  let { x, y, width, height } = element.getBoundingClientRect();
  x += width / 2;
  y += height / 2;
  return { x, y };
}
function getElementPositionRelativeToScreen(element) {
  let { x, y } = getElementPositionRelativeToWindow(element);
  const { screenX, screenY, outerHeight, innerHeight } = window;
  const windowHeightDifference = outerHeight - innerHeight;
  x += screenX;
  y += screenY;
  y += windowHeightDifference; // doesn't work if console is open
  return { x, y };
}
function getInterpolatedElementPositionRelativeToScreen(element) {
  let { x, y } = getElementPositionRelativeToScreen(element);

  x /= screen.width;
  y /= screen.height;
  y = 1 - y;

  return { x, y };
}
function get3DPositionOfElementRelativeToScreen(element) {
  let { x, y } = getInterpolatedElementPositionRelativeToScreen(element);
  x -= 0.5;
  x *= screenDimensions.width;

  y -= 0.5;
  y *= screenDimensions.height;

  const z = screenDimensions.distance;
  return { x, y, z };
}

// SPATIALIZE
const audioContext = THREE.AudioContext.getContext();
const spatializedMediaElements = [];
function spatializeMediaElement(mediaElement) {
  if (
    !spatializedMediaElements.includes(mediaElement) &&
    mediaElement instanceof HTMLMediaElement
  ) {
    console.log("new media element", mediaElement);
    const mediaElementSource = mediaElement.srcObject
      ? audioContext.createMediaStreamSource(mediaElement.srcObject)
      : audioContext.createMediaElementSource(mediaElement);
    if (mediaElement instanceof HTMLVideoElement && mediaElement.srcObject) {
      mediaElement.muted = true;
    }
    const source = audioContext.resonanceAudioScene.createSource();
    mediaElementSource.connect(source.input);
    const positionalElement =
      mediaElement instanceof HTMLVideoElement ? mediaElement : document.body;

    mediaElement.spatialization = {
      source,
      mediaElementSource,
      positionalElement,
      screenPosition: getElementPositionRelativeToScreen(positionalElement)
    };
    spatializedMediaElements.push(mediaElement);
    updateSpatilizedMediaElement(mediaElement);
  }
}

function didSpatializedElementMove(mediaElement) {
  const currentScreenPosition = getElementPositionRelativeToScreen(
    mediaElement.spatialization.positionalElement
  );
  const storedScreenPosition = mediaElement.spatialization.screenPosition;

  const { x, y } = currentScreenPosition;

  const _x = storedScreenPosition.x;
  const _y = storedScreenPosition.y;

  if (Math.abs(x - _x) > 2 || Math.abs(y - _y) > 2) {
    Object.assign(
      mediaElement.spatialization.screenPosition,
      currentScreenPosition
    );
    return true;
  }
}

function checkSpatilizedMediaElement(mediaElement) {
  if (didSpatializedElementMove(mediaElement)) {
    updateSpatilizedMediaElement(mediaElement);
  }
}

function updateSpatilizedMediaElement(mediaElement) {
  const { x, y, z } = get3DPositionOfElementRelativeToScreen(mediaElement);
  mediaElement.spatialization.source.setPosition(x, y, z);
}

// A_fRAME
const sceneContainer = document.createElement("div");
const innerHTML = `
    <a-scene
      style="width: 130px; height: 130px; position: fixed; z-index: 1000; top: 0px; right: 4px;"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
      embedded
      resonance-audio="gain: 0;
                       width: 10;
                       depth: 10;
                       height: 7;
                       listener: #faceEntity;
                       ambisonicOrder: 3;
                       left: uniform;
                       right: uniform;
                       front: uniform;
                       down: uniform;
                       back: uniform;
                       up: uniform;"
    >
      <a-assets>
        <a-asset-item
          id="monkeyAsset"
          src="https://cdn.glitch.com/7aee52f8-8780-408a-9381-d76a09b01778%2Fmonkey.gltf?v=1601761372036"
        ></a-asset-item>
      </a-assets>

      <a-camera
        position="0 0 0"
        fov="23"
        look-controls="enabled: false;"
        wasd-controls-enabled="false"
      >
        <a-entity position="0 0 0.3" id="faceEntity"></a-entity>
      </a-camera>
      
      <a-entity id="deviceEntity"></a-entity>
      
      <a-entity id="monkeyPosition" position="0 0 -3">
        <a-entity id="monkeyRotation" position="0 0 0" rotation="0 180 0">
          <a-entity
            id="monkeyOffset"
            position="0 -0.4 0"
            scale="0.05 0.05 0.05"
          >
            <a-entity
              id="monkey"
              position="0 0 0"
              rotation="0 180 0"
              scale="0.4 0.4 0.4"
              gltf-model="#monkeyAsset"
            ></a-entity>
          </a-entity>
        </a-entity>
      </a-entity>
    </a-scene>
`;
console.log(innerHTML);
sceneContainer.innerHTML = innerHTML;
const scene = sceneContainer.querySelector("a-scene");
scene.addEventListener(
  "loaded",
  event => {
    const sideMission = (window.sideMission = new SideMission());

    const monkeyRotation = scene.querySelector("#monkeyRotation");
    const faceEntity = scene.querySelector("#faceEntity");
    const deviceEntity = scene.querySelector("#deviceEntity");
    const deviceOrientationControls = new THREE.DeviceOrientationControls(
      deviceEntity.object3D
    );
    const deviceQuaternion = new THREE.Quaternion();
    const deviceEuler = new THREE.Euler();

    window.addEventListener("deviceorientation", onDeviceOrientation);
    async function requestDeviceOrientationEvent() {
      const permissionState = await DeviceOrientationEvent.requestPermission();
    }
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      document.addEventListener("click", requestDeviceOrientationEvent, {
        once: true
      });
    }
    function onDeviceOrientation(event) {
      deviceOrientationControls.update();
      deviceEuler.copy(deviceEntity.object3D.rotation);
      if ("webkitCompassHeading" in event) {
        deviceEuler.y = -THREE.Math.degToRad(event.webkitCompassHeading);
      }
      deviceQuaternion.setFromEuler(deviceEuler);
      shouldUpdateCamera = true;
    }

    const calibrationEuler = new THREE.Euler();
    function calibrate() {
      calibrationEuler.copy(sideMission.euler);
    }

    scene.addEventListener("click", async event => {
      if (!sideMission.isConnected) {
        await sideMission.connect();
      } else {
        calibrate();
      }
    });
    sideMission.addEventListener("connected", async event => {
      await sideMission.configureImu({ quaternion: 20 });
    });
    const camera = scene.querySelector("a-camera");
    const faceQuaternion = new THREE.Quaternion();
    const faceEuler = new THREE.Euler(0, 0, 0, "YXZ");
    const faceEuler2 = new THREE.Euler(0, 0, 0, "YXZ");
    sideMission.addEventListener("quaternion", event => {
      faceQuaternion.multiplyQuaternions(
        deviceQuaternion.clone().invert(),
        sideMission.quaternion
      );
      faceEuler.setFromQuaternion(faceQuaternion);
      faceEuler.y -= calibrationEuler.y; // subtract entire euler?
      faceEntity.object3D.rotation.copy(faceEuler);
      faceEuler2.copy(faceEuler);
      faceEuler2.y *= -1;
      faceEuler2.y += Math.PI;
      faceEuler2.z *= -1;
      if (monkeyRotation) {
        monkeyRotation.object3D.rotation.copy(faceEuler2);
      }
      shouldUpdateCamera = true;
    });

    let shouldUpdateCamera = false;
    function updateCamera() {
      camera.object3D.quaternion.copy(deviceQuaternion);
    }

    const onAnimationFrame = () => {
      if (shouldUpdateCamera) {
        updateCamera();
        shouldUpdateCamera = false;
      }
      spatializedMediaElements.forEach(mediaElement =>
        checkSpatilizedMediaElement(mediaElement)
      );
      requestAnimationFrame(onAnimationFrame);
    };
    requestAnimationFrame(onAnimationFrame);

    const mutationObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(addedNode => {
          if (addedNode instanceof HTMLMediaElement) {
            const mediaElement = addedNode;
            spatializeMediaElement(mediaElement);
          }
        });
      });
    });
    mutationObserver.observe(document, { childList: true, subtree: true });

    document.querySelectorAll("video, audio").forEach(mediaElement => {
      spatializeMediaElement(mediaElement);
    });
  },
  { once: true }
);
document.body.appendChild(sceneContainer);
