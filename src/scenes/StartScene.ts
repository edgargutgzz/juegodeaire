import Phaser from "phaser";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("StartScene");
  }

  preload() {}

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Título (dos líneas separadas para efecto por línea) ───────
    const applyGradient = (obj: Phaser.GameObjects.Text) => {
      const grad = obj.context.createLinearGradient(0, 0, 0, obj.height);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#ff8833");
      obj.setFill(grad);
    };

    const line1 = this.add.text(W / 2, H * 0.30, "NO SE VEN", {
      fontSize: "52px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", align: "center",
    }).setOrigin(0.5).setAlpha(0);
    applyGradient(line1);

    const line2 = this.add.text(W / 2, H * 0.30 + 80, "LAS MONTAÑAS", {
      fontSize: "52px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", align: "center",
    }).setOrigin(0.5).setAlpha(0);
    applyGradient(line2);

    // ── Prompt parpadeante (aparece tras el intro) ────────────────
    const prompt = this.add.text(W / 2, H * 0.75, "PRESIONA PARA INICIAR", {
      fontSize: "16px", fontFamily: "'Press Start 2P'",
      color: "#ffffff",
    }).setOrigin(0.5).setAlpha(0);

    // ── Efecto flicker por línea ──────────────────────────────────
    const flicker = (obj: Phaser.GameObjects.Text, onDone: () => void) => {
      const steps = [0.9, 0, 0.7, 0, 0, 1, 0.4, 0, 1, 0.6, 1, 0, 1];
      let i = 0;
      const next = () => {
        if (i >= steps.length) {
          obj.setAlpha(1);
          onDone();
          return;
        }
        obj.setAlpha(steps[i++]);
        this.time.delayedCall(40 + Math.random() * 70, next);
      };
      next();
    };

    // Línea 1 aparece a los 0.8s, línea 2 después, luego prompt
    this.time.delayedCall(200, () => {
      this.sound.stopAll();
      this.sound.play("venus", { loop: true, volume: 0.6 });
    });

    this.time.delayedCall(1800, () => {
      flicker(line1, () => {
        this.time.delayedCall(400, () => {
          flicker(line2, () => {
            this.time.delayedCall(600, () => {
              prompt.setAlpha(1);
              this.tweens.add({
                targets: prompt, alpha: 0.15,
                duration: 1200, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
              });
              this.input.keyboard!.once("keydown", () => { this.sound.play("sfx_select", { volume: 1.0 }); this.startGame(); });
              this.input.gamepad!.once("down", () => { this.sound.play("sfx_select", { volume: 1.0 }); this.startGame(); });
            });
          });
        });
      });
    });
  }

  protected startGame() {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("DifficultyScene"));
  }
}
