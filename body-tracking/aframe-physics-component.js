/* global AFRAME, THREE, CANNON */

AFRAME.registerSystem("physics", {
  schema: {
    gravity: { type: "number", default: -9.82 }, // m/s²
    defaultRestituion: { type: "number", default: 0 },
    defaultFriction: { type: "number", default: 0 }
  },

  init: function() {
    this.entities = [];

    this.world = new CANNON.World();
    this.world.gravity.set(0, this.data.gravity, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.defaultContactMaterial.restitution = this.data.defaultRestitution;
    this.world.defaultContactMaterial.friction = this.data.defaultFriction;

    this.world.solver.iterations = 20;
    this.world.solver.tolerance = 0;
  },

  addEntity: function(entity) {
    this.entities.push(entity);
  },
  removeEntity: function(entity) {
    this.entities.splice(this.entities.indexOf(entity), 1);
  },

  update: function(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("gravity")) {
      this.world.gravity.set(0, this.data.gravity, 0);
    }
  },

  tick: function(time, timeDelta) {
    if (this.lastTime !== undefined) {
      var dt = (time - this.lastTime) / 1000;
      this.world.step(1 / 60, dt, 3);
      this.entities.forEach(entity => entity.tick(...arguments));
    }
    this.lastTime = time;
  }
});

AFRAME.registerComponent("physics", {
  schema: {
    mass: { type: "number", default: 0 },
    shape: { type: "string", default: "box" },
    radius: { type: "number", default: 1 },
    scale: { type: "array", default: [1, 1, 1] },
    linearDamping: { type: "number", default: 0.01 },
    restitution: { type: "number", default: 0 },
    friction: { type: "number", default: 0 },
    name: { type: "string", default: "" }
  },
  init: function() {
    switch (this.data.shape) {
      case "box":
        this.shape = new CANNON.Box(
          new CANNON.Vec3(...this.data.scale.map(n => Number(n)))
        );
        break;
      case "plane":
        this.shape = new CANNON.Plane();
        break;
      case "sphere":
        this.shape = new CANNON.Sphere(this.data.radius);
        break;
      default:
        break;
    }

    if (this.shape) {
      this.material = new CANNON.Material({
        restitution: this.data.restitution
      });

      this.body = new CANNON.Body({
        mass: this.data.mass,
        material: this.material
      });

      this.body.name = this.data.name;
      this.body.linearDamping = this.data.linearDamping;

      this.body.addShape(this.shape);
      if (this.data.shape == "plane") {
        this.body.quaternion.setFromAxisAngle(
          new CANNON.Vec3(1, 0, 0),
          -Math.PI / 2
        );
      }

      const worldPosition = new THREE.Vector3();
      this.el.object3D.getWorldPosition(worldPosition);
      this.body.position.set(...worldPosition.toArray());

      this.body.addEventListener("collide", event => {
        this.el.emit("collide", event);
      });

      this.system.world.addBody(this.body);

      if (this.body.mass > 0) {
        this.system.world.bodies
          .filter(body => body.mass == 0)
          .forEach(body => {
            const contactMaterial = new CANNON.ContactMaterial(
              body.material,
              this.material,
              {
                friction: this.data.friction,
                restitution:
                  this.body.material.restitution || this.data.restitution
              }
            );
            this.system.world.addContactMaterial(contactMaterial);
          });
      } else {
        this.system.world.bodies
          .filter(body => body.mass > 0)
          .forEach(body => {
            const contactMaterial = new CANNON.ContactMaterial(
              this.material,
              body.material,
              {
                friction: this.data.friction,
                restitution: body.material.restitution || this.data.restitution
              }
            );
            this.system.world.addContactMaterial(contactMaterial);
          });
      }
    }

    this.system.addEntity(this);
  },
  tick: function() {
    if (this.body.mass > 0) {
      this.el.object3D.quaternion.set(...this.body.quaternion.toArray());
      this.el.object3D.position.set(...this.body.position.toArray());
    } else {
      const quaternion = new THREE.Quaternion();
      this.el.object3D.getWorldQuaternion(quaternion);
      this.body.quaternion.set(...quaternion.toArray());

      const position = new THREE.Vector3();
      this.el.object3D.getWorldPosition(position);
      this.body.position.set(...position.toArray());
    }
  },
  update: function(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("mass")) {
      this.body.mass = this.data.mass;
      this.body.updateMassProperties();
    }

    if (diffKeys.includes("scale") && this.data.shape == "box") {
      this.shape.halfExtents.set(...this.data.scale.map(n => Number(n) / 2));
      this.shape.updateBoundingSphereRadius();
    }
    if (diffKeys.includes("radius") && this.data.shape == "sphere") {
      this.shape.radius = this.data.radius;
      this.shape.updateBoundingSphereRadius();
    }
  },
  remove: function() {
    this.system.world.removeBody(this.body);
    this.system.removeEntity(this);
  }
});
