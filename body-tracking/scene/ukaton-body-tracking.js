/* global AFRAME, THREE, MissionMesh */

AFRAME.registerComponent("ukaton-body-tracking", {
  init: function() {
    console.log(this);
    window.b = this;

    const entities = (this.entities = {});
    this.quaternionOffsets = {};
    {
      entities.lowerSpine = document.createElement("a-entity");
      entities.lowerSpine.setAttribute("position", "0 0 0");
      entities.upperSpine = document.createElement("a-entity");
      entities.upperSpine.setAttribute("position", "0 0 0");
      entities.lowerSpine.appendChild(entities.upperSpine);

      entities.head = document.createElement("a-entity");
      entities.head.setAttribute("position", "0 0 0");
      entities.upperSpine.appendChild(entities.head);

      entities.leftBicep = document.createElement("a-entity");
      entities.leftBicep.setAttribute("position", "0 0 0");
      entities.leftBicep.setAttribute("rotation", "0 0 0");
      entities.upperSpine.appendChild(entities.leftBicep);
      entities.leftForearm = document.createElement("a-entity");
      entities.leftForearm.setAttribute("position", "0 0 0");
      entities.leftBicep.appendChild(entities.leftForearm);
      entities.leftHand = document.createElement("a-entity");
      entities.leftHand.setAttribute("position", "0 0 0");
      entities.leftForearm.appendChild(entities.leftHand);

      entities.rightBicep = document.createElement("a-entity");
      entities.rightBicep.setAttribute("position", "0 0 0");
      entities.rightBicep.setAttribute("rotation", "0 0 0");
      entities.upperSpine.appendChild(entities.rightBicep);
      entities.rightForearm = document.createElement("a-entity");
      entities.rightForearm.setAttribute("position", "0 0 0");
      entities.rightBicep.appendChild(entities.rightForearm);
      entities.rightHand = document.createElement("a-entity");
      entities.rightHand.setAttribute("position", "0 0 0");
      entities.rightForearm.appendChild(entities.rightHand);

      entities.leftThigh = document.createElement("a-entity");
      entities.leftThigh.setAttribute("position", "0 0 0");
      entities.lowerSpine.appendChild(entities.leftThigh);
      entities.leftShin = document.createElement("a-entity");
      entities.leftShin.setAttribute("position", "0 0 0");
      entities.leftThigh.appendChild(entities.leftShin);
      entities.leftFoot = document.createElement("a-entity");
      entities.leftFoot.setAttribute("position", "0 0 0");
      entities.leftShin.appendChild(entities.leftFoot);

      entities.rightThigh = document.createElement("a-entity");
      entities.rightThigh.setAttribute("position", "0 0 0");
      entities.lowerSpine.appendChild(entities.rightThigh);
      entities.rightShin = document.createElement("a-entity");
      entities.rightShin.setAttribute("position", "0 0 0");
      entities.rightThigh.appendChild(entities.rightShin);
      entities.rightFoot = document.createElement("a-entity");
      entities.rightFoot.setAttribute("position", "0 0 0");
      entities.rightShin.appendChild(entities.rightFoot);

      entities.leftAnchor = document.createElement("a-entity");
      entities.rightAnchor = document.createElement("a-entity");
    }

    const primitives = (this.primitives = {});
    {
      primitives.lowerSpine = document.createElement("a-box");
      primitives.lowerSpine.setAttribute("scale", "0.5 0.5 0.5");
      primitives.upperSpine = document.createElement("a-box");
      primitives.upperSpine.setAttribute("scale", "0.5 0.5 0.5");

      primitives.head = document.createElement("a-sphere");
      primitives.head.setAttribute("radius", "0.5");
      primitives.leftEye = document.createElement("a-sphere");
      primitives.leftEye.setAttribute("color", "black");
      //primitives.head.appendChild(primitives.leftEye);
      primitives.rightEye = document.createElement("a-sphere");
      primitives.rightEye.setAttribute("color", "black");
      //primitives.head.appendChild(primitives.rightEye);

      primitives.leftShoulder = document.createElement("a-sphere");
      primitives.leftShoulder.setAttribute("radius", "0.5");
      entities.upperSpine.appendChild(primitives.leftShoulder);
      primitives.leftBicep = document.createElement("a-cylinder");
      primitives.leftBicep.setAttribute("scale", "0.5 0.5 0.5");
      primitives.leftElbow = document.createElement("a-sphere");
      primitives.leftElbow.setAttribute("radius", "0.5");
      entities.leftBicep.appendChild(primitives.leftElbow);
      primitives.leftForearm = document.createElement("a-cylinder");
      primitives.leftForearm.setAttribute("scale", "0.5 0.5 0.5");
      primitives.leftHand = document.createElement("a-box");
      primitives.leftHand.setAttribute("scale", "0.5 0.5 0.5");

      primitives.leftThigh = document.createElement("a-cylinder");
      primitives.leftThigh.setAttribute("scale", "0.5 0.5 0.5");
      primitives.leftKnee = document.createElement("a-sphere");
      primitives.leftKnee.setAttribute("radius", "0.5");
      entities.leftThigh.appendChild(primitives.leftKnee);
      primitives.leftShin = document.createElement("a-cylinder");
      primitives.leftShin.setAttribute("scale", "0.5 0.5 0.5");
      primitives.leftFoot = document.createElement("a-box");
      primitives.leftFoot.setAttribute("scale", "0.5 0.5 0.5");

      primitives.leftAnchor = document.createElement("a-ring");
      primitives.leftAnchor.setAttribute("rotation", "-90 0 0");
      primitives.leftAnchor.setAttribute("radius-inner", 0);
      primitives.leftAnchor.setAttribute("radius-outer", 1);
      primitives.leftAnchor.setAttribute("color", "red");
      primitives.rightAnchor = document.createElement("a-ring");
      primitives.rightAnchor.setAttribute("rotation", "-90 0 0");
      primitives.rightAnchor.setAttribute("radius-inner", 0);
      primitives.rightAnchor.setAttribute("radius-outer", 1);
      primitives.rightAnchor.setAttribute("color", "red");
    }

    for (const name in entities) {
      const entity = entities[name];
      entity.id = name;
      if (name in primitives) {
        entity.appendChild(primitives[name]);
      }
      this.quaternionOffsets[name] = new THREE.Quaternion();
    }

    this.el.appendChild(entities.lowerSpine);
    this.el.appendChild(entities.leftAnchor);
    this.el.appendChild(entities.rightAnchor);

    this.missionMesh = new MissionMesh();
    // create missionMesh
    // connect, addEventListener, enable quaternion
  },
  tick: function() {
    // update skeleton based on missionMesh data
    // map device quaternion to bone of the same name
  },
  remove: function() {
    this.entities.lowerSpine.remove();
  }
});
