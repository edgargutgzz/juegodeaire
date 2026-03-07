import Phaser from "phaser";

export class CharacterSelectScene extends Phaser.Scene {
  private selected: "male" | "female" = "male";

  constructor() {
    super("CharacterSelectScene");
  }

  preload() {
    this.load.image("select_male", "/assets/character/character_maleAdventurer_idle.png");
    this.load.image("select_female", "/assets/character/character_femaleAdventurer_idle.png");
  }

  create() {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0xc8d8e0);
    this.add.rectangle(width / 2, height * 0.75, width, height * 0.5, 0xb0b8a8, 0.35);

    this.add.text(width / 2, height * 0.12, "ELIGE TU PERSONAJE", {
      fontSize: "42px",
      fontFamily: "monospace",
      color: "#2d2d2d",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Male option
    const maleX = width * 0.32;
    const femaleX = width * 0.68;
    const charY = height * 0.45;

    const maleBg = this.add.rectangle(maleX, charY, 220, 280, 0x000000, 0.08).setInteractive();
    const femaleBg = this.add.rectangle(femaleX, charY, 220, 280, 0x000000, 0.08).setInteractive();

    this.add.image(maleX, charY - 20, "select_male").setScale(0.7);
    this.add.image(femaleX, charY - 20, "select_female").setScale(0.7);

    this.add.text(maleX, charY + 110, "ÉL", {
      fontSize: "24px", fontFamily: "monospace", color: "#2d2d2d", fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(femaleX, charY + 110, "ELLA", {
      fontSize: "24px", fontFamily: "monospace", color: "#2d2d2d", fontStyle: "bold",
    }).setOrigin(0.5);

    // Selection highlight
    const highlight = this.add.rectangle(maleX, charY, 224, 284, 0x22cc66, 0).setStrokeStyle(3, 0x22cc66);
    this.updateHighlight(highlight, maleX, femaleX, charY);

    // Click / tap
    maleBg.on("pointerdown", () => {
      this.selected = "male";
      this.updateHighlight(highlight, maleX, femaleX, charY);
    });
    femaleBg.on("pointerdown", () => {
      this.selected = "female";
      this.updateHighlight(highlight, maleX, femaleX, charY);
    });

    // Confirm prompt
    const prompt = this.add.text(width / 2, height * 0.82, "presiona ENTER o A para continuar", {
      fontSize: "20px", fontFamily: "monospace", color: "#2d2d2d",
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0, duration: 600, yoyo: true, repeat: -1 });

    // Keyboard navigation
    this.input.keyboard!.on("keydown-LEFT", () => {
      this.selected = "male";
      this.updateHighlight(highlight, maleX, femaleX, charY);
    });
    this.input.keyboard!.on("keydown-RIGHT", () => {
      this.selected = "female";
      this.updateHighlight(highlight, maleX, femaleX, charY);
    });
    this.input.keyboard!.on("keydown-ENTER", () => this.confirm());
    this.input.keyboard!.on("keydown-SPACE", () => this.confirm());

    // Gamepad
    this.input.gamepad!.on("down", (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (button.index === 14) { this.selected = "male"; this.updateHighlight(highlight, maleX, femaleX, charY); }
      if (button.index === 15) { this.selected = "female"; this.updateHighlight(highlight, maleX, femaleX, charY); }
      if (button.index === 0) this.confirm(); // A button
    });
  }

  private updateHighlight(
    highlight: Phaser.GameObjects.Rectangle,
    maleX: number, femaleX: number, charY: number
  ) {
    highlight.setPosition(this.selected === "male" ? maleX : femaleX, charY);
  }

  private confirm() {
    this.registry.set("character", this.selected);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("GameScene");
    });
  }
}
