import Phaser from "phaser";

const SIDEWALK_Y  = 560;
const ROAD_Y      = 660;
const LEVEL_WIDTH = 6400;

const PROJ_LOW  = SIDEWALK_Y - 28;
const PROJ_MID  = SIDEWALK_Y - 90;
const PROJ_HIGH = SIDEWALK_Y - 155;

const CHECKPOINT_INTERVAL = 1600; // checkpoint every 1600px
const DASH_COOLDOWN_MS    = 1400;
const DASH_DURATION_MS    = 180;
const DASH_SPEED          = 620;

const VEHICLES = [
  "sedan","sedan-blue","taxi","police","sports-red","sports-green","convertible",
  "suv","suv-closed","van","van-large","truck","bus","firetruck",
];

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;

  private invincible      = false;
  private dashInvincible  = false;
  private isCrouching     = false;
  private isDashing       = false;
  private levelComplete   = false;

  private jumpsAvailable  = 2;
  private lastDashTime    = -9999;
  private padWasB         = false;

  private goalX           = 0;
  private health          = 10;
  private difficultyMultiplier = 1;

  private healthBar!:     Phaser.GameObjects.Graphics;
  private dashBar!:       Phaser.GameObjects.Graphics;
  private smogOverlay!:   Phaser.GameObjects.Rectangle;
  private vignetteRect!:  Phaser.GameObjects.Rectangle;
  private scoreText!:     Phaser.GameObjects.Text;
  private distancePeak    = 0;

  private waveIndex       = 0;
  private bgCars:         Phaser.GameObjects.Image[] = [];
  private checkpointsPassed = new Set<number>();
  private wasOnGround     = false;
  private jumpCount       = 0;
  private maxScrollX      = 0;

  private powerups!:      Phaser.Physics.Arcade.StaticGroup;
  private maskInvincible  = false;
  private maskEndTime     = 0;
  private blinkTween:     Phaser.Tweens.Tween | null = null;
  private maskBarGfx!:    Phaser.GameObjects.Graphics;
  private maskIcon!:      Phaser.GameObjects.Graphics;

  constructor() { super("GameScene"); }

  preload() {
    const character = this.registry.get("character") || "maleAdventurer";
    this.load.image("char_idle", `/assets/character/character_${character}_idle.png`);
    this.load.image("char_jump", `/assets/character/character_${character}_jump.png`);
    this.load.image("char_fall", `/assets/character/character_${character}_fall.png`);
    this.load.image("char_duck", `/assets/character/character_${character}_duck.png`);
    for (let i = 0; i < 8; i++) {
      this.load.image(`char_walk${i}`, `/assets/character/character_${character}_walk${i}.png`);
    }
    for (const v of VEHICLES) {
      this.load.image(`car_${v}`, `/assets/cars/${v}.png`);
    }

    this.load.audio("sfx_powerup",    "/assets/sfx/SoundBonus.wav");
    this.load.audio("sfx_jump",       "/assets/sfx/SoundJump1.wav");
    this.load.audio("sfx_doublejump", "/assets/sfx/SoundJump2.wav");
    this.load.audio("sfx_land",       "/assets/sfx/SoundLand1.wav");
    this.load.audio("sfx_hit",        "/assets/sfx/SoundPlayerHit.wav");
    this.load.audio("sfx_explode",    "/assets/sfx/SoundExplosionSmall.wav");
    this.load.audio("sfx_checkpoint", "/assets/sfx/SoundBonus.wav");
    this.load.audio("sfx_goal",       "/assets/sfx/SoundReachGoal.wav");
    this.load.audio("sfx_gameover",   "/assets/sfx/SoundGameOver.wav");
    this.load.audio("sfx_dash",       "/assets/sfx/SoundSpecialSkill.wav");
    this.load.audio("sfx_death",      "/assets/sfx/SoundDeath.wav");
  }

  create() {
    this.levelComplete        = false;
    this.invincible           = false;
    this.dashInvincible       = false;
    this.isDashing            = false;
    this.isCrouching          = false;
    this.health               = 10;
    this.jumpsAvailable       = 2;
    this.lastDashTime         = -9999;
    this.distancePeak         = 0;
    this.waveIndex            = 0;
    this.bgCars               = [];
    this.checkpointsPassed    = new Set();
    this.wasOnGround          = false;
    this.jumpCount            = 0;
    this.maxScrollX           = 0;
    this.maskInvincible       = false;

    this.maskEndTime          = 0;
    this.blinkTween           = null;
    this.difficultyMultiplier = this.registry.get("difficulty") === "hard" ? 2 : 1;

    this.physics.world.setBounds(0, -800, LEVEL_WIDTH, 1520);

    this.buildWorld();
    this.placeCheckpoints();

    this.projectiles = this.physics.add.group();
    this.goalX = LEVEL_WIDTH - 160;
    this.createGoal(this.goalX);

    // ── Player ────────────────────────────────────────────────────
    this.player = this.physics.add.sprite(120, -600, "char_idle");
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.85);
    this.player.setDepth(5);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(64, 88, false);
    body.setOffset(16, 20);

    if (!this.anims.exists("walk")) {
      this.anims.create({
        key: "walk",
        frames: Array.from({ length: 8 }, (_, i) => ({ key: `char_walk${i}` })),
        frameRate: 12, repeat: -1,
      });
    }

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.projectiles, (_p, proj) => {
      const p = proj as Phaser.Physics.Arcade.Image;
      this.spawnParticles(p.x, p.y, p.tintTopLeft || 0xff6600);
      this.sfx("sfx_explode", 0.5);
      p.destroy();
      this.onHit();
    });


    this.startPollutionSpawner();
    this.startCarSpawner();
    this.setupPowerups();

    // ── Camera ────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, -800, LEVEL_WIDTH, 1520);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    // ── Drop-in ───────────────────────────────────────────────────
    this.player.setVisible(false);
    this.levelComplete = true;
    const checkLanding = this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (this.player.body!.blocked.down) {
          checkLanding.remove();
          this.player.setVisible(true);
          this.time.delayedCall(200, () => { this.levelComplete = false; });
        }
      },
    });

    // ── HUD ───────────────────────────────────────────────────────
    this.add.text(20, 20, "AIRE", {
      fontSize: "10px", fontFamily: "'Press Start 2P'", color: "#ffffff",
    }).setScrollFactor(0).setDepth(10);

    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.dashBar   = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.drawHealthBar();
    this.updateDashBar(0);

    // Mask power-up HUD (bottom-left)
    this.maskIcon = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.maskBarGfx = this.add.graphics().setScrollFactor(0).setDepth(10);

    this.scoreText = this.add.text(this.scale.width - 16, 16, "0m", {
      fontSize: "12px", fontFamily: "'Press Start 2P'", color: "#ffffff",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(10);

    // ── Smog overlay (thickens as health drops) ───────────────────
    this.smogOverlay = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x4466aa, 0,
    ).setScrollFactor(0).setDepth(9);

    // ── Hit vignette ──────────────────────────────────────────────
    this.vignetteRect = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0xff0000, 0,
    ).setScrollFactor(0).setDepth(11);

    // ── Input ─────────────────────────────────────────────────────
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.input.gamepad!.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => {
      this.pad = pad;
    });
    if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);
  }

  update() {
    if (this.levelComplete) return;

    const onGround   = this.player.body!.blocked.down;
    if (onGround) {
      if (!this.wasOnGround) this.sfx("sfx_land", 0.5); // landing sound
      this.jumpsAvailable = 2;
      this.jumpCount = 0;
    }
    this.wasOnGround = onGround;

    const leftStickX = this.pad?.leftStick.x ?? 0;
    const buttonA    = this.pad?.isButtonDown(0) ?? false;
    const buttonB    = this.pad?.isButtonDown(1) ?? false;
    const dpadLeft   = this.pad?.left  ?? false;
    const dpadRight  = this.pad?.right ?? false;

    const goLeft  = this.cursors.left.isDown  || leftStickX < -0.3 || dpadLeft;
    const goRight = this.cursors.right.isDown || leftStickX >  0.3 || dpadRight;
    const crouch  = this.cursors.down.isDown  || (this.pad?.down ?? false);
    const jump    = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space!) || buttonA;
    const doDash  = (Phaser.Input.Keyboard.JustDown(this.shiftKey) || (buttonB && !this.padWasB)) &&
                    !this.isDashing &&
                    (this.time.now - this.lastDashTime) > DASH_COOLDOWN_MS;
    this.padWasB  = buttonB;

    // ── Crouch ────────────────────────────────────────────────────
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (crouch && onGround && !this.isCrouching) {
      this.isCrouching = true;
      body.setSize(64, 44, false);
      body.setOffset(16, 64);
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (!crouch && this.isCrouching) {
      this.isCrouching = false;
      body.setSize(64, 88, false);
      body.setOffset(16, 20);
    }

    // ── Dash ──────────────────────────────────────────────────────
    if (doDash && !this.isCrouching) {
      const dir = goLeft ? -1 : goRight ? 1 : (this.player.flipX ? -1 : 1);
      this.performDash(dir);
    }

    // ── Movement ──────────────────────────────────────────────────
    if (!this.isDashing) {
      if (goLeft)       { this.player.setVelocityX(-220); this.player.setFlipX(true);  }
      else if (goRight) { this.player.setVelocityX( 220); this.player.setFlipX(false); }
      else              { this.player.setVelocityX(0); }
    }

    // ── Double jump ───────────────────────────────────────────────
    if (jump && this.jumpsAvailable > 0 && !this.isCrouching) {
      this.player.setVelocityY(-520);
      this.sfx(this.jumpCount === 0 ? "sfx_jump" : "sfx_doublejump", 0.6);
      this.jumpCount++;
      this.jumpsAvailable--;
    }

    if (this.player.x >= this.goalX) this.onLevelComplete();

    // ── Destroy off-screen projectiles ────────────────────────────
    for (const proj of this.projectiles.getChildren()) {
      const p = proj as Phaser.Physics.Arcade.Image;
      if (p.x < -100 || p.x > LEVEL_WIDTH + 100 || p.y < -800) p.destroy();
    }

    // ── Checkpoint check ──────────────────────────────────────────
    const cpIndex = Math.floor(this.player.x / CHECKPOINT_INTERVAL);
    if (cpIndex > 0 && !this.checkpointsPassed.has(cpIndex) &&
        this.player.x > cpIndex * CHECKPOINT_INTERVAL) {
      this.checkpointsPassed.add(cpIndex);
      this.onCheckpoint();
    }

    // ── Mario-style scroll lock ───────────────────────────────────
    this.maxScrollX = Math.max(this.maxScrollX, this.cameras.main.scrollX);
    const minPlayerX = this.maxScrollX + 24;
    if (this.player.x < minPlayerX) {
      this.player.x = minPlayerX;
      const b = this.player.body as Phaser.Physics.Arcade.Body;
      if (b.velocity.x < 0) b.setVelocityX(0);
    }

    // ── Mask power-up timer ───────────────────────────────────────
    if (this.maskInvincible) {
      const remaining = this.maskEndTime - this.time.now;
      if (remaining <= 0) this.deactivateMask();
      else this.drawMaskBar(remaining / 6000);
    }

    // ── Score (distance) ──────────────────────────────────────────
    this.distancePeak = Math.max(this.distancePeak, Math.floor(this.player.x));
    this.scoreText.setText(`${Math.floor(this.distancePeak / 6.4)}m`);

    // ── Dash bar ──────────────────────────────────────────────────
    const dashElapsed = Math.min(this.time.now - this.lastDashTime, DASH_COOLDOWN_MS);
    this.updateDashBar(dashElapsed / DASH_COOLDOWN_MS);

    // ── Background car positions ───────────────────────────────────
    this.bgCars = this.bgCars.filter(car => {
      if (!car.active) return false;
      const spd = (car as any)._carSpeed as number;
      car.x += spd / 60;
      if (car.x < -300 || car.x > LEVEL_WIDTH + 300) { car.destroy(); return false; }
      return true;
    });

    // ── Animation ─────────────────────────────────────────────────
    if (!onGround) {
      const goingUp = (this.player.body!.velocity.y ?? 0) < 0;
      this.player.anims.stop();
      this.player.setTexture(goingUp ? "char_jump" : "char_fall");
    } else if (this.isCrouching) {
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (goLeft || goRight) {
      if (!this.player.anims.isPlaying) this.player.play("walk");
    } else {
      this.player.anims.stop();
      this.player.setTexture("char_idle");
    }
  }

  // ── Dash ─────────────────────────────────────────────────────────

  private performDash(dir: number) {
    this.isDashing       = true;
    this.dashInvincible  = true;
    this.lastDashTime    = this.time.now;
    this.sfx("sfx_dash", 0.5);
    this.player.setVelocityX(dir * DASH_SPEED);
    this.player.setFlipX(dir < 0);
    this.player.setTint(0x88ccff);

    this.time.delayedCall(DASH_DURATION_MS, () => {
      this.isDashing      = false;
      this.dashInvincible = false;
      this.player.clearTint();
    });
  }

  // ── Particles ────────────────────────────────────────────────────

  private spawnParticles(x: number, y: number, _color: number) {
    const colors = [0xff4400, 0xff8800, 0xffcc00, 0xccff00];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = Phaser.Math.Between(60, 140);
      const key   = `ptcl_${Date.now()}_${i}`;
      const gfx   = this.make.graphics({ x: 0, y: 0 } as any);
      gfx.fillStyle(colors[i % colors.length], 1);
      gfx.fillCircle(4, 4, 4);
      gfx.generateTexture(key, 8, 8);
      gfx.destroy();

      const dot = this.add.image(x, y, key).setDepth(6);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.2, scaleY: 0.2,
        duration: 380,
        ease: "Quad.Out",
        onComplete: () => {
          dot.destroy();
          if (this.textures.exists(key)) this.textures.remove(key);
        },
      });
    }
  }

  // ── Checkpoint ───────────────────────────────────────────────────

  private onCheckpoint() {
    const healed = Math.min(3, 10 - this.health);
    this.health  = Math.min(10, this.health + 3);
    this.drawHealthBar();
    this.sfx("sfx_checkpoint", 0.7);

    if (healed > 0) {
      const flash = this.add.text(
        this.player.x, this.player.y - 80,
        `+${healed} AIRE`, {
          fontSize: "14px", fontFamily: "'Press Start 2P'",
          color: "#44ff88", stroke: "#003322", strokeThickness: 4,
        },
      ).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: flash, y: flash.y - 60, alpha: 0,
        duration: 1200, ease: "Quad.Out",
        onComplete: () => flash.destroy(),
      });
    }

    const banner = this.add.text(
      this.scale.width / 2, this.scale.height / 2 - 20,
      "CHECKPOINT", {
        fontSize: "22px", fontFamily: "'Press Start 2P'",
        color: "#44ff88", stroke: "#000000", strokeThickness: 6,
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(20).setAlpha(0);

    this.tweens.add({
      targets: banner, alpha: 1, duration: 200, yoyo: true, hold: 800,
      onComplete: () => banner.destroy(),
    });
  }

  // ── Background cars ───────────────────────────────────────────────

  private startCarSpawner() {
    const spawnCar = () => {
      const goRight  = Math.random() > 0.5;
      const vKey     = VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
      const startX   = goRight
        ? this.cameras.main.scrollX - 200
        : this.cameras.main.scrollX + this.scale.width + 200;
      const carSpeed = Phaser.Math.Between(160, 340) * (goRight ? 1 : -1);
      const laneY    = ROAD_Y + Phaser.Math.Between(0, 2) * 28 + 20;

      const car = this.add.image(startX, laneY, `car_${vKey}`)
        .setScale(0.55)
        .setDepth(1.5)
        .setFlipX(!goRight);
      (car as any)._carSpeed = carSpeed;
      this.bgCars.push(car);

      this.time.delayedCall(Phaser.Math.Between(1200, 2800), spawnCar);
    };
    this.time.delayedCall(500, spawnCar);
  }

  // ── Spawn rate ramps up with distance ────────────────────────────

  private get progressFactor() {
    return Math.min(this.player.x / LEVEL_WIDTH, 1);
  }

  private get spawnDelay() {
    return Phaser.Math.Linear(2200, 900, this.progressFactor);
  }

  private get projSpeedMult() {
    return Phaser.Math.Linear(1.0, 1.7, this.progressFactor);
  }

  // ── World ─────────────────────────────────────────────────────────

  private buildWorld() {
    this.add.rectangle(LEVEL_WIDTH / 2, -400, LEVEL_WIDTH, 2000, 0x07091a).setDepth(-3);
    this.drawCityBackground();

    this.add.rectangle(LEVEL_WIDTH / 2, (ROAD_Y + 720) / 2, LEVEL_WIDTH, 720 - ROAD_Y + 60, 0x2e2e2e).setDepth(0);
    const roadG = this.add.graphics().setDepth(0.5);
    roadG.fillStyle(0xffffff, 0.4);
    for (let x = 0; x < LEVEL_WIDTH; x += 112) roadG.fillRect(x, ROAD_Y + 14, 56, 4);

    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 40, LEVEL_WIDTH, 80, 0xc4bba8).setDepth(1);
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 2,  LEVEL_WIDTH, 4,  0xd8d0bc).setDepth(1.1);
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 72, LEVEL_WIDTH, 8,  0x7a7060).setDepth(1.1);

    const sg = this.add.graphics().setDepth(1.2);
    sg.lineStyle(1, 0xa09888, 0.5);
    for (let x = 88; x < LEVEL_WIDTH; x += 88) {
      sg.beginPath(); sg.moveTo(x, SIDEWALK_Y + 6); sg.lineTo(x, SIDEWALK_Y + 68); sg.strokePath();
    }

    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 64, 16);
    this.textures.addCanvas("sidewalk", canvas);
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < LEVEL_WIDTH; x += 64) {
      this.platforms.create(x + 32, SIDEWALK_Y + 64, "sidewalk").setAlpha(0);
    }
  }

  private placeCheckpoints() {
    const numCPs = Math.floor(LEVEL_WIDTH / CHECKPOINT_INTERVAL) - 1;
    for (let i = 1; i <= numCPs; i++) {
      const cx = i * CHECKPOINT_INTERVAL;
      const postH = 60;
      const postY = SIDEWALK_Y - postH / 2;

      const g = this.add.graphics().setDepth(2);
      g.fillStyle(0x888888, 1);
      g.fillRect(cx - 3, postY - postH / 2, 6, postH);
      g.fillStyle(0x22cc66, 1);
      g.fillRect(cx, postY - postH / 2, 28, 20);
      g.fillStyle(0x00ff88, 0.6);
      g.fillRect(cx + 2, postY - postH / 2 + 2, 14, 6);
    }
  }

  private drawCityBackground() {
    const stars = this.add.graphics().setDepth(-2.9);
    const starPositions = [
      [80,-680],[210,-720],[400,-650],[560,-700],[730,-660],[920,-710],
      [1100,-680],[1280,-640],[1450,-700],[1600,-720],[1750,-660],[1900,-690],
      [2050,-710],[2200,-650],[2380,-680],[2500,-720],[2650,-670],[2820,-700],
      [2980,-650],[3140,-710],[3300,-680],[3460,-720],[3620,-660],[3780,-690],
      [3940,-650],[4100,-710],[4260,-680],[4420,-720],[4580,-660],[4740,-700],
      [4900,-650],[5060,-710],[5220,-680],[5380,-720],[5540,-660],[5700,-690],
      [5860,-650],[6020,-710],[6180,-680],[6340,-720],
      [150,-600],[350,-580],[500,-610],[700,-590],[850,-620],[1050,-580],
      [1200,-600],[1400,-610],[1550,-580],[1700,-600],[1850,-620],[2000,-590],
      [2150,-610],[2300,-580],[2450,-620],
    ];
    for (const [sx, sy] of starPositions) {
      const size   = ((sx * 7 + sy * 3) % 3) === 0 ? 2.5 : 1.5;
      const bright = ((sx + sy) % 5) === 0;
      stars.fillStyle(bright ? 0xffffff : 0xaabbcc, bright ? 0.9 : 0.55);
      stars.fillCircle(sx, sy, size);
    }

    const mtnFar = this.add.graphics().setDepth(-2.7);
    mtnFar.fillStyle(0x0d1a2e, 1);
    this.drawMountainRange(mtnFar, [
      {x:0,y:0},{x:180,y:-260},{x:310,y:-190},{x:460,y:-310},
      {x:620,y:-140},{x:800,y:-200},{x:960,y:-80},
    ], 960);

    const mtnNear = this.add.graphics().setDepth(-2.5);
    mtnNear.fillStyle(0x111f35, 1);
    this.drawMountainRange(mtnNear, [
      {x:0,y:0},{x:120,y:-160},{x:280,y:-100},{x:440,y:-220},
      {x:560,y:-150},{x:700,y:-180},{x:840,y:-90},{x:960,y:0},
    ], 960);

    const pattern: {ox:number;w:number;h:number;c:number}[] = [
      {ox:0,w:180,h:440,c:0x0e1e38},{ox:190,w:90,h:280,c:0x0e2818},
      {ox:290,w:220,h:380,c:0x0c1a30},{ox:520,w:140,h:500,c:0x091424},
      {ox:670,w:100,h:220,c:0x0e2018},{ox:780,w:170,h:320,c:0x0c1a2e},
    ];
    const tiles = Math.ceil(LEVEL_WIDTH / 960) + 1;
    const g = this.add.graphics().setDepth(-2);
    for (let t = 0; t < tiles; t++) {
      for (const b of pattern) {
        const bx = t * 960 + b.ox;
        const by = SIDEWALK_Y - b.h;
        g.fillStyle(b.c, 1);
        g.fillRect(bx, by, b.w, b.h);
        g.fillStyle(0xffffff, 0.04);
        g.fillRect(bx, by, 3, b.h);
        for (let wy = by + 20; wy < SIDEWALK_Y - 12; wy += 26) {
          for (let wx = bx + 10; wx < bx + b.w - 10; wx += 20) {
            const hash = (wx * 13 + wy * 7) % 100;
            if (hash < 35) {
              g.fillStyle(hash < 15 ? 0xffdd88 : 0xffaa44, 0.85);
              g.fillRect(wx, wy, 10, 14);
            } else if (hash < 50) {
              g.fillStyle(0x1a2a44, 0.5);
              g.fillRect(wx, wy, 10, 14);
            }
          }
        }
      }
    }
  }

  private drawMountainRange(
    g: Phaser.GameObjects.Graphics,
    profile: {x:number;y:number}[],
    tileW: number,
  ) {
    const baseY = SIDEWALK_Y - 20;
    const tiles = Math.ceil(LEVEL_WIDTH / tileW) + 1;
    for (let t = 0; t < tiles; t++) {
      const offsetX = t * tileW;
      g.beginPath();
      g.moveTo(offsetX, baseY);
      for (const p of profile) g.lineTo(offsetX + p.x, baseY + p.y);
      g.lineTo(offsetX + tileW, baseY);
      g.closePath();
      g.fillPath();
    }
  }

  // ── Pollution spawner (speed ramps with distance) ─────────────────

  private readonly WAVES: [number, number][][] = [
    [[PROJ_LOW,  0]],
    [[PROJ_MID,  0]],
    [[PROJ_HIGH, 0]],
    [[PROJ_LOW,  0],[PROJ_LOW,  300]],
    [[PROJ_MID,  0],[PROJ_HIGH, 300]],
    [[PROJ_LOW,  0],[PROJ_MID,  250],[PROJ_LOW, 500]],
    [[PROJ_HIGH, 0],[PROJ_LOW,  200]],
    [[PROJ_MID,  0],[PROJ_MID,  200],[PROJ_MID, 400]],
  ];

  private startPollutionSpawner() {
    const scheduleNext = () => {
      this.time.addEvent({
        delay: this.spawnDelay,
        callback: () => {
          if (!this.levelComplete) {
            const wave = this.WAVES[this.waveIndex % this.WAVES.length];
            this.waveIndex++;
            for (const [y, delay] of wave) {
              this.time.delayedCall(delay, () => {
                if (!this.levelComplete) this.fireProjectile(y);
              });
            }
          }
          scheduleNext();
        },
      });
    };
    this.time.delayedCall(2500, scheduleNext);
  }

  private fireProjectile(targetY: number) {
    const spawnX  = this.cameras.main.scrollX + 1380;
    const isLow   = targetY === PROJ_LOW;
    const isHigh  = targetY === PROJ_HIGH;
    const radius  = isLow ? 18 : isHigh ? 12 : 15;
    const color   = isLow ? 0xcc3300 : isHigh ? 0x88b840 : 0xc8a040;
    const baseSpd = isLow ? -260 : isHigh ? -320 : -290;
    const speed   = baseSpd * this.projSpeedMult;

    const key = `proj_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(35).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.62);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.6, radius * 0.5, radius * 0.25);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, targetY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(speed, 0);
    this.tweens.add({ targets: proj, angle: -360, duration: 900, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  // ── Goal ─────────────────────────────────────────────────────────

  private createGoal(x: number) {
    const goalCenterY = SIDEWALK_Y - 60;
    const glow = this.add.rectangle(x + 40, goalCenterY, 80, 120, 0x44ff88, 0.35).setDepth(3);
    this.add.rectangle(x + 40, goalCenterY, 6, 120, 0x22cc66).setDepth(3);
    this.tweens.add({ targets: glow, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
    this.add.text(x + 40, SIDEWALK_Y - 140, "META", {
      fontSize: "20px", fontFamily: "'Press Start 2P'", color: "#22cc66",
    }).setOrigin(0.5).setDepth(3);
  }

  // ── Events ────────────────────────────────────────────────────────

  private onLevelComplete() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.player.setVelocity(0, 0);
    this.sfx("sfx_goal", 0.8);
    this.cameras.main.fadeOut(800, 255, 255, 255);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("BossScene");
    });
  }

  private onHit() {
    if (this.invincible || this.dashInvincible || this.maskInvincible || this.levelComplete) return;
    this.invincible = true;
    this.health = Math.max(0, this.health - this.difficultyMultiplier);
    this.drawHealthBar();
    this.sfx("sfx_hit", 0.7);
    this.player.setTint(0xff4444);
    this.cameras.main.shake(220, 0.007);

    // Red vignette flash
    this.vignetteRect.setAlpha(0.45);
    this.tweens.add({ targets: this.vignetteRect, alpha: 0, duration: 500, ease: "Quad.Out" });

    // Smog thickens
    const smogAlpha = ((10 - this.health) / 10) * 0.38;
    this.smogOverlay.setAlpha(smogAlpha);

    if (this.health <= 0) {
      this.levelComplete = true;
      this.sfx("sfx_death", 0.8);
      this.time.delayedCall(600, () => this.sfx("sfx_gameover", 0.8));
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

  // ── HUD ───────────────────────────────────────────────────────────

  private updateDashBar(fraction: number) {
    this.dashBar.clear();
    const barX  = 20;
    const barY  = 260;
    const barW  = 36;
    const barH  = 6;

    this.dashBar.fillStyle(0x222222, 1);
    this.dashBar.fillRect(barX, barY, barW, barH);
    const color = fraction >= 1 ? 0x44ccff : 0x1166aa;
    this.dashBar.fillStyle(color, 1);
    this.dashBar.fillRect(barX, barY, Math.floor(barW * fraction), barH);
    this.dashBar.lineStyle(1, 0x446688, 1);
    this.dashBar.strokeRect(barX, barY, barW, barH);
  }

  // ── Power-up: cubrebocas ─────────────────────────────────────────

  private setupPowerups() {
    this.powerups = this.physics.add.staticGroup();

    // Spawn one mask every 1400px starting at 800px
    for (let x = 800; x < LEVEL_WIDTH - 400; x += 1400) {
      this.spawnMaskAt(x + Phaser.Math.Between(-200, 200));
    }

    this.physics.add.overlap(this.player, this.powerups, (_p, mask) => {
      (mask as Phaser.Physics.Arcade.Image).destroy();
      this.activateMask();
    });
  }

  private spawnMaskAt(x: number) {
    const y = SIDEWALK_Y - 48;
    const key = `mask_${x}`;

    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    // Mask body (white with light blue tint)
    gfx.fillStyle(0xe8f4ff, 1);
    gfx.fillRoundedRect(2, 8, 44, 28, 6);
    // Pleats
    gfx.lineStyle(1.5, 0xaaccee, 0.7);
    gfx.lineBetween(2, 16, 46, 16);
    gfx.lineBetween(2, 24, 46, 24);
    gfx.lineBetween(2, 32, 46, 32);
    // Ear loops
    gfx.lineStyle(2, 0xaaaaaa, 1);
    gfx.strokeCircle(4, 16, 6);
    gfx.strokeCircle(44, 16, 6);
    // Nose wire
    gfx.fillStyle(0x8899aa, 1);
    gfx.fillRect(10, 8, 28, 3);
    // Glow outline
    gfx.lineStyle(2, 0x44aaff, 0.8);
    gfx.strokeRoundedRect(2, 8, 44, 28, 6);
    gfx.generateTexture(key, 48, 48);
    gfx.destroy();

    const mask = this.powerups.create(x, y, key) as Phaser.Physics.Arcade.Image;
    mask.setDepth(4).refreshBody();

    // Floating bob animation
    this.tweens.add({
      targets: mask, y: y - 10,
      duration: 900, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });

    // Glow pulse
    this.tweens.add({
      targets: mask, alpha: 0.6,
      duration: 600, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });
  }

  private activateMask() {
    this.maskInvincible = true;
    this.maskEndTime    = this.time.now + 6000;
    this.sfx("sfx_powerup", 0.8);

    // Flash text
    const txt = this.add.text(this.player.x, this.player.y - 90, "¡CUBREBOCAS!", {
      fontSize: "14px", fontFamily: "'Press Start 2P'",
      color: "#44eeff", stroke: "#003355", strokeThickness: 5,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: txt, y: txt.y - 50, alpha: 0,
      duration: 1400, ease: "Quad.Out",
      onComplete: () => txt.destroy(),
    });

    // Player blink
    this.player.clearTint();
    this.player.setTint(0x44eeff);
    this.blinkTween = this.tweens.add({
      targets: this.player, alpha: 0.3,
      duration: 120, ease: "Linear",
      yoyo: true, repeat: -1,
    });

    this.drawMaskBar(1);
  }

  private deactivateMask() {
    this.maskInvincible = false;
    this.blinkTween?.stop();
    this.blinkTween = null;
    this.player.setAlpha(1);
    this.player.clearTint();
    this.maskBarGfx.clear();
    this.maskIcon.clear();
  }

  private drawMaskBar(fraction: number) {
    const bx = 20;
    const by = this.scale.height - 36;
    const bw = 120;
    const bh = 10;

    this.maskBarGfx.clear();
    this.maskBarGfx.fillStyle(0x111111, 0.8);
    this.maskBarGfx.fillRect(bx, by, bw, bh);
    this.maskBarGfx.fillStyle(0x44eeff, 1);
    this.maskBarGfx.fillRect(bx, by, bw * fraction, bh);
    this.maskBarGfx.lineStyle(1, 0x0088aa, 1);
    this.maskBarGfx.strokeRect(bx, by, bw, bh);

    this.maskIcon.clear();
    this.maskIcon.fillStyle(0x44eeff, 0.9);
    this.maskIcon.fillRoundedRect(bx, by - 18, 14, 10, 2);
    this.maskIcon.lineStyle(1, 0x0088aa, 1);
    this.maskIcon.strokeRoundedRect(bx, by - 18, 14, 10, 2);
  }

  private sfx(key: string, volume = 1) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
  }

  private drawHealthBar() {
    const segments = 10;
    const segH     = 16;
    const segGap   = 1;
    const innerW   = 22;
    const railW    = 7;
    const totalW   = innerW + railW * 2;
    const totalH   = segments * segH + (segments - 1) * segGap;
    const barX     = 20;
    const barTop   = 38;

    this.healthBar.clear();

    this.healthBar.fillStyle(0x222222, 1);
    this.healthBar.fillRect(barX, barTop - 10, totalW, 10);
    this.healthBar.fillStyle(0x666666, 1);
    this.healthBar.fillRect(barX + 2, barTop - 10, totalW - 4, 3);

    this.healthBar.fillStyle(0x110000, 1);
    this.healthBar.fillRect(barX + railW, barTop, innerW, totalH);

    for (let i = 0; i < segments; i++) {
      const segY   = barTop + totalH - (i + 1) * segH - i * segGap;
      const filled = i < this.health;
      if (filled) {
        this.healthBar.fillStyle(0xcc2200, 1);
        this.healthBar.fillRect(barX + railW, segY + segH / 2, innerW, segH / 2);
        this.healthBar.fillStyle(0xff7722, 1);
        this.healthBar.fillRect(barX + railW, segY, innerW, segH / 2);
        this.healthBar.fillStyle(0xffcc66, 0.35);
        this.healthBar.fillRect(barX + railW, segY, innerW, 2);
      } else {
        this.healthBar.fillStyle(0x1e0000, 1);
        this.healthBar.fillRect(barX + railW, segY, innerW, segH);
      }
      this.healthBar.fillStyle(0x000000, 1);
      this.healthBar.fillRect(barX + railW, segY + segH - 1, innerW, 1);
    }

    // Rails
    for (const rx of [barX, barX + railW + innerW]) {
      this.healthBar.fillStyle(0x888888, 1);
      this.healthBar.fillRect(rx, barTop, railW, totalH);
      this.healthBar.fillStyle(0xdddddd, 1);
      this.healthBar.fillRect(rx, barTop, 2, totalH);
      this.healthBar.fillStyle(0x444444, 1);
      this.healthBar.fillRect(rx + railW - 2, barTop, 2, totalH);
      for (let y = barTop + 6; y < barTop + totalH - 4; y += 24) {
        this.healthBar.fillRect(rx + 1, y, railW - 2, 4);
      }
    }

    this.healthBar.fillStyle(0x222222, 1);
    this.healthBar.fillRect(barX, barTop + totalH, totalW, 8);
    this.healthBar.fillStyle(0x555555, 1);
    this.healthBar.fillRect(barX + 2, barTop + totalH, totalW - 4, 3);

    const gemX = barX + totalW / 2;
    const gemY = barTop + totalH + 18;
    this.healthBar.fillStyle(0x111133, 1);
    this.healthBar.fillCircle(gemX, gemY, 11);
    this.healthBar.fillStyle(0x2255cc, 1);
    this.healthBar.fillCircle(gemX, gemY, 9);
    this.healthBar.fillStyle(0x88aaff, 0.7);
    this.healthBar.fillCircle(gemX - 3, gemY - 3, 4);
    this.healthBar.fillStyle(0xffffff, 0.5);
    this.healthBar.fillCircle(gemX - 3, gemY - 4, 2);

    // Label below gem
    // (static text added in create, bar handles graphics only)
  }
}
