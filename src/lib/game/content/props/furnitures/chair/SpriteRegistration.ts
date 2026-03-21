import { registerPropSprite } from '$lib/game/systems/props/PropSpriteRegistry';

registerPropSprite('chair', {
  frames: [
    { src: '/sprites/props/Interiors_16x16.png', sx: 16*9, sy: 16*31, sw: 16, sh: 32, anchorX: 0, anchorY: 0.2 },
  ],
  rotationFrames: {
    1: [{ src: '/sprites/props/Interiors_16x16.png', sx: 16*9,  sy: 16*31, sw: 16, sh: 32, anchorX: 0, anchorY: 0.2 }],
    3: [{ src: '/sprites/props/Interiors_16x16.png', sx: 16*12, sy: 16*33, sw: 16, sh: 32, anchorX: 0, anchorY: 0.2 }],
  },
});
