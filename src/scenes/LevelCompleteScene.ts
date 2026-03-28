import Phaser from "phaser";

const FONT = "'Press Start 2P'";
const W    = 1280;
const H    = 720;

// speaker: "other" = ser querido, "main" = jugador
const DIALOG: { speaker: "other" | "main"; text: string }[] = [
  { speaker: "other", text: "¡AL FIN LLEGASTE!" },
  { speaker: "main",  text: "FUE UN DÍA DIFÍCIL." },
  { speaker: "other", text: "¿YA VISTE AFUERA?" },
  { speaker: "other", text: "SE ACLARÓ EL CIELO DE NUEVO." },
  { speaker: "other", text: "YA SE VEN LAS MONTAÑAS..." },
  { speaker: "main",  text: ":)" },
];

export class LevelCompleteScene extends Phaser.Scene {
  private inputEnabled  = false;
  private dialogIndex   = 0;
  private typing        = false;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;

  // dialog UI refs
  private dimmer!:    Phaser.GameObjects.Rectangle;
  private boxBg!:     Phaser.GameObjects.Rectangle;
  private boxBorder!: Phaser.GameObjects.Graphics;
  private accentBar!: Phaser.GameObjects.Rectangle;
  private portrait!:  Phaser.GameObjects.Image;
  private lineG!:     Phaser.GameObjects.Graphics;
  private textObj!:   Phaser.GameObjects.Text;
  private typeSound!: Phaser.Sound.BaseSound;
  private promptText!: Phaser.GameObjects.Text;

  constructor() { super("LevelCompleteScene"); }

  preload() {
    if (!this.cache.audio.exists("end_theme"))
      this.load.audio("end_theme", "/assets/sfx/end_theme.mp3");
    if (!this.cache.audio.exists("sfx_typewriter"))
      this.load.audio("sfx_typewriter", "/assets/sfx/typewriter.wav");
    if (!this.textures.exists("bg_mountains"))
      this.load.image("bg_mountains", "/assets/bg/bg_mountains.png");
  }

  create() {
    this.inputEnabled = false;
    this.dialogIndex  = 0;
    this.typing       = false;
    this.pad          = null;

    this.sound.stopAll();
    this.sound.play("end_theme", { loop: true, volume: 0.7 });

    // ── Room background ───────────────────────────────────────────
    const FLOOR_Y = 540;

    this.add.rectangle(W / 2, FLOOR_Y / 2, W, FLOOR_Y, 0xb5724a);
    this.add.rectangle(W / 2, FLOOR_Y + (H - FLOOR_Y) / 2, W, H - FLOOR_Y, 0x5a3010);

    // Brick pattern on wall
    const brickG = this.add.graphics();
    const bW = 80, bH = 28;
    for (let row = 0; row * bH < FLOOR_Y; row++) {
      const offset = (row % 2 === 0) ? 0 : bW / 2;
      for (let col = -1; col * bW < W + bW; col++) {
        const bx = col * bW + offset;
        const by = row * bH;
        brickG.fillStyle(row % 3 === 0 ? 0xc17a52 : 0xb5724a, 1);
        brickG.fillRect(bx + 2, by + 2, bW - 4, bH - 4);
        brickG.lineStyle(1, 0x7a3e20, 0.5);
        brickG.strokeRect(bx + 2, by + 2, bW - 4, bH - 4);
      }
    }
    const woodG = this.add.graphics();
    woodG.lineStyle(1, 0x3a1a08, 0.35);
    for (let y = FLOOR_Y + 18; y < H; y += 18)
      woodG.lineBetween(0, y, W, y);
    this.add.rectangle(W / 2, FLOOR_Y + 10, W, 20, 0x3a1a08);

    // Window
    const winX = 720, winY = 100, winW = 380, winH = 290;
    this.add.rectangle(winX + winW / 2, winY + winH / 2, winW, winH, 0x87ceeb);
    if (this.textures.exists("bg_mountains")) {
      this.add.tileSprite(winX, winY + winH, winW, winH, "bg_mountains")
        .setOrigin(0, 1).setTileScale(winW / 1280);
    }
    const winG = this.add.graphics();
    winG.lineStyle(10, 0xf0e8d8, 1);
    winG.strokeRect(winX, winY, winW, winH);
    winG.lineStyle(6, 0xf0e8d8, 1);
    winG.lineBetween(winX + winW / 2, winY, winX + winW / 2, winY + winH);
    winG.lineBetween(winX, winY + winH / 2, winX + winW, winY + winH / 2);
    winG.fillStyle(0xf0e8d8, 1);
    winG.fillRect(winX - 10, winY + winH, winW + 20, 14);

    this.add.rectangle(W / 2, 0, W, 30, 0x000000).setOrigin(0.5, 0).setAlpha(0.25);

    // Characters
    const charY  = FLOOR_Y;
    const charCX = W * 0.22;
    if (this.textures.exists("char_idle"))
      this.add.image(charCX - 70, charY, "char_idle").setOrigin(0.5, 1).setScale(2.2);
    if (this.textures.exists("other_idle"))
      this.add.image(charCX + 70, charY, "other_idle").setOrigin(0.5, 1).setScale(2.2).setFlipX(true);

    // ── Dialog box (same style as GameScene) ──────────────────────
    const accent = 0xffffff;
    const boxH   = H * 0.30;
    const boxY   = H - boxH * 0.5 - H * 0.04;
    const boxX   = W * 0.04;
    const boxW   = W * 0.92;

    this.dimmer    = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.45).setDepth(30).setAlpha(0);
    this.boxBg     = this.add.rectangle(boxX + boxW / 2, boxY, boxW, boxH, 0x0a0a0a, 0.96).setDepth(31);
    this.boxBorder = this.add.graphics().setDepth(32);
    this.boxBorder.lineStyle(2, accent, 1);
    this.boxBorder.strokeRect(boxX, boxY - boxH / 2, boxW, boxH);
    this.accentBar = this.add.rectangle(boxX + boxW / 2, boxY - boxH / 2, boxW, 3, accent, 1).setDepth(32);

