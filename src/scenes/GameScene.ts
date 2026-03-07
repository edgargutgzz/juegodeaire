import Phaser from "phaser";

const TILE = 70;
const GROUND_TOP = 720 - 64;
const LEVEL_WIDTH = 3840;

type BuildingStyle = "Beige" | "Dark" | "Gray";
type RoofStyle = "Red" | "Grey";

interface BuildingDef {
  x: number;
  tilesWide: number;
  bodyRows: number;
  style: BuildingStyle;
  roof: RoofStyle;
  awning?: "Green" | "Red";
  chimney?: boolean;
}

const BUILDINGS: BuildingDef[] = [
  { x: 0,    tilesWide: 3, bodyRows: 3, style: "Gray",  roof: "Grey" },
  { x: 210,  tilesWide: 2, bodyRows: 5, style: "Dark",  roof: "Red",  chimney: true },
  { x: 360,  tilesWide: 4, bodyRows: 2, style: "Beige", roof: "Grey", awning: "Green" },
  { x: 660,  tilesWide: 2, bodyRows: 6, style: "Gray",  roof: "Red",  chimney: true },
  { x: 810,  tilesWide: 3, bodyRows: 4, style: "Dark",  roof: "Grey" },
  { x: 1050, tilesWide: 2, bodyRows: 3, style: "Beige", roof: "Red",  awning: "Red" },
  { x: 1190, tilesWide: 2, bodyRows: 5, style: "Gray",  roof: "Grey", chimney: true },
  { x: 1400, tilesWide: 3, bodyRows: 4, style: "Beige", roof: "Red" },
  { x: 1620, tilesWide: 2, bodyRows: 5, style: "Dark",  roof: "Grey", chimney: true },
  { x: 1770, tilesWide: 4, bodyRows: 2, style: "Gray",  roof: "Red",  awning: "Green" },
  { x: 2060, tilesWide: 2, bodyRows: 6, style: "Beige", roof: "Grey", chimney: true },
  { x: 2210, tilesWide: 3, bodyRows: 3, style: "Dark",  roof: "Red",  awning: "Red" },
  { x: 2430, tilesWide: 2, bodyRows: 4, style: "Gray",  roof: "Grey" },
  { x: 2580, tilesWide: 4, bodyRows: 3, style: "Beige", roof: "Red",  chimney: true },
  { x: 2880, tilesWide: 2, bodyRows: 5, style: "Dark",  roof: "Grey", awning: "Green" },
  { x: 3030, tilesWide: 3, bodyRows: 4, style: "Gray",  roof: "Red" },
  { x: 3240, tilesWide: 2, bodyRows: 6, style: "Beige", roof: "Grey", chimney: true },
  { x: 3450, tilesWide: 3, bodyRows: 3, style: "Dark",  roof: "Red",  awning: "Red" },
];

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private invincible = false;
  private levelComplete = false;
  private goalX = 0;
  private health = 5;
  private healthBar!: Phaser.GameObjects.Graphics;
  private carEmitters: { car: Phaser.GameObjects.Image; emitter: Phaser.GameObjects.Particles.ParticleEmitter; dir: number; speed: number }[] = [];

  constructor() {
    super("GameScene");
  }

  preload() {
    const gender = (this.registry.get("character") as string) === "female" ? "femaleAdventurer" : "maleAdventurer";
    this.load.image("char_idle", `/assets/character/character_${gender}_idle.png`);
    this.load.image("char_jump", `/assets/character/character_${gender}_jump.png`);
    this.load.image("char_fall", `/assets/character/character_${gender}_fall.png`);
    for (let i = 0; i < 8; i++) {
      this.load.image(`char_walk${i}`, `/assets/character/character_${gender}_walk${i}.png`);
    }

    for (const car of ["sedan", "sedan_blue", "taxi", "suv", "sports_red", "sports_green", "rounded_yellow", "van"]) {
      this.load.image(`car_${car}`, `/assets/cars/${car}.png`);
    }

    const buildingKeys = [
      "houseBeige", "houseBeigeAlt", "houseBeigeAlt2",
      "houseBeigeTopLeft", "houseBeigeTopMid", "houseBeigeTopRight",
      "houseBeigeMidLeft", "houseBeigeMidRight",
      "houseBeigeBottomLeft", "houseBeigeBottomMid", "houseBeigeBottomRight",
      "houseDark", "houseDarkAlt", "houseDarkAlt2",
      "houseDarkTopLeft", "houseDarkTopMid", "houseDarkTopRight",
      "houseDarkMidLeft", "houseDarkMidRight",
      "houseDarkBottomLeft", "houseDarkBottomMid", "houseDarkBottomRight",
      "houseGray", "houseGrayAlt", "houseGrayAlt2",
      "houseGrayTopLeft", "houseGrayTopMid", "houseGrayTopRight",
      "houseGrayMidLeft", "houseGrayMidRight",
      "houseGrayBottomLeft", "houseGrayBottomMid", "houseGrayBottomRight",
      "roofRedLeft", "roofRedMid", "roofRedRight",
      "roofRedTopLeft", "roofRedTopMid", "roofRedTopRight",
      "roofGreyLeft", "roofGreyMid", "roofGreyRight",
      "roofGreyTopLeft", "roofGreyTopMid", "roofGreyTopRight",
      "chimney", "chimneyThin",
      "window", "windowOpen",
      "awningGreen", "awningRed",
    ];
    for (const key of buildingKeys) {
      this.load.image(key, `/assets/buildings/${key}.png`);
    }
  }

  create() {
    this.levelComplete = false;

    // World bounds
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, 720);

    // Sky
    this.add.rectangle(LEVEL_WIDTH / 2, 360, LEVEL_WIDTH, 720, 0xc8d8e0).setDepth(-2);
    this.add.rectangle(LEVEL_WIDTH / 2, 500, LEVEL_WIDTH, 440, 0xb0b8a8, 0.25).setDepth(-1);

    // Buildings
    for (const def of BUILDINGS) {
      this.createBuilding(def);
    }

    // Ground texture
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#7a7a7a";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#666666";
    ctx.fillRect(0, 0, 64, 4);
    this.textures.addCanvas("ground", canvas);

    // Ground across full level
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < LEVEL_WIDTH; x += 64) {
      this.platforms.create(x + 32, 720 - 32, "ground");
    }

    // Goal zone
    this.createGoal(LEVEL_WIDTH - 120);

    // Player
    this.player = this.physics.add.sprite(100, 500, "char_idle");
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.5);
    this.player.setDepth(1);

    this.anims.create({
      key: "walk",
      frames: Array.from({ length: 8 }, (_, i) => ({ key: `char_walk${i}` })),
      frameRate: 12,
      repeat: -1,
    });

    this.physics.add.collider(this.player, this.platforms);

    this.makeCircleTexture("smog2", 16, 0x556b2f, 1);

    // Cars
    this.makeCars();
    this.showIntroMessage();

    // Camera
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, 720);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Health bar (fixed to camera)
    this.health = 5;
    this.add.text(20, 6, "AIR", {
      fontSize: "12px", fontFamily: "monospace", color: "#ffffff",
    }).setScrollFactor(0).setDepth(10);
    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.drawHealthBar();

    this.cursors = this.input.keyboard!.createCursorKeys();

    this.input.gamepad!.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => {
      this.pad = pad;
    });
  }

  update() {
    if (this.levelComplete) return;

    const onGround = this.player.body!.blocked.down;
    const leftStickX = this.pad?.leftStick.x ?? 0;
    const buttonA = this.pad?.isButtonDown(0) ?? false;
    const dpadLeft = this.pad?.left ?? false;
    const dpadRight = this.pad?.right ?? false;

    const goLeft = this.cursors.left.isDown || leftStickX < -0.3 || dpadLeft;
    const goRight = this.cursors.right.isDown || leftStickX > 0.3 || dpadRight;
    const jump =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space!) ||
      buttonA;

    if (goLeft) {
      this.player.setVelocityX(-220);
      this.player.setFlipX(true);
    } else if (goRight) {
      this.player.setVelocityX(220);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    if (jump && onGround) {
      this.player.setVelocityY(-520);
    }

    if (this.player.x >= this.goalX) {
      this.onLevelComplete();
    }

    // Move cars and sync exhaust emitters
    const delta = this.game.loop.delta / 1000;
    for (const entry of this.carEmitters) {
      entry.car.x += entry.speed * entry.dir * delta;

      if (entry.dir === 1 && entry.car.x > LEVEL_WIDTH + 100) entry.car.x = -100;
      if (entry.dir === -1 && entry.car.x < -100) entry.car.x = LEVEL_WIDTH + 100;

      const exhaustOffset = entry.dir === 1 ? -48 : 48;
      entry.emitter.setPosition(entry.car.x + exhaustOffset, GROUND_TOP - 30);

      // Simple player overlap check
      if (!this.invincible && Math.abs(entry.car.x - this.player.x) < 50 && this.player.y > GROUND_TOP - 80) {
        this.onHit();
      }
    }

    if (!onGround) {
      const goingUp = (this.player.body!.velocity.y ?? 0) < 0;
      this.player.anims.stop();
      this.player.setTexture(goingUp ? "char_jump" : "char_fall");
    } else if (goLeft || goRight) {
      if (!this.player.anims.isPlaying) this.player.play("walk");
    } else {
      this.player.anims.stop();
      this.player.setTexture("char_idle");
    }
  }

  private createGoal(x: number) {
    this.goalX = x;

    const glow = this.add.rectangle(x + 40, GROUND_TOP - 80, 80, 160, 0x44ff88, 0.35).setDepth(1);
    this.add.rectangle(x + 40, GROUND_TOP - 80, 6, 160, 0x22cc66).setDepth(1);
    this.tweens.add({ targets: glow, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });

    this.add.text(x + 40, GROUND_TOP - 180, "FINISH", {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#22cc66",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(1);
  }

  private onLevelComplete() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(800, 255, 255, 255);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("LevelCompleteScene");
    });
  }

  private makeCars() {
    const carDefs = [
      { x: 380,  key: "car_sedan",          speed: 120, dir:  1 },
      { x: 900,  key: "car_taxi",           speed: 90,  dir: -1 },
      { x: 1300, key: "car_suv",            speed: 150, dir:  1 },
      { x: 1900, key: "car_sports_red",     speed: 200, dir:  1 },
      { x: 2400, key: "car_sedan_blue",     speed: 110, dir: -1 },
      { x: 2900, key: "car_sports_green",   speed: 130, dir: -1 },
      { x: 3300, key: "car_rounded_yellow", speed: 95,  dir:  1 },
      { x: 3600, key: "car_van",            speed: 80,  dir: -1 },
    ];

    carDefs.forEach(({ x, key, speed, dir }, i) => {
      const car = this.add.image(x, GROUND_TOP - 4, key)
        .setOrigin(0.5, 1)
        .setScale(4)
        .setDepth(1)
        .setFlipX(dir === -1);

      const emitter = this.add.particles(x, GROUND_TOP - 30, "smog2", {
        speed: { min: 5, max: 25 },
        angle: { min: 160, max: 200 },
        scale: { start: 0.5, end: 0.05 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 1500,
        frequency: 300,
        gravityY: -40,
      }).setDepth(1);

      this.carEmitters.push({ car, emitter, dir, speed });

      if (i < 2) {
        this.add.text(x, GROUND_TOP - 130, "fuente de\ncontaminación", {
          fontSize: "13px", fontFamily: "monospace",
          color: "#cc3300", align: "center",
        }).setOrigin(0.5).setDepth(2);

        const arrow = this.add.graphics().setDepth(2);
        arrow.fillStyle(0xcc3300);
        arrow.fillTriangle(x, GROUND_TOP - 108, x - 8, GROUND_TOP - 120, x + 8, GROUND_TOP - 120);
      }
    });
  }

  private showIntroMessage() {
    const bg = this.add.rectangle(640, 360, 700, 160, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(20);

    this.add.text(640, 310, "NIVEL 1: EL TRÁFICO", {
      fontSize: "26px", fontFamily: "monospace", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    this.add.text(640, 355, "Los autos queman combustible y\nliberan gases contaminantes al aire.", {
      fontSize: "17px", fontFamily: "monospace", color: "#cccccc", align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    const hint = this.add.text(640, 410, "— presiona cualquier tecla para comenzar —", {
      fontSize: "13px", fontFamily: "monospace", color: "#aaaaaa",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    this.tweens.add({ targets: hint, alpha: 0, duration: 500, yoyo: true, repeat: -1 });

    // Freeze player until dismissed
    this.levelComplete = true;

    const dismiss = () => {
      this.tweens.add({
        targets: [bg, hint],
        alpha: 0,
        duration: 400,
        onComplete: () => {
          bg.destroy();
          this.levelComplete = false;
        },
      });
      this.input.keyboard!.off("keydown", dismiss);
      this.input.gamepad!.off("down", dismiss);
    };

    this.input.keyboard!.once("keydown", dismiss);
    this.input.gamepad!.once("down", dismiss);
  }

  private makeCircleTexture(key: string, radius: number, color: number, alpha: number) {
    const size = radius * 2;
    const g = this.make.graphics() as Phaser.GameObjects.Graphics;
    g.fillStyle(color, alpha);
    g.fillCircle(radius, radius, radius);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private onHit() {
    if (this.invincible || this.levelComplete) return;
    this.invincible = true;
    this.health = Math.max(0, this.health - 1);
    this.drawHealthBar();
    this.player.setTint(0xff4444);
    this.cameras.main.shake(200, 0.005);

    if (this.health <= 0) {
      this.levelComplete = true;
      this.cameras.main.fadeOut(800, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("GameOverScene");
      });
      return;
    }

    this.time.delayedCall(800, () => {
      this.player.clearTint();
      this.invincible = false;
    });
  }

  private drawHealthBar() {
    const barX = 20;
    const barY = 20;
    const barW = 200;
    const barH = 18;
    const maxHealth = 5;

    this.healthBar.clear();

    // Label
    // (drawn via text object created once in create — handled separately)

    // Background
    this.healthBar.fillStyle(0x333333);
    this.healthBar.fillRect(barX, barY, barW, barH);

    // Fill color based on health
    const ratio = this.health / maxHealth;
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xffaa00 : 0xff3333;
    this.healthBar.fillStyle(color);
    this.healthBar.fillRect(barX, barY, Math.floor(barW * ratio), barH);

    // Border
    this.healthBar.lineStyle(2, 0xffffff, 0.6);
    this.healthBar.strokeRect(barX, barY, barW, barH);
  }

  private createBuilding(def: BuildingDef) {
    const { x, tilesWide, bodyRows, style, roof, awning, chimney } = def;
    const totalRows = 2 + 1 + bodyRows + 1;
    const startY = GROUND_TOP - totalRows * TILE;

    const place = (col: number, row: number, key: string) => {
      this.add.image(x + col * TILE, startY + row * TILE, key).setOrigin(0, 0).setDepth(0);
    };

    const midFill = [`house${style}`, `house${style}Alt`, `house${style}Alt2`];

    place(0, 0, `roof${roof}TopLeft`);
    for (let c = 1; c < tilesWide - 1; c++) place(c, 0, `roof${roof}TopMid`);
    place(tilesWide - 1, 0, `roof${roof}TopRight`);

    place(0, 1, `roof${roof}Left`);
    for (let c = 1; c < tilesWide - 1; c++) place(c, 1, `roof${roof}Mid`);
    place(tilesWide - 1, 1, `roof${roof}Right`);

    place(0, 2, `house${style}TopLeft`);
    for (let c = 1; c < tilesWide - 1; c++) place(c, 2, `house${style}TopMid`);
    place(tilesWide - 1, 2, `house${style}TopRight`);

    for (let r = 0; r < bodyRows; r++) {
      const row = 3 + r;
      place(0, row, `house${style}MidLeft`);
      for (let c = 1; c < tilesWide - 1; c++) place(c, row, midFill[r % midFill.length]);
      place(tilesWide - 1, row, `house${style}MidRight`);
    }

    const lastRow = 3 + bodyRows;
    place(0, lastRow, `house${style}BottomLeft`);
    for (let c = 1; c < tilesWide - 1; c++) place(c, lastRow, `house${style}BottomMid`);
    place(tilesWide - 1, lastRow, `house${style}BottomRight`);

    if (chimney) {
      this.add.image(x + TILE * (tilesWide - 1), startY - TILE, "chimneyThin").setOrigin(0, 0).setDepth(0);
    }

    if (awning) {
      for (let c = 0; c < tilesWide; c++) {
        this.add.image(x + c * TILE, GROUND_TOP - TILE, `awning${awning}`).setOrigin(0, 0).setDepth(0);
      }
    }
  }
}
