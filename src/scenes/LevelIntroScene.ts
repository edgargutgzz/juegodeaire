import Phaser from "phaser";

const VEHICLES: { key: string; scale: number }[] = [
  { key: "sedan",        scale: 3.5 },
  { key: "sedan-blue",   scale: 3.5 },
  { key: "taxi",         scale: 3.5 },
  { key: "police",       scale: 3.5 },
  { key: "sports-red",   scale: 3.5 },
  { key: "sports-green", scale: 3.5 },
  { key: "convertible",  scale: 3.5 },
  { key: "suv",          scale: 4.0 },
  { key: "suv-closed",   scale: 4.0 },
  { key: "van",          scale: 4.0 },
  { key: "van-large",    scale: 4.0 },
  { key: "truck",        scale: 4.5 },
  { key: "bus",          scale: 4.5 },
  { key: "firetruck",    scale: 4.5 },
];

export class LevelIntroScene extends Phaser.Scene {
  constructor() {
    super("LevelIntroScene");
  }

  preload() {
    for (const v of VEHICLES) {
      this.load.image(`intro_car_${v.key}`, `/assets/cars/${v.key}.png`);
    }
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Fondo ─────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000);

    // ── Línea horizontal central ───────────────────────────────────
    const lineY = H * 0.43;
    const lineG = this.add.graphics();
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 400,
      ease: "Cubic.Out",
      delay: 300,
      onUpdate: (tween) => {
        const p = tween.getValue() ?? 0;
        lineG.clear();
        lineG.lineStyle(1, 0x333333, 1);
        const halfW = (W / 2) * p;
        lineG.strokePoints([{ x: W / 2 - halfW, y: lineY - 1 }, { x: W / 2 + halfW, y: lineY - 1 }] as Phaser.Types.Math.Vector2Like[]);
        lineG.strokePoints([{ x: W / 2 - halfW, y: lineY + 1 }, { x: W / 2 + halfW, y: lineY + 1 }] as Phaser.Types.Math.Vector2Like[]);
      },
    });

    // ── "NIVEL 1" ─────────────────────────────────────────────────
    const nivelText = this.add.text(W / 2, lineY - 48, "NIVEL 1", {
      fontSize: "14px",
      fontFamily: "'Press Start 2P'",
      color: "#666666",
      letterSpacing: 6,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: nivelText, alpha: 1, duration: 300, delay: 200 });

    // ── "TRAFICO" ─────────────────────────────────────────────────
    const titleText = this.add.text(W / 2, lineY + 52, "TRAFICO", {
      fontSize: "64px",
      fontFamily: "'Press Start 2P'",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScale(1.3);

    this.tweens.add({
      targets: titleText,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 250,
      delay: 600,
      ease: "Back.Out",
    });

    // ── Desfile de coches ──────────────────────────────────────────
    const carY = H * 0.88;
    const vehiclePool = Phaser.Utils.Array.Shuffle([...VEHICLES]);
    let poolIndex = 0;

    const spawnOne = (offsetDelay: number) => {
      this.time.delayedCall(offsetDelay, () => {
        const def = vehiclePool[poolIndex % vehiclePool.length];
        poolIndex++;

        const introScale = def.scale * 0.55;
        const car = this.add.image(-120, carY, `intro_car_${def.key}`)
          .setOrigin(0.5, 1)
          .setScale(introScale)
          .setDepth(2);

        const speed = Phaser.Math.Between(200, 340);

        this.tweens.add({
          targets: car,
          x: W + 160,
          duration: (W + 280) / speed * 1000,
          ease: "Linear",
          onComplete: () => car.destroy(),
        });

      });
    };

    // Primeros 3 coches escalonados, luego loop continuo
    [0, 700, 1500].forEach((d) => spawnOne(d));
    const loop = () => {
      this.time.delayedCall(Phaser.Math.Between(500, 1200), () => {
        spawnOne(0);
        loop();
      });
    };
    this.time.delayedCall(1500, loop);

    // ── Input ──────────────────────────────────────────────────────
    let ready = false;
    const proceed = () => {
      if (ready) return;
      ready = true;
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("GameScene");
      });
    };

    this.time.delayedCall(1200, () => {
      this.input.keyboard!.on("keydown-ENTER", proceed);
      this.input.keyboard!.on("keydown-SPACE", proceed);
      this.input.gamepad?.on("down", proceed);
    });
  }
}
