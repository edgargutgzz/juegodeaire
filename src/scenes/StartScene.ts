import Phaser from "phaser";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("StartScene");
  }

  preload() {
    this.load.audio("bgmusic", "/assets/music/bgmusic.wav");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Banner del título ─────────────────────────────────────────
    const bannerW = W * 0.78;
    const bannerH = H * 0.38;
    const bannerX = W / 2 - bannerW / 2;
    const bannerY = H * 0.06;
    const bannerG = this.add.graphics().setDepth(10);
    bannerG.fillStyle(0x000000, 0.35);
    bannerG.fillRect(bannerX + 6, bannerY + 6, bannerW, bannerH);
    bannerG.fillGradientStyle(0x001833, 0x001833, 0x002f66, 0x002f66, 0.94);
    bannerG.fillRect(bannerX, bannerY, bannerW, bannerH);
    bannerG.lineStyle(4, 0x44aaff, 1);
    bannerG.strokeRect(bannerX, bannerY, bannerW, bannerH);
    bannerG.lineStyle(1.5, 0x1177dd, 0.6);
    bannerG.strokeRect(bannerX + 6, bannerY + 6, bannerW - 12, bannerH - 12);

    // ── Título ────────────────────────────────────────────────────
    this.add.text(W / 2, H * 0.25, "NO SE VEN\nLAS MONTAÑAS", {
      fontSize: "52px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", stroke: "#003388", strokeThickness: 10,
      align: "center", lineSpacing: 18,
      shadow: { offsetX: 5, offsetY: 5, color: "#001155", blur: 0, fill: true },
    }).setOrigin(0.5).setDepth(15);

    // ── Prompt parpadeante ────────────────────────────────────────
    const prompt = this.add.text(W / 2, H * 0.76, "PRESIONA PARA INICIAR", {
      fontSize: "16px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", stroke: "#003388", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(15);

    this.tweens.add({
      targets: prompt, alpha: 0.15,
      duration: 1200, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    });

    // Start music on first input (browser autoplay policy requires user gesture)
    const startMusic = () => {
      if (!this.sound.get("bgmusic")) {
        this.sound.play("bgmusic", { loop: true, volume: 0.6 });
      }
    };

    this.input.keyboard!.once("keydown", () => { startMusic(); this.startGame(); });
    this.input.gamepad!.once("down", () => { startMusic(); this.startGame(); });
  }

  protected startGame() {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("GameScene");
    });
  }
}
