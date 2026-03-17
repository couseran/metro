import { registerPropSprite } from '../PropSpriteRegistry';

registerPropSprite('chair', {
  frames: [
    { src: '/sprites/props/Interiors_16x16.png', sx: 0, sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 },
  ],
  rotationFrames: {
    0: [{ src: '/sprites/props/Interiors_16x16.png', sx: 0,  sy: 16, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
    1: [{ src: '/sprites/props/Interiors_16x16.png', sx: 16, sy: 16, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
    2: [{ src: '/sprites/props/Interiors_16x16.png', sx: 32, sy: 16, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
    3: [{ src: '/sprites/props/Interiors_16x16.png', sx: 48, sy: 16, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
  },
});