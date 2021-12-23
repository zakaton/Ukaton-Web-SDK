/* global AFRAME, THREE */

AFRAME.registerSystem("template", {
  schema: {
    // FILL
  },

  init: function() {
    this.entities = [];
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

    if (diffKeys.includes("key")) {
      // FILL
    }
  },

  tick: function(time, timeDelta) {
    this.entities.forEach(entity => entity.tick(...arguments));
  }
});

AFRAME.registerComponent("physics", {
  schema: {
    // FILL
  },
  init: function() {
    this.system.addEntity(this);
  },
  tick: function() {
    
  },
  update: function(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("key")) {
      // FILL
    }
  },
  remove: function() {
    this.system.removeEntity(this);
  }
});
