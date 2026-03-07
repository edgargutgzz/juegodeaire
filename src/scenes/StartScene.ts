import Phaser from "phaser";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("StartScene");
  }

  create() {
    const { width, height } = this.scale;

    // Sky background
    this.add.rectangle(width / 2, height / 2, width, height, 0xc8d8e0);

    // Hazy smog layer
    this.add.rectangle(width / 2, height * 0.75, width, height * 0.5, 0xb0b8a8, 0.35);

    // Title
    this.add.text(width / 2, height * 0.35, "JUEGO DE AIRE", {
      fontSize: "72px",
      fontFamily: "monospace",
      color: "#2d2d2d",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(width / 2, height * 0.5, "a game about the air you breathe", {
      fontSize: "22px",
      fontFamily: "monospace",
      color: "#555555",
    }).setOrigin(0.5);

    // Prompt
    const prompt = this.add.text(width / 2, height * 0.7, "press any key or button to start", {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#2d2d2d",
    }).setOrigin(0.5);

    // Blink the prompt
    this.tweens.add({
      targets: prompt,
      alpha: 0,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Keyboard
    this.input.keyboard!.once("keydown", () => this.startGame());

    // Gamepad
    this.input.gamepad!.once("connected", () => {
      this.input.gamepad!.once("down", () => this.startGame());
    });
    // If gamepad already connected
    if (this.input.gamepad!.total > 0) {
      this.input.gamepad!.once("down", () => this.startGame());
    }
  }

  private startGame() {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("CharacterSelectScene");
    });
  }
}
