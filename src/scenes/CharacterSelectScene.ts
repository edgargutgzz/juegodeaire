import Phaser from "phaser";

type Profile = "healthy" | "sensitive";
type Gender  = "male" | "female";

interface CardRefs {
  profile: Profile;
  border: Phaser.GameObjects.Rectangle;
  maleSprite: Phaser.GameObjects.Image;
  femaleSprite: Phaser.GameObjects.Image;
  maleHl: Phaser.GameObjects.Rectangle;
  femaleHl: Phaser.GameObjects.Rectangle;
}

export class CharacterSelectScene extends Phaser.Scene {
  private profile: Profile = "healthy";
  private gender: Gender   = "female";
  private cards: CardRefs[] = [];

  constructor() {
    super("CharacterSelectScene");
  }

  preload() {
    this.load.image("sel_male_adv",   "/assets/character/character_maleAdventurer_idle.png");
    this.load.image("sel_female_adv", "/assets/character/character_femaleAdventurer_idle.png");
    this.load.image("sel_male_per",   "/assets/character/character_malePerson_idle.png");
    this.load.image("sel_female_per", "/assets/character/character_femalePerson_idle.png");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.cards = [];

    // ── Fondo ─────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14).setDepth(0);

    // ── Título ────────────────────────────────────────────────────
    this.add.text(W / 2, H * 0.09, "ELIGE TU PERSONAJE", {
      fontSize: "22px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(1);

    const colLeft  = W * 0.27;
    const colRight = W * 0.73;
    const cardW    = W * 0.38;
    const cardH    = H * 0.72;
    const cardY    = H * 0.55;

    const defs = [
      {
        profile: "healthy" as Profile,
        x: colLeft,
        label: "POBLACION GENERAL",
        diff: "NORMAL",
        diffColor: "#44cc66",
        barFill: 0.75,
        barColor: 0x44cc66,
        groups: [],
        maleKey: "sel_male_adv",
        femaleKey: "sel_female_adv",
      },
      {
        profile: "sensitive" as Profile,
        x: colRight,
        label: "POBLACION SENSIBLE",
        diff: "DIFICIL",
        diffColor: "#ff4444",
        barFill: 0.30,
        barColor: 0xff4444,
        groups: [
          { icon: "👧", label: "Ninos menores de 12" },
          { icon: "👴", label: "Adultos mayores" },
          { icon: "🤰", label: "Embarazadas" },
          { icon: "🫁", label: "Cond. respiratoria" },
        ],
        maleKey: "sel_male_per",
        femaleKey: "sel_female_per",
      },
    ];

    defs.forEach(({ profile, x, label, diff, diffColor, barFill, barColor, groups, maleKey, femaleKey }) => {
      // Card background
      this.add.rectangle(x, cardY, cardW, cardH, 0x1a1a2e).setDepth(1);

      // Card border
      const border = this.add.rectangle(x, cardY, cardW, cardH, 0x000000, 0)
        .setStrokeStyle(3, 0x444466)
        .setDepth(2);

      // Label
      this.add.text(x, cardY - cardH * 0.44, label, {
        fontSize: "11px", fontFamily: "'Press Start 2P'", color: "#cccccc",
      }).setOrigin(0.5).setDepth(3);

      // Difficulty
      this.add.text(x, cardY - cardH * 0.34, diff, {
        fontSize: "13px", fontFamily: "'Press Start 2P'", color: diffColor,
      }).setOrigin(0.5).setDepth(3);

      // Sprites
      const femaleX = x - cardW * 0.22;
      const maleX   = x + cardW * 0.22;
      const spriteY = cardY - cardH * 0.04;

      const femaleSprite = this.add.image(femaleX, spriteY, femaleKey).setScale(0.85).setOrigin(0.5, 1).setDepth(3).setInteractive();
      const maleSprite   = this.add.image(maleX,   spriteY, maleKey).setScale(0.85).setOrigin(0.5, 1).setDepth(3).setInteractive();

      // Gender highlight boxes
      const femaleHl = this.add.rectangle(femaleX, spriteY - 38, 90, 130, 0x000000, 0).setStrokeStyle(2, 0xffffff, 0).setDepth(2);
      const maleHl   = this.add.rectangle(maleX,   spriteY - 38, 90, 130, 0x000000, 0).setStrokeStyle(2, 0xffffff, 0).setDepth(2);

      // ── Barra de resistencia ─────────────────────────────────
      const barY    = cardY + cardH * 0.22;
      const barW    = cardW * 0.75;
      const barH2   = 10;
      const barLeft = x - barW / 2;

      this.add.text(x - barW / 2, barY - 32, "❤", {
        fontSize: "14px", fontFamily: "Arial", color: "#aaaaaa",
      }).setOrigin(0, 0.5).setDepth(3);
      this.add.text(x - barW / 2 + 20, barY - 31, "RESISTENCIA A CONTAMINACION", {
        fontSize: "9px", fontFamily: "'Press Start 2P'", color: "#aaaaaa",
      }).setOrigin(0, 0.5).setDepth(3);

      // Segmented bar (Mega Man style, horizontal)
      const segments  = 14;
      const segGap    = 2;
      const segW      = (barW - segGap * (segments - 1)) / segments;
      const filledSeg = Math.round(segments * barFill);
      const barG      = this.add.graphics().setDepth(3);
      // Marco exterior
      barG.fillStyle(0x000000, 1);
      barG.fillRect(barLeft - 3, barY - barH2 / 2 - 3, barW + 6, barH2 + 6);
      barG.lineStyle(2, 0x555566, 1);
      barG.strokeRect(barLeft - 3, barY - barH2 / 2 - 3, barW + 6, barH2 + 6);
      // Segmentos
      for (let i = 0; i < segments; i++) {
        const segX   = barLeft + i * (segW + segGap);
        const filled = i < filledSeg;
        barG.fillStyle(filled ? barColor : 0x1a1a2a, 1);
        barG.fillRect(segX, barY - barH2 / 2, segW, barH2);
        // Highlight superior
        if (filled) {
          barG.fillStyle(0xffffff, 0.15);
          barG.fillRect(segX, barY - barH2 / 2, segW, 2);
        }
      }


      // ── Grupos ────────────────────────────────────────────────
      if (groups.length > 0) {
        const rowH   = 26;
        const startY = cardY + cardH * 0.38;
        const colW   = cardW * 0.5;
        const col0X  = x - cardW * 0.42;
        groups.forEach(({ label }, i) => {
          const col  = i % 2;
          const row  = Math.floor(i / 2);
          const rowY = startY + row * rowH;
          const labelX = col0X + col * colW;
          this.add.text(labelX, rowY, `> ${label}`, {
            fontSize: "8px", fontFamily: "'Press Start 2P'", color: "#ff8888",
          }).setOrigin(0, 0.5).setDepth(3);
        });
      }

      // Hit area
      const hit = this.add.rectangle(x, cardY, cardW, cardH, 0xffffff, 0).setDepth(4).setInteractive();
      hit.on("pointerdown", () => { this.profile = profile; this.refresh(); });

      femaleSprite.on("pointerdown", () => { this.profile = profile; this.gender = "female"; this.refresh(); });
      maleSprite.on("pointerdown",   () => { this.profile = profile; this.gender = "male";   this.refresh(); });

      this.cards.push({ profile, border, maleSprite, femaleSprite, maleHl, femaleHl });
    });

    // ── Teclado ───────────────────────────────────────────────────
    this.input.keyboard!.on("keydown-LEFT",  () => { this.profile = "healthy";   this.refresh(); });
    this.input.keyboard!.on("keydown-RIGHT", () => { this.profile = "sensitive"; this.refresh(); });
    this.input.keyboard!.on("keydown-UP",    () => { this.gender = "female"; this.refresh(); });
    this.input.keyboard!.on("keydown-DOWN",  () => { this.gender = "male";   this.refresh(); });
    this.input.keyboard!.on("keydown-ENTER", () => this.confirm());
    this.input.keyboard!.on("keydown-SPACE", () => this.confirm());

    this.refresh();
  }

  private refresh() {
    this.cards.forEach(({ profile, border, maleSprite, femaleSprite, maleHl, femaleHl }) => {
      const active = this.profile === profile;

      border.setStrokeStyle(3, active ? 0xffffff : 0x444466);

      if (active) {
        femaleSprite.setAlpha(this.gender === "female" ? 1 : 0.45);
        maleSprite.setAlpha(this.gender === "male" ? 1 : 0.45);
        femaleHl.setStrokeStyle(2, 0xffffff, this.gender === "female" ? 0.7 : 0);
        maleHl.setStrokeStyle(2, 0xffffff, this.gender === "male" ? 0.7 : 0);
      } else {
        femaleSprite.setAlpha(0.25);
        maleSprite.setAlpha(0.25);
        femaleHl.setStrokeStyle(2, 0xffffff, 0);
        maleHl.setStrokeStyle(2, 0xffffff, 0);
      }
    });
  }

  private confirm() {
    const spriteKey = this.profile === "healthy"
      ? (this.gender === "female" ? "femaleAdventurer" : "maleAdventurer")
      : (this.gender === "female" ? "femalePerson"     : "malePerson");

    this.registry.set("character", spriteKey);
    this.registry.set("difficulty", this.profile === "healthy" ? "normal" : "hard");

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("GameScene");
    });
  }
}
