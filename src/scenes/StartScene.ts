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
    const bg = this.add.image(W / 2, H / 2, "bg_start").setDepth(0);
    bg.setScale(Math.max(W / bg.width, H / bg.height));

    // ── Overlay ───────────────────────────────────────────────────
    const overlay = this.add.graphics().setDepth(1);
    overlay.fillStyle(0x000000, 0.40);
    overlay.fillRect(0, 0, W, H);

    // ── Subtítulo ─────────────────────────────────────────────────
    this.add.text(W/2, H*0.08, "¿Puedes escapar de la contaminación?", {
      fontSize: "18px", fontFamily: "'Bungee'", color: "#c8c8c8",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(9);

    // ── Título ────────────────────────────────────────────────────
    this.add.text(W / 2, H * 0.42, "NO SE VEN LAS MONTAÑAS", {
      fontSize: "56px", fontFamily: "'Bungee'",
      color: "#e8720c", stroke: "#000000", strokeThickness: 5,
    }).setOrigin(0.5).setDepth(5);

    // ── Prompt parpadeante ────────────────────────────────────────
    const prompt = this.add.text(W / 2, H * 0.65, "Presiona para iniciar", {
      fontSize: "20px", fontFamily: "'Bungee'",
      color: "#ffffff", stroke: "#000000", strokeThickness: 5,
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

    const drawHelmet = (g: Phaser.GameObjects.Graphics) => {
      // Casco astronauta — visor redondo
      const hx = 2, hy = -36;
      g.lineStyle(3, 0xaaaaaa, 1);
      g.fillStyle(0x88ccff, 0.35);
      g.strokeCircle(hx, hy, 15);
      g.fillCircle(hx, hy, 15);
      // Borde metálico exterior
      g.lineStyle(4, 0xcccccc, 0.9);
      g.strokeCircle(hx, hy, 17);
      // Reflejo
      g.fillStyle(0xffffff, 0.4);
      g.fillEllipse(hx - 4, hy - 6, 6, 4);
    };

    const drawMask = (g: Phaser.GameObjects.Graphics) => {
      const mx = 0, my = -24;
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
      const charY = H - 55;

      const container = this.add.container(-60, charY).setDepth(depth);
      const sprite = this.add.sprite(0, 0, `${gender}_walk0`).setScale(0.5).setOrigin(0.5, 1);
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

    spawnRunner("run_female", "female_idle", W * 0.32, 10, 0, drawMask);
    spawnRunner("run_male",   "male_idle",   W * 0.24, 10,
      Math.round((W * 0.08) / (W + 120) * 5000), () => {});

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
