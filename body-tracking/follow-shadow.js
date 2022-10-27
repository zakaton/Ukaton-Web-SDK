/* global AFRAME */

AFRAME.registerComponent('follow-shadow', {
    schema: {type: 'selector'},
    init() {this.el.object3D.renderOrder = -1;},
    tick() { 
      if (this.data) {
        this.el.object3D.position.copy(this.data.object3D.position); 
        this.el.object3D.position.y-=0.001; // stop z-fighting
      }
    }
  });