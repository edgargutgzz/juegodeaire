import Phaser from "phaser";

const CHARACTERS = {
  normal: [
    { key: "malePerson",   hasWalk: true },
    { key: "femalePerson", hasWalk: true },
  ],
  dificil: [
    { key: "maleAdventurer",   hasWalk: true },
    { key: "femaleAdventurer", hasWalk: true  },
  ],
} as const;

const WALK_FRAMES = 8;
const WALK_FPS    = 100; // ms por frame

export class CharacterScene extends Phaser.Scene {
  private selected = 0;
  private confirmed = false;
  private inputEnabled = false;
  private inputCooldown = 0;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private cardBgs: Phaser.GameObjects.Rectangle[] = [];
  private cardBorders: Phaser.GameObjects.Graphics[] = [];
  private charImages: Phaser.GameObjects.Image[] = [];
  private flashTween: Phaser.Tweens.Tween | null = null;
  private animTimer: Phaser.Time.TimerEvent | null = null;
  private animFrame = 0;
  private accentColor = 0x2ecc87;
  private bgSelected  = 0x0e1a16;
  private options: { key: string; hasWalk: boolean }[] = [];

  constructor() { super("CharacterScene"); }

  preload() {
    const all = [...CHARACTERS.normal, ...CHARACTERS.dificil];
    all.forEach(c => {
      this.load.image(`idle_${c.key}`, `/assets/character/character_${c.key}_idle.png`);
      if (c.hasWalk) {
        for (let i = 0; i < WALK_FRAMES; i++) {
          this.load.image(`walk_${c.key}_${i}`, `/assets/character/character_${c.key}_walk${i}.png`);
        }
      }
    });
    if (!this.cache.audio.exists("sfx_select"))
      this.load.audio("sfx_select", "/assets/sfx/vgmenuselect.ogg");
  }

  create() {
    this.selected = 0;
    this.confirmed = false;
    this.inputEnabled = false;
    this.inputCooldown = 0;
    this.cardBgs = [];
    this.cardBorders = [];
    this.charImages = [];
    this.animFrame = 0;

    const W = this.scale.width;
    const H = this.scale.height;

    const difficulty = this.registry.get("difficulty") as "normal" | "dificil" ?? "normal";
    this.options = [...CHARACTERS[difficulty]];

    const isHard = difficulty === "dificil";
    this.accentColor = isHard ? 0xff5533 : 0x2ecc87;
    this.bgSelected  = isHard ? 0x1a0e0b : 0x0e1a16;

    // ── Background ────────────────────────────────────────────────
    this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0);

    // ── Título ────────────────────────────────────────────────────
    const titleText = this.add.text(W / 2, H * 0.055, "ELIGE TU PERSONAJE", {
      fontSize: "22px", fontFamily: "'Press Start 2P'",
      color: "#ffffff",
    }).setOrigin(0.5, 0);
    const titleGrad = titleText.context.createLinearGradient(0, 0, 0, titleText.height);
    titleGrad.addColorStop(0, "#ffffff");
    titleGrad.addColorStop(1, "#ff8833");
    titleText.setFill(titleGrad);

    // ── Cards ─────────────────────────────────────────────────────
    const cardY  = H * 0.15;
    const cardH  = H * 0.72;
    const gap    = W * 0.04;
    const margin = W * 0.06;
    const cardW  = (W - margin * 2 - gap) / 2;
    const cardX0 = margin;

