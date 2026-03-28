import Phaser from "phaser";

const FONT       = "'Press Start 2P'";
const W          = 1280;
const H          = 720;
const CHAR_DELAY = 45;
const LINE_PAUSE = 300;

const LINES: { text: string; gap?: boolean; big?: boolean }[] = [
  { text: "Llegaste a casa.", big: true },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "Hoy sobreviviste." },
  { text: "", gap: true },
  { text: "Pero en el AMM, el 60% de los dias" },
  { text: "tienen mala calidad del aire." },
  { text: "", gap: true },
  { text: "3,000 muertes prematuras cada año." },
  { text: "", gap: true },
  { text: "El smog no descansa." },
  { text: "Pero tampoco tú." },
];

export class LevelCompleteScene extends Phaser.Scene {
  private inputEnabled = false;

  constructor() { super("LevelCompleteScene"); }

  preload() {
    if (!this.cache.audio.exists("end_theme"))
      this.load.audio("end_theme", "/assets/sfx/end_theme.mp3");
  }

  create() {
    this.inputEnabled = false;
    this.sound.play("end_theme", { loop: true, volume: 0.7 });

    // ── Room background ───────────────────────────────────────────
    const FLOOR_Y = 540;

    // Wall (warm beige)
    this.add.rectangle(W / 2, FLOOR_Y / 2, W, FLOOR_Y, 0xc9a87a);

    // Floor (wood)
    this.add.rectangle(W / 2, FLOOR_Y + (H - FLOOR_Y) / 2, W, H - FLOOR_Y, 0x5a3010);
    // Wood grain lines
    const woodG = this.add.graphics();
    woodG.lineStyle(1, 0x3a1a08, 0.35);
    for (let y = FLOOR_Y + 18; y < H; y += 18)
      woodG.lineBetween(0, y, W, y);
    // Baseboard
    this.add.rectangle(W / 2, FLOOR_Y + 10, W, 20, 0x3a1a08);

    // Window (right side of wall) — smoggy sky outside
    const winX = 880, winY = 160, winW = 320, winH = 240;
    const winG = this.add.graphics();
    // Sky outside (smoggy orange-gray)
    winG.fillStyle(0xb8845a, 1);
    winG.fillRect(winX, winY, winW, winH);
    // Smog haze layers
    winG.fillStyle(0xd4a060, 0.4);
    winG.fillRect(winX, winY, winW, winH / 2);
    winG.fillStyle(0x8a6040, 0.3);
    winG.fillRect(winX, winY + winH / 2, winW, winH / 2);
    // Window frame (white)
    winG.lineStyle(10, 0xf0e8d8, 1);
    winG.strokeRect(winX, winY, winW, winH);
    // Cross bars
    winG.lineStyle(6, 0xf0e8d8, 1);
    winG.lineBetween(winX + winW / 2, winY, winX + winW / 2, winY + winH);
    winG.lineBetween(winX, winY + winH / 2, winX + winW, winY + winH / 2);
    // Window sill
    winG.fillStyle(0xf0e8d8, 1);
    winG.fillRect(winX - 10, winY + winH, winW + 20, 14);

    // Wall shadow at top
    this.add.rectangle(W / 2, 0, W, 30, 0x000000).setOrigin(0.5, 0).setAlpha(0.25);

    // ── Characters (standing on floor) ────────────────────────────
    const charY = FLOOR_Y;
    const charCX = W * 0.22;

    if (this.textures.exists("char_idle")) {
      this.add.image(charCX - 70, charY, "char_idle")
        .setOrigin(0.5, 1).setScale(2.2);
    }
    if (this.textures.exists("other_idle")) {
      this.add.image(charCX + 70, charY, "other_idle")
        .setOrigin(0.5, 1).setScale(2.2).setFlipX(true);
    }

    // ── Typewriter text (right panel) ─────────────────────────────
    const startX = W * 0.38;
    const startY = H * 0.08;
    const LINE_H = 44;
    const GAP_H  = 22;
    let currentY = startY;

    const typeEntry = (index: number) => {
      if (index >= LINES.length) {
        showPrompt();
        return;
      }

      const line = LINES[index];

      if (line.gap) {
        currentY += GAP_H;
        this.time.delayedCall(LINE_PAUSE / 2, () => typeEntry(index + 1));
        return;
      }

      const posY = currentY;
      currentY += line.big ? LINE_H + 12 : LINE_H;

      const textObj = this.add.text(startX, posY, "", {
        fontSize: line.big ? "22px" : "14px",
        fontFamily: FONT,
        color: "#ffffff",
      }).setOrigin(0, 0).setDepth(4);

      textObj.setColor("#ffffff");

      const text = line.text;
      let charIndex = 0;
      const typeChar = () => {
        if (charIndex >= text.length) {
          this.time.delayedCall(LINE_PAUSE, () => typeEntry(index + 1));
          return;
        }
        textObj.setText(text.slice(0, charIndex + 1));
        charIndex++;
        this.time.delayedCall(CHAR_DELAY, typeChar);
      };
      typeChar();
    };

    // ── Prompt ────────────────────────────────────────────────────
    const showPrompt = () => {
      this.time.delayedCall(1200, () => {
        const prompt = this.add.text(W / 2, H * 0.88, "PRESIONA PARA CONTINUAR", {
          fontSize: "14px", fontFamily: FONT, color: "#ffffff",
        }).setOrigin(0.5).setAlpha(0).setDepth(10);

        this.tweens.add({ targets: prompt, alpha: 1, duration: 600 });
        this.tweens.add({ targets: prompt, alpha: 0.2, duration: 900,
          delay: 600, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });

        this.inputEnabled = true;
        this.input.keyboard!.once("keydown", () => this.finish());
        const gp = this.input.gamepad!;
        gp.on("connected", () => {});
        if (gp.total > 0) {
          const pad = gp.getPad(0);
          const check = () => {
            if (!this.inputEnabled) return;
            if (pad.buttons[0]?.pressed || pad.buttons[1]?.pressed) { this.finish(); return; }
            this.time.delayedCall(100, check);
          };
          this.time.delayedCall(100, check);
        }
      });
    };

    this.cameras.main.fadeIn(800, 0, 0, 0);
    this.time.delayedCall(600, () => typeEntry(0));
  }

  private finish() {
    if (!this.inputEnabled) return;
    this.inputEnabled = false;
    if (this.cache.audio.exists("sfx_select")) this.sound.play("sfx_select", { volume: 1.0 });
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.sound.stopAll();
      this.scene.start("BootScene");
    });
  }
}
