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
    const bg = this.add.image(W / 2 - 380, H / 2, "bg_start").setDepth(0);
    bg.setScale(Math.max(W / bg.width, H / bg.height));

    // ── Overlay ───────────────────────────────────────────────────
    const overlay = this.add.graphics().setDepth(1);
    overlay.fillStyle(0x000000, 0.62);
    overlay.fillRect(0, 0, W, H);

    // ── Estrellas ─────────────────────────────────────────────────
    const stars = this.add.graphics().setDepth(2);
    for (let i = 0; i < 90; i++) {
      const sx = Phaser.Math.Between(0, W);
      const sy = Phaser.Math.Between(0, H * 0.80);
      const sz = Math.random() < 0.2 ? 2 : 1;
      stars.fillStyle(0xffffff, Math.random() * 0.5 + 0.2);
      stars.fillRect(sx, sy, sz, sz);
    }

    // ── Panel del título ──────────────────────────────────────────
    const panelW = W * 0.82;
    const panelH = H * 0.36;
    const panelX = W / 2 - panelW / 2;
    const panelY = H * 0.12;
    const panelG = this.add.graphics().setDepth(3);
    panelG.fillStyle(0x000011, 0.88);
    panelG.fillRect(panelX, panelY, panelW, panelH);
    panelG.lineStyle(3, 0x4488ff, 1);
    panelG.strokeRect(panelX, panelY, panelW, panelH);
    panelG.lineStyle(1, 0x1133aa, 1);
    panelG.strokeRect(panelX + 5, panelY + 5, panelW - 10, panelH - 10);

    // ── Título ────────────────────────────────────────────────────
    this.add.text(W / 2, H * 0.25, "NO SE VEN\nLAS MONTAÑAS", {
      fontSize: "44px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", stroke: "#0033bb", strokeThickness: 6,
      align: "center", lineSpacing: 12,
      wordWrap: { width: W - 48 },
    }).setOrigin(0.5).setDepth(5);

    // ── Subtítulo ─────────────────────────────────────────────────
    this.add.text(W / 2, H * 0.42, "── Corre. Respira. Sobrevive. ──", {
      fontSize: "14px", fontFamily: "'Press Start 2P'",
      color: "#e8720c", stroke: "#000000", strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5).setDepth(5);

    // ── Prompt parpadeante ────────────────────────────────────────
    const prompt = this.add.text(W / 2, H * 0.64, "PRESIONA PARA INICIAR", {
      fontSize: "16px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", stroke: "#0033bb", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5);

    this.tweens.add({
      targets: prompt, alpha: 0.15,
      duration: 1200, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    });

    // ── Scanlines ─────────────────────────────────────────────────
    const scanG = this.add.graphics().setDepth(20);
    scanG.fillStyle(0x000000, 0.07);
    for (let sl = 0; sl < H; sl += 4) {
      scanG.fillRect(0, sl, W, 2);
    }

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

const drawMask = (_g: Phaser.GameObjects.Graphics) => {};

    const spawnRunner = (
      animKey: string, idleKey: string, stopX: number, depth: number, delay: number,
      drawAccessory: (g: Phaser.GameObjects.Graphics) => void
    ) => {
      const gender = animKey.split("_")[1];
      const charY = H - 35;

      const container = this.add.container(-60, charY).setDepth(depth);
      const sprite = this.add.sprite(0, 0, `${gender}_walk0`).setScale(0.7).setOrigin(0.5, 1);
      const accessory = this.add.graphics();
      drawAccessory(accessory);
      container.add([sprite, accessory]);

      sprite.play(animKey);

      const doJump = (onDone: () => void) => {
        this.tweens.add({
          targets: container, y: charY - 80,
          duration: 280, ease: "Power2.easeOut",
          onComplete: () => {
            this.tweens.add({
              targets: container, y: charY,
              duration: 280, ease: "Power2.easeIn",
              onComplete: onDone,
            });
          },
        });
      };

      const run = () => {
        container.setX(-60);
        container.setY(charY);
        container.setAngle(0);
        sprite.play(animKey);

        // Hop mientras corre
        const hopTween = this.tweens.add({
          targets: container, y: charY - 18,
          duration: 200, ease: "Sine.easeOut",
          yoyo: true, repeat: -1,
        });

        this.tweens.add({
          targets: container,
          x: stopX,
          duration: (stopX + 60) / (W + 120) * 5000,
          ease: "Linear",
          onComplete: () => {
            hopTween.stop();
            container.setY(charY);
            sprite.setTexture(idleKey);

            // 3 saltos al llegar
            let jumps = 0;
            const nextJump = () => {
              if (jumps < 3) {
                jumps++;
                doJump(nextJump);
              } else {
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
              }
            };
            nextJump();
          },
        });
      };

      this.time.delayedCall(delay, run);
    };

    spawnRunner("run_female", "female_idle", W * 0.45, 10, 0, drawMask);
    spawnRunner("run_male",   "male_idle",   W * 0.35, 10,
      Math.round((W * 0.15) / (W + 120) * 5000), drawMask);

    // ── Música ────────────────────────────────────────────────────
    // this.sound.add("music_start", { loop: true, volume: 0.5 }).play();

    this.input.keyboard!.once("keydown", () => this.startGame());
    this.input.gamepad!.once("down", () => this.startGame());
  }

  protected startGame() {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("CharacterSelectScene");
    });
  }
}