    this.options.forEach((opt, i) => {
      const cardX = cardX0 + i * (cardW + gap);

      // Sombra
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.07);
      shadow.fillRect(cardX + 5, cardY + 5, cardW, cardH);

      // Fondo card
      const bg = this.add.rectangle(cardX, cardY, cardW, cardH, 0x111111).setOrigin(0);
      this.cardBgs.push(bg);

      // Barra de color superior
      this.add.rectangle(cardX, cardY, cardW, 5, this.accentColor).setOrigin(0);

      // Borde
      const border = this.add.graphics();
      this.cardBorders.push(border);

      // Sprite
      const img = this.add.image(cardX + cardW / 2, cardY + cardH / 2, `idle_${opt.key}`)
        .setOrigin(0.5)
        .setScale(2.2);
      this.charImages.push(img);
    });

    // ── Input ─────────────────────────────────────────────────────
    this.time.delayedCall(300, () => {
      this.inputEnabled = true;
      this.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
        if (!this.inputEnabled || this.confirmed) return;
        if (e.code === "ArrowLeft" || e.code === "ArrowUp") {
          this.selected = 0; this.sound.play("sfx_select", { volume: 1.0 }); this.updateUI();
        } else if (e.code === "ArrowRight" || e.code === "ArrowDown") {
          this.selected = 1; this.sound.play("sfx_select", { volume: 1.0 }); this.updateUI();
        } else if (e.code === "Enter" || e.code === "Space") {
          this.confirm();
        }
      });
      this.input.gamepad!.on("connected", (pad: Phaser.Input.Gamepad.Gamepad) => { this.pad = pad; });
      if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);
    });

    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.updateUI();
  }

  update(_t: number, delta: number) {
    if (this.confirmed || !this.inputEnabled) return;
    this.inputCooldown -= delta;
    if (this.inputCooldown > 0 || !this.pad) return;

    const left  = (this.pad.leftStick.x < -0.5) || this.pad.left  || (this.pad.leftStick.y < -0.5) || this.pad.up;
    const right = (this.pad.leftStick.x > 0.5)  || this.pad.right || (this.pad.leftStick.y > 0.5)  || this.pad.down;
    const btn   = this.pad.buttons[0]?.pressed || this.pad.buttons[1]?.pressed;

    if (btn) { this.confirm(); return; }
    if (left)  { this.selected = 0; this.inputCooldown = 200; this.sound.play("sfx_select", { volume: 1.0 }); this.updateUI(); }
    else if (right) { this.selected = 1; this.inputCooldown = 200; this.sound.play("sfx_select", { volume: 1.0 }); this.updateUI(); }
  }

  private updateUI() {
    const W = this.scale.width;
    const H = this.scale.height;
    const cardY  = H * 0.15;
    const cardH  = H * 0.72;
    const gap    = W * 0.04;
    const margin = W * 0.06;
    const cardW  = (W - margin * 2 - gap) / 2;
    const cardX0 = margin;

    if (this.flashTween) { this.flashTween.stop(); this.flashTween = null; }
    if (this.animTimer)  { this.animTimer.remove(); this.animTimer = null; }

    // Resetear todos los sprites a idle
    this.options.forEach((opt, i) => {
      this.charImages[i].setTexture(`idle_${opt.key}`);
    });

    // Borders y backgrounds
    this.cardBgs.forEach((bg, i) => {
      bg.setFillStyle(i === this.selected ? this.bgSelected : 0x111111);
    });

    this.cardBorders.forEach((g, i) => {
      g.clear();
      const cardX = cardX0 + i * (cardW + gap);
      const isSelected = i === this.selected;
      g.lineStyle(isSelected ? 3 : 1, isSelected ? this.accentColor : 0x333333, 1);
      g.strokeRect(cardX, cardY, cardW, cardH);
    });

    this.flashTween = this.tweens.add({
      targets: this.cardBorders[this.selected], alpha: 0.4,
      duration: 500, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });

    // Animación walk en el personaje seleccionado
    const selOpt = this.options[this.selected];
    if (selOpt.hasWalk) {
      this.animFrame = 0;
      this.animTimer = this.time.addEvent({
        delay: WALK_FPS,
        loop: true,
        callback: () => {
          this.charImages[this.selected].setTexture(`walk_${selOpt.key}_${this.animFrame}`);
          this.animFrame = (this.animFrame + 1) % WALK_FRAMES;
        },
      });
    }
  }

  private confirm() {
    if (this.confirmed) return;
    this.confirmed = true;
    if (this.animTimer) { this.animTimer.remove(); this.animTimer = null; }
    this.sound.play("sfx_select", { volume: 1.0 });
    this.registry.set("character", this.options[this.selected].key);

    const music = this.sound.get("venus");
    if (music) {
      this.tweens.add({ targets: music, volume: 0, duration: 1200, onComplete: () => {
        this.sound.stopAll();
        this.scene.start("GameScene");
      }});
    } else {
      this.scene.start("GameScene");
    }
  }
}
