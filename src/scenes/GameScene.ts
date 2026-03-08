import Phaser from "phaser";

const SIDEWALK_Y = 630;   // superficie de la banqueta (jugador camina aquí)
const ROAD_Y     = 690;   // superficie de la calle (carros van aquí)
const LEVEL_WIDTH = 7680;


export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private invincible = false;
  private pollutionAccum = 0;
  private levelComplete = false;
  private goalX = 0;
  private health = 5;
  private healthBar!: Phaser.GameObjects.Graphics;
  private carEmitters: { car: Phaser.GameObjects.Image; emitter: Phaser.GameObjects.Particles.ParticleEmitter; dir: number; speed: number; damage: number; scale: number }[] = [];

  constructor() {
    super("GameScene");
  }

  preload() {
    const gender = "maleAdventurer";
    this.load.image("char_idle", `/assets/character/character_${gender}_idle.png`);
    this.load.image("char_jump", `/assets/character/character_${gender}_jump.png`);
    this.load.image("char_fall", `/assets/character/character_${gender}_fall.png`);
    for (let i = 0; i < 8; i++) {
      this.load.image(`char_walk${i}`, `/assets/character/character_${gender}_walk${i}.png`);
    }

    const allVehicles = [
      "sedan","sedan-blue","taxi","police","sports-red","sports-green","convertible",
      "suv","suv-closed","van","van-large",
      "truck","bus","firetruck",
    ];
    for (const v of allVehicles) {
      this.load.image(`car_${v}`, `/assets/cars/${v}.png`);
    }

    for (let i = 0; i <= 8; i += 2) {
      const n = String(i).padStart(2, "0");
      this.load.image(`whitePuff${n}`, `/assets/smoke/whitePuff${n}.png`);
      if (i <= 6) this.load.image(`blackSmoke${n}`, `/assets/smoke/blackSmoke${n}.png`);
    }
  }

  create() {
    this.levelComplete = false;
    this.invincible = false;
    this.pollutionAccum = 0;
    this.carEmitters = [];

    // World bounds
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, 720);

    // ── Calle (asfalto) ─────────────────────────────────────────────
    this.add.rectangle(LEVEL_WIDTH / 2, (ROAD_Y + 720) / 2, LEVEL_WIDTH, 720 - ROAD_Y + 60, 0x2e2e2e).setDepth(-0.5);

    // Marcas viales
    const roadG = this.add.graphics().setDepth(0);
    const dashLen = 48, dashGap = 64;
    const laneY = ROAD_Y + 12;
    roadG.fillStyle(0xffffff, 0.6);
    for (let x = 0; x < LEVEL_WIDTH; x += dashLen + dashGap) roadG.fillRect(x, laneY, dashLen, 4);

    // ── Banqueta (plataforma del jugador) ───────────────────────────
    // Base: concreto beige-gris cálido
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 20, LEVEL_WIDTH, 40, 0xc4bba8).setDepth(0.5);

    // Franja clara en el tope (luz ambiente)
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 1, LEVEL_WIDTH, 3, 0xd8d0bc).setDepth(0.6);

    // Franja oscura en la parte baja (sombra interna)
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 34, LEVEL_WIDTH, 6, 0xb0a898).setDepth(0.6);

    // Juntas de losetas (líneas verticales cada 88px)
    const sidewalkG = this.add.graphics().setDepth(0.7);
    sidewalkG.lineStyle(1, 0xa09888, 0.6);
    for (let x = 44; x < LEVEL_WIDTH; x += 88) {
      sidewalkG.beginPath();
      sidewalkG.moveTo(x, SIDEWALK_Y + 4);
      sidewalkG.lineTo(x, SIDEWALK_Y + 34);
      sidewalkG.strokePath();
    }

    // Curb (bordillo): borde grueso oscuro al fondo de la banqueta
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 41, LEVEL_WIDTH, 6, 0x7a7060).setDepth(0.8);
    // Línea de sombra del curb
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 46, LEVEL_WIDTH, 3, 0x5a5048).setDepth(0.8);

    // Física: plataforma invisible en la banqueta
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 40;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#aaaaaa";
    ctx.fillRect(0, 0, 64, 40);
    this.textures.addCanvas("sidewalk", canvas);

    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < LEVEL_WIDTH; x += 64) {
      this.platforms.create(x + 32, SIDEWALK_Y + 28, "sidewalk").setAlpha(0);
    }

    // Goal zone
    this.createGoal(LEVEL_WIDTH - 120);

    // Player — empieza sobre la banqueta
    this.player = this.physics.add.sprite(100, SIDEWALK_Y - 60, "char_idle");
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.5);
    this.player.setDepth(3);
    // Trim physics body to exclude transparent bottom padding in sprite (~20px in 128px source = 10px at scale 0.5)
    // so the visual feet land exactly on the sidewalk surface
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.player.width, this.player.height - 20);
    body.setOffset(0, 0);

    this.anims.create({
      key: "walk",
      frames: Array.from({ length: 8 }, (_, i) => ({ key: `char_walk${i}` })),
      frameRate: 12,
      repeat: -1,
    });

    this.physics.add.collider(this.player, this.platforms);

    // Cars
    this.makeCars();
    this.showIntroMessage();

    // Camera
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, 720);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Health bar (fixed to camera)
    this.health = 10;
    this.add.text(20, 40, "AIRE", {
      fontSize: "12px", fontFamily: "'Press Start 2P'", color: "#ffffff",
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

      entry.emitter.setPosition(entry.car.x - entry.dir * entry.scale * 20, ROAD_Y - 30);

      // Proximity-based pollution damage: accumulate per frame
      const proximityRange = entry.damage === 3 ? 320 : entry.damage === 2 ? 240 : 180;
      const dist = Math.abs(entry.car.x - this.player.x);
      if (dist < proximityRange) {
        const intensity = 1 - dist / proximityRange;
        this.pollutionAccum += intensity * entry.damage * delta;
      }
    }

    // Apply accumulated pollution damage once per threshold
    if (!this.invincible && this.pollutionAccum >= 0.6) {
      const dmg = Math.floor(this.pollutionAccum);
      this.pollutionAccum -= dmg;
      this.onHit(dmg);
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

    const goalCenterY = SIDEWALK_Y - 80;
    const glow = this.add.rectangle(x + 40, goalCenterY, 80, 160, 0x44ff88, 0.35).setDepth(1);
    this.add.rectangle(x + 40, goalCenterY, 6, 160, 0x22cc66).setDepth(1);
    this.tweens.add({ targets: glow, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });

    this.add.text(x + 40, SIDEWALK_Y - 180, "META", {
      fontSize: "20px",
      fontFamily: "'Press Start 2P'",
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
    const vehicles: { key: string; speed: number; damage: number; scale: number }[] = [
      // Small (1 damage)
      { key: "sedan",        speed: 130, damage: 1, scale: 3.5 },
      { key: "sedan-blue",   speed: 145, damage: 1, scale: 3.5 },
      { key: "taxi",         speed: 110, damage: 1, scale: 3.5 },
      { key: "police",       speed: 170, damage: 1, scale: 3.5 },
      { key: "sports-red",   speed: 185, damage: 1, scale: 3.5 },
      { key: "sports-green", speed: 175, damage: 1, scale: 3.5 },
      { key: "convertible",  speed: 155, damage: 1, scale: 3.5 },
      // Medium (2 damage)
      { key: "suv",          speed: 120, damage: 2, scale: 4.0 },
      { key: "suv-closed",   speed: 115, damage: 2, scale: 4.0 },
      { key: "van",          speed: 100, damage: 2, scale: 4.0 },
      { key: "van-large",    speed: 90,  damage: 2, scale: 4.0 },
      // Large (3 damage)
      { key: "truck",        speed: 85,  damage: 3, scale: 4.5 },
      { key: "bus",          speed: 80,  damage: 3, scale: 4.5 },
      { key: "firetruck",    speed: 95,  damage: 3, scale: 4.5 },
    ];
    // Shuffle the base list so types are mixed
    const pool = [...vehicles];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // Space each car by its width + a fixed gap so none overlap
    const GAP = 120;
    const carDefs: { x: number; key: string; speed: number; damage: number; scale: number }[] = [];
    let nextX = 600;
    for (const v of pool) {
      const carWidth = v.scale * 80;
      carDefs.push({ x: nextX + carWidth / 2, ...v, key: `car_${v.key}` });
      nextX += carWidth + GAP;
    }

    carDefs.forEach(({ x, key, speed, damage, scale }) => {
      const dir = -1;
      const car = this.add.image(x, ROAD_Y, key)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setDepth(1)
        .setFlipX(true);

      const isLarge = damage >= 3;
      const smokeFrames = isLarge
        ? ["blackSmoke00", "blackSmoke02", "blackSmoke04", "blackSmoke06"]
        : ["whitePuff00", "whitePuff02", "whitePuff04", "whitePuff06", "whitePuff08"];

      const emitter = this.add.particles(x - scale * 20, ROAD_Y - 30, smokeFrames[0], {
        frame: smokeFrames,
        speed: { min: 8, max: 30 },
        angle: { min: 250, max: 290 },
        scale: { start: 0.18, end: 0.32 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 1800,
        frequency: 250,
        gravityY: -30,
        tint: isLarge ? 0x555555 : 0xb87a3a,
      }).setDepth(1.5);

      this.carEmitters.push({ car, emitter, dir, speed, damage, scale });
    });
  }

  private showIntroMessage() {
    const bg = this.add.rectangle(640, 360, 700, 160, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(20);

    const title = this.add.text(640, 310, "NIVEL 1: EL TRÁFICO", {
      fontSize: "26px", fontFamily: "'Press Start 2P'", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    const subtitle = this.add.text(640, 355, "Los autos queman combustible y\nliberan gases contaminantes al aire.", {
      fontSize: "17px", fontFamily: "'Press Start 2P'", color: "#cccccc", align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    const hint = this.add.text(640, 410, "— presiona cualquier tecla para comenzar —", {
      fontSize: "13px", fontFamily: "'Press Start 2P'", color: "#aaaaaa",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    this.tweens.add({ targets: hint, alpha: 0, duration: 500, yoyo: true, repeat: -1 });

    this.levelComplete = true;
    this.carEmitters.forEach(e => e.emitter.stop());

    const dismiss = () => {
      this.tweens.killTweensOf(hint);
      this.tweens.add({
        targets: [bg, title, subtitle, hint],
        alpha: 0,
        duration: 400,
        onComplete: () => {
          bg.destroy(); title.destroy(); subtitle.destroy(); hint.destroy();
          this.levelComplete = false;
          this.carEmitters.forEach(e => e.emitter.start());
        },
      });
      this.input.keyboard!.off("keydown", dismiss);
      this.input.gamepad!.off("down", dismiss);
    };

    this.input.keyboard!.once("keydown", dismiss);
    this.input.gamepad!.once("down", dismiss);
  }

  private onHit(damage = 1) {
    if (this.invincible || this.levelComplete) return;
    this.invincible = true;
    this.health = Math.max(0, this.health - damage);
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
    const barY = 58;
    const barW = 200;
    const barH = 18;

    this.healthBar.clear();

    // Background
    this.healthBar.fillStyle(0x333333);
    this.healthBar.fillRect(barX, barY, barW, barH);

    // Fill color based on health
    const ratio = this.health / 10;
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xffaa00 : 0xff3333;
    this.healthBar.fillStyle(color);
    this.healthBar.fillRect(barX, barY, Math.floor(barW * ratio), barH);

    // Border
    this.healthBar.lineStyle(2, 0xffffff, 0.6);
    this.healthBar.strokeRect(barX, barY, barW, barH);
  }

}