    const portraitSize = boxH * 0.75;
    const portraitX    = boxX + portraitSize * 0.56;
    this.portrait = this.add.image(portraitX, boxY - 20, "other_idle").setDepth(33).setScale(portraitSize / 128);

    const sepX = portraitX + portraitSize * 0.56;
    this.lineG = this.add.graphics().setDepth(32);
    this.lineG.lineStyle(1, accent, 0.4);
    this.lineG.lineBetween(sepX, boxY - boxH / 2 + 10, sepX, boxY + boxH / 2 - 10);

    this.textObj = this.add.text(sepX + W * 0.03, boxY - 65, "", {
      fontSize: "13px", fontFamily: FONT,
      color: "#cccccc", wordWrap: { width: boxX + boxW - sepX - W * 0.06 }, lineSpacing: 6,
    }).setOrigin(0, 0).setDepth(33);

    this.promptText = this.add.text(boxX + boxW - 16, boxY + boxH / 2 - 14, "▼", {
      fontSize: "12px", fontFamily: FONT, color: "#ffffff",
    }).setOrigin(1, 1).setDepth(33).setAlpha(0);
    this.tweens.add({ targets: this.promptText, alpha: 1, duration: 400, yoyo: true, repeat: -1 });

    this.typeSound = this.sound.add("sfx_typewriter", { loop: true, volume: 0.35 });

    // Fade in then start dialog
    this.cameras.main.fadeIn(800, 0, 0, 0);
    this.tweens.add({ targets: this.dimmer, alpha: 1, duration: 500, delay: 600 });
    this.time.delayedCall(1200, () => {
      this.showDialog(0);
      // Input
      this.input.keyboard!.on("keydown", () => this.onAdvance());
      this.input.gamepad!.on("connected", (p: Phaser.Input.Gamepad.Gamepad) => { this.pad = p; });
      if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);
    });
  }

  update() {
    if (!this.pad) return;
    const btn = this.pad.buttons[0]?.pressed || this.pad.buttons[1]?.pressed;
    if (btn && !this._btnHeld) { this._btnHeld = true; this.onAdvance(); }
    if (!btn) this._btnHeld = false;
  }
  private _btnHeld = false;

  private showDialog(index: number) {
    if (index >= DIALOG.length) { this.showFinish(); return; }

    const entry = DIALOG[index];
    const portraitKey = entry.speaker === "other" ? "other_idle" : "char_idle";
    if (this.textures.exists(portraitKey)) {
      this.portrait.setTexture(portraitKey);
      this.portrait.setFlipX(entry.speaker === "main");
    }

    this.textObj.setText("");
    this.promptText.setAlpha(0);
    this.typing = true;

    const fullText = entry.text;
    let i = 0;
    const typeChar = () => {
      if (i >= fullText.length) {
        this.typeSound.stop();
        this.typing = false;
        this.tweens.add({ targets: this.promptText, alpha: 1, duration: 200 });
        return;
      }
      const ch = fullText[i];
      if (ch !== " " && !this.typeSound.isPlaying) this.typeSound.play();
      this.textObj.setText(fullText.slice(0, ++i));
      this.time.delayedCall(45, typeChar);
    };
    this.time.delayedCall(100, typeChar);
  }

  private onAdvance() {
    if (this.inputEnabled) return;
    if (this.typing) {
      // Skip to end of current line
      this.typeSound.stop();
      this.typing = false;
      const entry = DIALOG[this.dialogIndex];
      this.textObj.setText(entry.text);
      this.tweens.add({ targets: this.promptText, alpha: 1, duration: 200 });
      return;
    }
    if (this.cache.audio.exists("sfx_select")) this.sound.play("sfx_select", { volume: 1.0 });
    this.dialogIndex++;
    this.showDialog(this.dialogIndex);
  }

  private showFinish() {
    this.typeSound.stop();

    // Pausa de 3s con el último mensaje visible, luego fade out del dialog box
    this.time.delayedCall(3000, () => {
      [this.dimmer, this.boxBg, this.boxBorder, this.accentBar,
       this.portrait, this.lineG, this.textObj, this.promptText].forEach(o =>
        this.tweens.add({ targets: o, alpha: 0, duration: 800 })
      );

      // Música se apaga mientras el cuarto sigue visible
      const music = this.sound.getAll("end_theme").find(s => s.isPlaying) ?? this.sound.get("end_theme");
      if (music) this.tweens.add({ targets: music, volume: 0, duration: 2500 });

      // Fade a negro después de que desaparece el dialog
      this.time.delayedCall(2800, () => {
        this.cameras.main.fadeOut(1800, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.sound.stopAll();
          this.scene.start("BootScene");
        });
      });
    });
  }
}
