import Phaser from "phaser";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("StartScene");
  }

  preload() {
    this.load.image("bg_start", "/assets/bg_start.jpg");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Fondo
    const bg = this.add.image(W / 2, H / 2, "bg_start");
    const scaleX = W / bg.width;
    const scaleY = H / bg.height;
    bg.setScale(Math.max(scaleX, scaleY)).setDepth(0);

    // Overlay uniforme sutil
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(0, 0, W, H);

    // ── Título ─────────────────────────────────────────────────────
    this.add.text(W / 2, H * 0.22, "JUEGO DEL AIRE", {
      fontSize: "52px",
      fontFamily: "'Press Start 2P'",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2);

    // Línea decorativa
    this.add.rectangle(W / 2, H * 0.36, 480, 2, 0xffffff, 0.9).setDepth(2);

    // Subtítulo — stroke para legibilidad sobre cualquier fondo
    this.add.text(W / 2, H * 0.42, "respira. esquiva. sobrevive.", {
      fontSize: "16px",
      fontFamily: "'Press Start 2P'",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    // Prompt con fondo oscuro
    const prompt = this.add.text(W / 2, H * 0.92, "PRESIONA PARA INICIAR", {
      fontSize: "13px",
      fontFamily: "'Press Start 2P'",
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(2);

    this.tweens.add({ targets: prompt, alpha: 0.1, duration: 700, yoyo: true, repeat: -1 });

    this.input.keyboard!.once("keydown", () => this.startGame());
    this.input.on("pointerdown", () => this.startGame());
    if (this.input.gamepad) {
      this.input.gamepad.once("connected", () => {
        this.input.gamepad!.once("down", () => this.startGame());
      });
      if (this.input.gamepad.total > 0) {
        this.input.gamepad.once("down", () => this.startGame());
      }
    }
  }

  protected startGame() {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("GameScene");
    });
  }
}
