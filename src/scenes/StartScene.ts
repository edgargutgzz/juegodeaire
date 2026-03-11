import Phaser from "phaser";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("StartScene");
  }

  preload() {
    this.load.image("bg_start", "/assets/bg_start.jpg");
    this.load.audio("music_start", "/assets/music_start.mp3");
    this.load.image("male_idle",   "/assets/character/character_maleAdventurer_idle.png");
    this.load.image("female_idle", "/assets/character/character_femaleAdventurer_idle.png");
    for (let i = 0; i < 8; i++) {
      this.load.image(`male_walk${i}`,   `/assets/character/character_maleAdventurer_walk${i}.png`);
      this.load.image(`female_walk${i}`, `/assets/character/character_femaleAdventurer_walk${i}.png`);
    }
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Fondo ─────────────────────────────────────────────────────
    const bg = this.add.image(W / 2 - 900, H / 2, "bg_start").setDepth(0);
    bg.setScale(Math.max(W / bg.width, H / bg.height));

    // ── Overlay ───────────────────────────────────────────────────
    const overlay = this.add.graphics().setDepth(1);
    overlay.fillStyle(0x000000, 0.40);
    overlay.fillRect(0, 0, W, H);

    // ── Título ────────────────────────────────────────────────────
    this.add.text(W / 2, H * 0.28, "NO SE VEN\nLAS MONTAÑAS", {
      fontSize: "22px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", stroke: "#000000", strokeThickness: 5,
      align: "center", lineSpacing: 12,
      wordWrap: { width: W - 48 },
    }).setOrigin(0.5).setDepth(5);

    // ── Subtítulo ─────────────────────────────────────────────────
    this.add.text(W / 2, H * 0.40, "Corre. Respira.\nSobrevive.", {
      fontSize: "12px", fontFamily: "'Press Start 2P'",
      color: "#e8720c", stroke: "#000000", strokeThickness: 3,
      align: "center", lineSpacing: 10,
    }).setOrigin(0.5).setDepth(5);

    // ── Prompt parpadeante ────────────────────────────────────────
    const prompt = this.add.text(W / 2, H * 0.58, "PRESIONA PARA INICIAR", {
      fontSize: "12px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(5);

    this.tweens.add({
      targets: prompt, alpha: 0.15,
      duration: 1200, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    });

    // ── Personajes corriendo ──────────────────────────────────────
    this.anims.create({
      key: "run_male",
      frames: Array.from({ length: 8 }, (_, i) => ({ key: `male_walk${i}` })),
      frameRate: 12, repeat: -1,
    });
    this.anims.create({
      key: "run_female",
      frames: Array.from({ length: 8 }, (_, i) => ({ key: `female_walk${i}` })),
      frameRate: 12, repeat: -1,
    });

const drawMask = (g: Phaser.GameObjects.Graphics) => {
      const mx = 0, my = -38;
      // Cuerpo del cubrebocas (forma trapezoidal)
      g.fillStyle(0xffffff, 0.95);
      g.fillPoints([
        { x: mx - 8, y: my - 5 },
        { x: mx + 8, y: my - 5 },
        { x: mx + 9, y: my + 5 },
        { x: mx - 9, y: my + 5 },
      ], true);
      // Borde
      g.lineStyle(1, 0xbbbbbb, 0.9);
      g.strokePoints([
        { x: mx - 8, y: my - 5 },
        { x: mx + 8, y: my - 5 },
        { x: mx + 9, y: my + 5 },
        { x: mx - 9, y: my + 5 },
      ], true);
      // Pliegues horizontales
      g.lineStyle(1, 0xdddddd, 0.7);
      g.lineBetween(mx - 8, my - 1, mx + 8, my - 1);
      g.lineBetween(mx - 9, my + 2, mx + 9, my + 2);
      // Tirante oreja izquierda
      g.lineStyle(1, 0xaaaaaa, 0.8);
      g.lineBetween(mx - 8, my - 3, mx - 13, my - 1);
      g.lineBetween(mx - 9, my + 3, mx - 13, my + 1);
    };

    const spawnRunner = (
      animKey: string, idleKey: string, stopX: number, depth: number, delay: number,
      drawAccessory: (g: Phaser.GameObjects.Graphics) => void
    ) => {
      const gender = animKey.split("_")[1];
      const charY = H - 160;

      const container = this.add.container(-60, charY).setDepth(depth);
      const sprite = this.add.sprite(0, 0, `${gender}_walk0`).setScale(0.75).setOrigin(0.5, 1);
      const accessory = this.add.graphics();
      drawAccessory(accessory);
      container.add([sprite, accessory]);

      sprite.play(animKey);

      const run = () => {
        container.setX(-60);
        container.setAngle(0);
        sprite.play(animKey);

        this.tweens.add({
          targets: container,
          x: stopX,
          duration: (stopX + 60) / (W + 120) * 5000,
          ease: "Linear",
          onComplete: () => {
            sprite.setTexture(idleKey);
            this.tweens.add({
              targets: container, angle: -12,
              duration: 300, ease: "Power2", yoyo: true, hold: 1200,
              onComplete: () => {
                container.setAngle(0);
                sprite.play(animKey);
                this.tweens.add({
                  targets: container,
                  x: W + 60,
                  duration: (W + 60 - stopX) / (W + 120) * 5000,
                  ease: "Linear",
                  onComplete: () => {
                    this.time.delayedCall(Phaser.Math.Between(2000, 4000), run);
                  },
                });
              },
            });
          },
        });
      };

      this.time.delayedCall(delay, run);
    };

    spawnRunner("run_female", "female_idle", W * 0.55, 10, 0, drawMask);
    spawnRunner("run_male",   "male_idle",   W * 0.40, 10,
      Math.round((W * 0.15) / (W + 120) * 5000), drawMask);

    // ── Música ────────────────────────────────────────────────────
    this.sound.add("music_start", { loop: true, volume: 0.5 }).play();

    // TODO: habilitar input cuando el juego esté listo
  }

  protected startGame() {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("GameScene");
    });
  }
}
