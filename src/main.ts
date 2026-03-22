import Phaser from "phaser";
import { StartScene } from "./scenes/StartScene";
import { GameScene } from "./scenes/GameScene";
import { BossScene } from "./scenes/BossScene";
import { LevelCompleteScene } from "./scenes/LevelCompleteScene";
import { GameOverScene } from "./scenes/GameOverScene";

const startGame = () => new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
  },
  backgroundColor: "#64b4e6",
  input: {
    gamepad: true,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 600 },
      debug: false,
    },
  },
  scene: [StartScene, GameScene, BossScene, LevelCompleteScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

document.fonts.ready.then(startGame);
