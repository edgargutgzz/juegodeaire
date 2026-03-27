import Phaser from "phaser";

const SIDEWALK_Y  = 660;
const GROUND_Y    = SIDEWALK_Y - 70; // visual top of grass tile = 610
const LEVEL_WIDTH   = 9600;

const TRANSITION_X  = 3200; // bosque → ciudad
const INDUSTRY_X    = 6400; // ciudad → ciudad+autos+industria

const PROJ_LOW  = GROUND_Y - 28;
const PROJ_MID  = GROUND_Y - 90;
const PROJ_HIGH = GROUND_Y - 155;



export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private wasButtonDown   = false;
  private wasDpadUp       = false;

  private invincible      = false;
  private isCrouching     = false;
  private levelComplete   = false;

  private jumpsAvailable  = 1;

  private goalX           = 0;
  private health          = 10;
  private difficultyMultiplier = 1;

  private healthBar!:     Phaser.GameObjects.Graphics;
  private criticalTween:  Phaser.Tweens.Tween | null = null;
  private smogOverlay!:   Phaser.GameObjects.Rectangle;
  private vignetteRect!:  Phaser.GameObjects.Rectangle;

  private waveIndex         = 0;
  private carSpawnerStarted = false;
  private bgTile!:          Phaser.GameObjects.TileSprite;
  private industrySky!:     Phaser.GameObjects.Rectangle;
  private staticCarData:    { img: Phaser.GameObjects.Image; nextFire: number; heights: number[] }[] = [];

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

    this.load.image("bg_talltrees",   "/assets/bg/bg_talltrees.png");
    this.load.image("bld_beige_front", "/assets/buildings/house_beige_front.png");
    this.load.image("bld_beige_side",  "/assets/buildings/house_beige_side.png");
    this.load.image("bld_grey_front",  "/assets/buildings/house_grey_front.png");
    this.load.image("bld_grey_side",   "/assets/buildings/house_grey_side.png");
    this.load.image("ground_top",     "/assets/ground/ground_top.png");
    this.load.image("ground_fill",    "/assets/ground/ground_fill.png");
    this.load.image("asphalt_top",    "/assets/ground/asphalt_top.png");
    this.load.image("asphalt_fill",   "/assets/ground/asphalt_fill.png");
    this.load.image("ptcl_spark1", "/assets/particles/spark_01.png");
    this.load.image("ptcl_spark2", "/assets/particles/spark_02.png");
    this.load.image("ptcl_spark3", "/assets/particles/spark_03.png");
    for (let i = 0; i <= 8; i++)
      this.load.image(`expl_${i}`, `/assets/particles/explosion/explosion0${i}.png`);

    for (const v of ["sedan","sedan_blue","bus","truck","van","suv","truck_trailer","truckdark"])
      this.load.image(`veh_${v}`, `/assets/vehicles/${v}.png`);
    // this.load.audio("sfx_jump",       "/assets/sfx/SoundJump1.wav");
    // this.load.audio("sfx_hit",        "/assets/sfx/SoundPlayerHit.wav");
    // this.load.audio("sfx_explode",    "/assets/sfx/SoundExplosionSmall.wav");
    // this.load.audio("sfx_goal",       "/assets/sfx/SoundReachGoal.wav");
    // this.load.audio("sfx_gameover",   "/assets/sfx/SoundGameOver.wav");
    // this.load.audio("sfx_death",      "/assets/sfx/SoundDeath.wav");
  }

  create() {
    this.levelComplete        = false;
    this.invincible           = false;
    this.isCrouching          = false;
    this.health               = 10;
    this.jumpsAvailable       = 1;
    this.waveIndex            = 0;

    this.sound.stopAll();
    this.sound.play("mercury", { loop: true, volume: 0.6 });

    this.difficultyMultiplier = this.registry.get("difficultyMultiplier") ?? 1;
    this.carSpawnerStarted    = false;
    this.staticCarData        = [];

    this.physics.world.setBounds(0, -800, LEVEL_WIDTH, 1520);

    this.buildWorld();
    this.projectiles = this.physics.add.group();
    this.goalX = LEVEL_WIDTH - 160;
    this.createGoal(this.goalX);

    // ── Player ────────────────────────────────────────────────────
    this.player = this.physics.add.sprite(120, GROUND_Y - 300, "char_idle");
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.85);
    this.player.setDepth(5);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(64, 88, false);
    body.setOffset(16, 40);

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
      const damage = p.getData("damage") as number ?? 1;
      p.destroy();
      this.onHit(damage);
    });


    // ── Camera ────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, -800, LEVEL_WIDTH, 1520);
    this.cameras.main.startFollow(this.player, true, 0.15, 0);
    this.cameras.main.scrollY = 0;
    this.cameras.main.fadeIn(500, 212, 234, 247);

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
    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.drawHealthBar();



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
    this.input.gamepad!.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => {
      this.pad = pad;
    });
    if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);
  }

  update() {
    if (this.levelComplete) return;
    this.bgTile.tilePositionX = this.cameras.main.scrollX * 0.2;
    const treeAlpha = 1 - Phaser.Math.Clamp((this.player.x - TRANSITION_X - 100) / 600, 0, 1);
    this.bgTile.setAlpha(treeAlpha);

    // Sky se oscurece/anaranja al entrar a zona 3
    const industryAlpha = Phaser.Math.Clamp((this.player.x - INDUSTRY_X) / 1200, 0, 0.55);
    this.industrySky.setAlpha(industryAlpha);

    // Trigger car spawner when entering industry zone
    if (!this.carSpawnerStarted && this.player.x >= INDUSTRY_X) {
      this.carSpawnerStarted = true;
      this.startCarSpawner();
    }

    const onGround   = this.player.body!.blocked.down;
    if (onGround) {
      this.jumpsAvailable = 1;
    }

    const leftStickX = this.pad?.leftStick.x ?? 0;
    const leftStickY = this.pad?.leftStick.y ?? 0;
    const buttonA    = this.pad?.isButtonDown(0) ?? false;
    const dpadUp     = (this.pad?.up ?? false) || leftStickY < -0.1;
    const buttonAJust = buttonA && !this.wasButtonDown;
    const dpadUpJust  = dpadUp && !this.wasDpadUp;
    this.wasButtonDown = buttonA;
    this.wasDpadUp     = dpadUp;
    const dpadLeft   = this.pad?.left  ?? false;
    const dpadRight  = this.pad?.right ?? false;

    const goLeft  = this.cursors.left.isDown  || leftStickX < -0.1 || dpadLeft;
    const goRight = this.cursors.right.isDown || leftStickX >  0.1 || dpadRight;
    const crouch  = this.cursors.down.isDown  || (this.pad?.down ?? false) || leftStickY > 0.1;
    const jump    = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space!) || buttonAJust || dpadUpJust;

    // ── Crouch ────────────────────────────────────────────────────
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (crouch && onGround && !this.isCrouching) {
      this.isCrouching = true;
      body.setSize(64, 44, false);
      body.setOffset(16, 84);
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (!crouch && this.isCrouching) {
      this.isCrouching = false;
      body.setSize(64, 88, false);
      body.setOffset(16, 40);
    }

    // ── Movement ──────────────────────────────────────────────────
    const MAX_SPEED = 220;
    const ACCEL     = 900;
    const DRAG      = 1200;
    if (goLeft) {
      this.player.setAccelerationX(-ACCEL);
      body.setDragX(0);
      this.player.setFlipX(true);
    } else if (goRight) {
      this.player.setAccelerationX(ACCEL);
      body.setDragX(0);
      this.player.setFlipX(false);
    } else {
      this.player.setAccelerationX(0);
      body.setDragX(DRAG);
    }
    const vx = this.player.body!.velocity.x;
    if (Math.abs(vx) > MAX_SPEED) this.player.setVelocityX(Math.sign(vx) * MAX_SPEED);

    if (jump && this.jumpsAvailable > 0 && !this.isCrouching) {
      this.player.setVelocityY(-520);
      this.sfx("sfx_jump", 0.6);
      this.jumpsAvailable--;
    }

    if (this.player.x >= this.goalX) this.onLevelComplete();

    // ── Destroy off-screen projectiles ────────────────────────────
    for (const proj of this.projectiles.getChildren()) {
      const p = proj as Phaser.Physics.Arcade.Image;
      if (p.x < -100 || p.x > LEVEL_WIDTH + 100 || p.y < -800) p.destroy();
    }

    // ── Static car turrets ────────────────────────────────────────
    const now = this.time.now;
    for (const car of this.staticCarData) {
      if (!car.img.active) continue;
      const dist = this.player.x - car.img.x; // negative = player is left of car
      if (dist > -950 && dist < 150 && now >= car.nextFire) {
        car.nextFire = now + 2200 + Math.random() * 2000;
        this.fireCarTurret(car.img.x, car.heights);
        this.spawnCarExhaust(car.img.x + 30, car.img.y - 10);
      }
    }


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


  // ── Particles ────────────────────────────────────────────────────




  // ── Spawn rate ramps up with distance ────────────────────────────

  private get progressFactor() {
    return Math.min(this.player.x / LEVEL_WIDTH, 1);
  }

  private get spawnDelay() {
    return Phaser.Math.Linear(2200, 600, this.progressFactor);
  }

  private get projSpeedMult() {
    return Phaser.Math.Linear(1.0, 2.2, this.progressFactor);
  }

  // ── World ─────────────────────────────────────────────────────────

  private buildWorld() {
    this.drawCityBackground();

    // ── Ground visuals ────────────────────────────────────────────
    const grassW   = TRANSITION_X;
    const asphaltW = LEVEL_WIDTH - TRANSITION_X;

    // Solid base fills
    this.add.rectangle(TRANSITION_X / 2, SIDEWALK_Y + 100, grassW, 200, 0xc8904c).setDepth(0);
    this.add.rectangle(TRANSITION_X + asphaltW / 2, SIDEWALK_Y + 100, asphaltW, 200, 0x8a9fa0).setDepth(0);

    // Ground fills
    this.add.tileSprite(0, SIDEWALK_Y - 2, grassW, 202, "ground_fill").setOrigin(0, 0).setDepth(1);
    this.add.tileSprite(TRANSITION_X, SIDEWALK_Y - 2, asphaltW, 202, "asphalt_fill").setOrigin(0, 0).setDepth(1);

    // Ground tops
    this.add.tileSprite(0, SIDEWALK_Y, grassW, 70, "ground_top").setOrigin(0, 1).setDepth(2);
    this.add.tileSprite(TRANSITION_X, SIDEWALK_Y, asphaltW, 70, "asphalt_top").setOrigin(0, 1).setDepth(2);

    // Road markings in industry zone
    const dashG = this.add.graphics().setDepth(2);
    dashG.fillStyle(0xddbb00, 0.5);
    for (let x = INDUSTRY_X; x < LEVEL_WIDTH; x += 80) {
      dashG.fillRect(x, SIDEWALK_Y + 28, 50, 5);
    }

    // ── City buildings ────────────────────────────────────────────
    this.buildCityscape(TRANSITION_X, GROUND_Y);

    // ── Zona 3: industria ─────────────────────────────────────────
    this.buildCityscape(INDUSTRY_X, GROUND_Y);
    this.buildIndustrialBackground();

    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 64, 16);
    this.textures.addCanvas("sidewalk", canvas);
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < LEVEL_WIDTH; x += 64) {
      this.platforms.create(x + 32, GROUND_Y + 8, "sidewalk").setAlpha(0);
    }

    this.placeStaticCars();
  }


  private buildCityscape(startX: number, groundY: number) {
    const layout: [string, number, number][] = [
      ["bld_grey_side",   startX + 80,   1.6],
      ["bld_beige_front", startX + 340,  1.5],
      ["bld_grey_front",  startX + 560,  1.6],
      ["bld_beige_side",  startX + 800,  1.5],
      ["bld_grey_side",   startX + 1060, 1.6],
      ["bld_beige_front", startX + 1320, 1.5],
      ["bld_grey_front",  startX + 1540, 1.7],
      ["bld_beige_side",  startX + 1800, 1.5],
      ["bld_grey_side",   startX + 2060, 1.6],
      ["bld_beige_front", startX + 2320, 1.5],
      ["bld_grey_front",  startX + 2540, 1.6],
      ["bld_beige_side",  startX + 2780, 1.5],
    ];

    for (const [key, x, scale] of layout) {
      this.add.image(x, groundY, key)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setDepth(1);
    }
  }

  private drawCityBackground() {
    const W = this.scale.width;
    const H = this.scale.height;
    // Below grass: top half green, bottom half brown
    const belowH = H - GROUND_Y;
    const greenH = belowH * 0.1;
    const brownH = belowH * 0.9;
    this.add.rectangle(W / 2, GROUND_Y + greenH / 2, W, greenH, 0x80be1f)
      .setScrollFactor(0).setDepth(-3);
    this.add.rectangle(W / 2, GROUND_Y + greenH + brownH / 2, W, brownH, 0xc8904c)
      .setScrollFactor(0).setDepth(-3);
    // Sky bg image
    this.bgTile = this.add.tileSprite(0, -100, W, H, "bg_talltrees")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-2);

    // Industry sky overlay — naranja sucio, se funde al entrar a zona 3
    this.industrySky = this.add.rectangle(W / 2, H / 2, W, H, 0xc47a2a)
      .setScrollFactor(0).setDepth(-1).setAlpha(0);
  }

  // ── Pollution spawner (speed ramps with distance) ─────────────────

  // [y, delay, isPM25?]
  private readonly WAVES: [number, number, boolean?][][] = [
    [[PROJ_LOW,  0]],
    [[PROJ_MID,  0]],
    [[PROJ_HIGH, 0]],
    [[PROJ_LOW,  0, true]],                                    // PM2.5 solo
    [[PROJ_LOW,  0],[PROJ_LOW,  300]],
    [[PROJ_MID,  0],[PROJ_HIGH, 300]],
    [[PROJ_LOW,  0, true],[PROJ_MID, 250]],                   // PM2.5 + PM10
    [[PROJ_HIGH, 0],[PROJ_LOW,  200, true]],                  // mix
    [[PROJ_MID,  0],[PROJ_MID,  200],[PROJ_MID, 400]],
    [[PROJ_LOW,  0, true],[PROJ_MID, 200, true],[PROJ_HIGH, 400]], // PM2.5 barrage
  ];

  private startPollutionSpawner() {
    const scheduleNext = () => {
      this.time.addEvent({
        delay: this.spawnDelay,
        callback: () => {
          if (!this.levelComplete) {
            const wave = this.WAVES[this.waveIndex % this.WAVES.length];
            this.waveIndex++;
            for (const [y, delay, isPM25] of wave) {
              this.time.delayedCall(delay, () => {
                if (!this.levelComplete) {
                  // 30% chance: spawn as cloud cluster instead of single particle
                  if (Math.random() < 0.3) {
                    this.fireCloud(y, !!isPM25);
                  } else {
                    this.fireProjectile(y, !!isPM25);
                  }
                }
              });
            }
          }
          scheduleNext();
        },
      });
    };
    this.time.delayedCall(2500, scheduleNext);
    // Separate spawner: particles falling diagonally from above
    this.startFallingSpawner();
  }

  private startFallingSpawner() {
    const scheduleNext = () => {
      const delay = 3000 + Math.random() * 2000;
      this.time.addEvent({
        delay,
        callback: () => {
          if (!this.levelComplete) this.fireFallingCloud();
          scheduleNext();
        },
      });
    };
    this.time.delayedCall(4000, scheduleNext);
  }

  private fireCloud(targetY: number, isPM25: boolean) {
    const count = 3 + Math.floor(Math.random() * 3); // 3–5 particles
    for (let i = 0; i < count; i++) {
      const offsetX = i * 40 + (Math.random() * 20 - 10);
      const offsetY = Math.random() * 50 - 25;
      this.time.delayedCall(i * 80, () => {
        if (!this.levelComplete) this.fireProjectile(targetY + offsetY, isPM25, offsetX);
      });
    }
  }

  private fireFallingCloud() {
    const spawnX   = this.cameras.main.scrollX + 1200 + Math.random() * 300;
    const count    = 4 + Math.floor(Math.random() * 4); // 4–7 particles
    for (let i = 0; i < count; i++) {
      const offsetX = Math.random() * 80 - 40;
      const offsetY = Math.random() * 60 - 30;
      this.time.delayedCall(i * 120, () => {
        if (!this.levelComplete) this.fireDiagonal(spawnX + offsetX, -60 + offsetY);
      });
    }
  }

  private fireDiagonal(spawnX: number, spawnY: number) {
    const isPM25  = Math.random() < 0.6;
    const radius  = isPM25 ? 6 : 14;
    const color   = isPM25 ? 0x999999 : 0xbbbbbb;
    const damage  = isPM25 ? 3 : 1;
    const vx      = -(80 + Math.random() * 60) * this.projSpeedMult;
    const vy      = 60 + Math.random() * 50;

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

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(vx, vy);

    const floatAmp = isPM25 ? 25 : 15;
    const floatDur = 1600 + Math.random() * 600;
    this.tweens.add({
      targets: proj, y: `+=${floatAmp}`,
      duration: floatDur, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });
    this.tweens.add({ targets: proj, angle: -360, duration: 1800, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  private fireProjectile(targetY: number, isPM25 = false, extraOffsetX = 0) {
    const spawnX  = this.cameras.main.scrollX + 1380 + extraOffsetX;
    const radius  = isPM25 ? 7 : 18;
    const color   = isPM25 ? 0x999999 : 0xbbbbbb;
    const damage  = isPM25 ? 3 : 1;
    const speedVariation = 0.8 + Math.random() * 0.4; // ±20%
    const baseSpd = isPM25 ? -180 : -150;
    const speed   = baseSpd * this.projSpeedMult * speedVariation;

    // Spawn con ligero offset vertical aleatorio
    const spawnY  = targetY + (Math.random() * 40 - 20);

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

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(speed, 0);

    // Oscilación vertical sinusoidal — flota en el aire
    const floatAmp      = isPM25 ? 35 : 22;
    const floatDuration = isPM25 ? (1800 + Math.random() * 600) : (2400 + Math.random() * 800);
    this.tweens.add({
      targets: proj, y: spawnY + floatAmp,
      duration: floatDuration, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });

    this.tweens.add({ targets: proj, angle: -360, duration: isPM25 ? 1200 : 2000, repeat: -1 });
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
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("BossScene"));
  }

  private onHit(damage = 1) {
    if (this.invincible || this.levelComplete) return;
    this.invincible = true;
    this.health = Math.max(0, this.health - damage * this.difficultyMultiplier);
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



  private sfx(_key: string, _volume = 1) {
    // if (this.cache.audio.exists(_key)) this.sound.play(_key, { volume: _volume });
  }

  private drawHealthBar() {
    this.healthBar.clear();

    // ── Pixel heart ───────────────────────────────────────────────
    const px = 5; // pixel size
    const hx = 16;
    const hy = 28;
    const heart = [
      [0,1,1,0,1,1,0],
      [1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1],
      [0,1,1,1,1,1,0],
      [0,0,1,1,1,0,0],
      [0,0,0,1,0,0,0],
    ];

    // Drop shadow
    this.healthBar.fillStyle(0x550000, 1);
    for (let r = 0; r < heart.length; r++)
      for (let c = 0; c < heart[r].length; c++)
        if (heart[r][c])
          this.healthBar.fillRect(hx + c * px + 2, hy + r * px + 2, px, px);

    // Main red
    this.healthBar.fillStyle(0xcc1111, 1);
    for (let r = 0; r < heart.length; r++)
      for (let c = 0; c < heart[r].length; c++)
        if (heart[r][c])
          this.healthBar.fillRect(hx + c * px, hy + r * px, px, px);

    // Highlight pixels (top-left of each lobe)
    this.healthBar.fillStyle(0xff6666, 1);
    this.healthBar.fillRect(hx + 1 * px, hy + 0 * px, px, px);
    this.healthBar.fillRect(hx + 4 * px, hy + 0 * px, px, px);
    this.healthBar.fillStyle(0xffffff, 0.7);
    this.healthBar.fillRect(hx + 1 * px, hy + 0 * px, 3, 3);
    this.healthBar.fillRect(hx + 4 * px, hy + 0 * px, 3, 3);

    // ── Segmented bar ─────────────────────────────────────────────
    const segments  = 10;
    const heartW    = 7 * px;
    const barX      = hx + heartW + 18;
    const barH      = 22;
    const barW      = 230;
    const barY      = hy + (heart.length * px - barH) / 2;
    const border    = 3;
    const corner    = 5;          // outer corner cut (pixelated rounding)
    const ic        = corner - border; // inner corner cut = 2
    const segW      = barW / segments;

    // Segment colors based on health
    let hi: number, lo: number;
    if (this.health >= 7)      { hi = 0x44cc55; lo = 0x228833; }
    else if (this.health >= 4) { hi = 0xffbb00; lo = 0xcc7700; }
    else                       { hi = 0xee3311; lo = 0xaa1100; }

    // Outer border — pixelated rounded hollow outline
    const bx   = barX - border, by = barY - border, bw = barW + border * 2, bh = barH + border * 2;
    const step = corner - border; // = 2 (diagonal corner step)

    this.healthBar.fillStyle(0x000000, 1);
    this.healthBar.fillRect(bx + corner,          by,                    bw - corner * 2, border); // top
    this.healthBar.fillRect(bx + corner,          by + bh - border,      bw - corner * 2, border); // bottom
    this.healthBar.fillRect(bx,                   by + corner,           border, bh - corner * 2); // left
    this.healthBar.fillRect(bx + bw - border,     by + corner,           border, bh - corner * 2); // right
    // Corner step pieces
    this.healthBar.fillRect(bx + border,               by + border,               step, step); // top-left
    this.healthBar.fillRect(bx + bw - border - step,   by + border,               step, step); // top-right
    this.healthBar.fillRect(bx + border,               by + bh - border - step,   step, step); // bottom-left
    this.healthBar.fillRect(bx + bw - border - step,   by + bh - border - step,   step, step); // bottom-right

    // Filled segments — clip corners on first and last segment
    for (let i = 0; i < this.health; i++) {
      const sx    = barX + i * segW;
      const clipL = i === 0            ? ic : 0;
      const clipR = i === segments - 1 ? ic : 0;
      const adjW  = segW - clipL - clipR;

      // Top half (lighter) — corner strip + middle
      this.healthBar.fillStyle(hi, 1);
      this.healthBar.fillRect(sx + clipL, barY,        adjW, ic);            // corner strip
      this.healthBar.fillRect(sx,         barY + ic,   segW, barH / 2 - ic); // middle

      // Bottom half (darker) — middle + corner strip
      this.healthBar.fillStyle(lo, 1);
      this.healthBar.fillRect(sx,         barY + barH / 2,        segW, barH / 2 - ic); // middle
      this.healthBar.fillRect(sx + clipL, barY + barH - ic,       adjW, ic);            // corner strip
    }

    // Segment dividers
    this.healthBar.fillStyle(0x000000, 1);
    for (let i = 1; i < segments; i++) {
      this.healthBar.fillRect(barX + i * segW - 1, barY, 2, barH);
    }

    // ── Blink on critical ─────────────────────────────────────────
    if (this.health <= 2 && !this.criticalTween) {
      this.criticalTween = this.tweens.add({
        targets: this.healthBar, alpha: 0.25,
        duration: 300, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
      });
    } else if (this.health > 2 && this.criticalTween) {
      this.criticalTween.stop();
      this.criticalTween = null;
      this.healthBar.setAlpha(1);
    }
  }

  // ── Zona 3: industria ─────────────────────────────────────────────

  private buildIndustrialBackground() {
    const g = this.add.graphics().setDepth(0);
    const stacks: [number, number, number][] = [ // [x, height, width]
      [INDUSTRY_X + 200,  220, 40], [INDUSTRY_X + 240,  180, 28],
      [INDUSTRY_X + 700,  260, 50], [INDUSTRY_X + 750,  200, 35],
      [INDUSTRY_X + 1200, 280, 55], [INDUSTRY_X + 1260, 210, 38],
      [INDUSTRY_X + 1700, 250, 48], [INDUSTRY_X + 1760, 200, 32],
      [INDUSTRY_X + 2200, 270, 52], [INDUSTRY_X + 2260, 220, 36],
      [INDUSTRY_X + 2700, 260, 46], [INDUSTRY_X + 2750, 195, 30],
    ];

    for (const [x, h, w] of stacks) {
      // Stack body
      g.fillStyle(0x555566, 1);
      g.fillRect(x, GROUND_Y - h, w, h);
      // Darker stripe
      g.fillStyle(0x444455, 1);
      g.fillRect(x + w * 0.6, GROUND_Y - h, w * 0.4, h);
      // Top rim
      g.fillStyle(0x777788, 1);
      g.fillRect(x - 4, GROUND_Y - h - 10, w + 8, 12);
    }
  }

  private startCarSpawner() {
    const CAR_KEYS = [
      { key: "veh_sedan",         scale: 3.5, speed: 280 },
      { key: "veh_sedan_blue",    scale: 3.5, speed: 260 },
      { key: "veh_suv",           scale: 3.5, speed: 240 },
      { key: "veh_van",           scale: 3.5, speed: 220 },
      { key: "veh_truck",         scale: 4,   speed: 180 },
      { key: "veh_truck_trailer", scale: 4,   speed: 160 },
      { key: "veh_bus",           scale: 4,   speed: 170 },
      { key: "veh_truckdark",     scale: 4,   speed: 190 },
    ];

    const spawnCar = () => {
      if (this.levelComplete) return;
      const def = CAR_KEYS[Math.floor(Math.random() * CAR_KEYS.length)];
      // Spawn slightly off right edge of camera
      const spawnX = this.cameras.main.scrollX + this.scale.width + 100;
      // Two road lanes
      const lane = Math.random() < 0.5 ? SIDEWALK_Y - 38 : SIDEWALK_Y - 20;
      const car = this.add.image(spawnX, lane, def.key)
        .setScale(def.scale)
        .setDepth(3)
        .setFlipX(true); // facing left

      // Drive left
      this.tweens.add({
        targets: car,
        x: -200,
        duration: ((spawnX + 200) / def.speed) * 1000,
        ease: "Linear",
        onComplete: () => car.destroy(),
      });

      // Exhaust puff every ~1.5s while car is alive
      const exhaustTimer = this.time.addEvent({
        delay: 1200 + Math.random() * 600,
        loop: true,
        callback: () => {
          if (!car.active || this.levelComplete) { exhaustTimer.remove(); return; }
          this.spawnCarExhaust(car.x + (def.key.includes("truck") ? 60 : 30), car.y - 5);
        },
      });

      // Next car
      const nextDelay = 1800 + Math.random() * 2500;
      this.time.delayedCall(nextDelay, spawnCar);
    };

    // Start with a small delay and spawn 2-3 cars right away staggered
    this.time.delayedCall(800,  spawnCar);
    this.time.delayedCall(2200, spawnCar);
    this.time.delayedCall(3800, spawnCar);
  }

  private placeStaticCars() {
    const carDefs = [
      { key: "veh_sedan",      scale: 3.2, yOff: 30 },
      { key: "veh_sedan_blue", scale: 3.2, yOff: 30 },
      { key: "veh_suv",        scale: 3.2, yOff: 32 },
      { key: "veh_van",        scale: 3.5, yOff: 35 },
      { key: "veh_bus",        scale: 3.8, yOff: 38 },
      { key: "veh_truck",      scale: 3.8, yOff: 38 },
      { key: "veh_truckdark",  scale: 3.8, yOff: 38 },
    ];

    const heightSets = [
      [PROJ_LOW],
      [PROJ_MID],
      [PROJ_LOW, PROJ_MID],
      [PROJ_HIGH, PROJ_LOW],
      [PROJ_MID, PROJ_HIGH],
    ];

    const positions = [
      TRANSITION_X + 300,
      TRANSITION_X + 900,
      TRANSITION_X + 1500,
      TRANSITION_X + 2200,
      TRANSITION_X + 2900,
      INDUSTRY_X + 400,
      INDUSTRY_X + 1000,
      INDUSTRY_X + 1600,
      INDUSTRY_X + 2200,
      INDUSTRY_X + 2800,
    ];

    for (const x of positions) {
      const def = carDefs[Math.floor(Math.random() * carDefs.length)];
      const img = this.add.image(x, SIDEWALK_Y - def.yOff, def.key)
        .setScale(def.scale)
        .setDepth(3)
        .setFlipX(true);
      const heights = heightSets[Math.floor(Math.random() * heightSets.length)];
      this.staticCarData.push({
        img,
        nextFire: this.time.now + 1500 + Math.random() * 3000,
        heights,
      });
    }
  }

  private fireCarTurret(carX: number, heights: number[]) {
    for (let i = 0; i < heights.length; i++) {
      this.time.delayedCall(i * 220, () => {
        if (this.levelComplete) return;
        this.fireCarProjectile(carX - 20, heights[i]);
      });
    }
  }

  private fireCarProjectile(spawnX: number, targetY: number) {
    const isPM25  = Math.random() < 0.4;
    const radius  = isPM25 ? 7 : 15;
    const color   = isPM25 ? 0x999999 : 0xbbbbbb;
    const damage  = isPM25 ? 3 : 1;
    const speed   = -(130 + Math.random() * 60) * this.projSpeedMult;
    const spawnY  = targetY + (Math.random() * 30 - 15);

    const key = `cproj_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(35).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.62);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.6, radius * 0.5, radius * 0.25);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(speed, 0);

    const floatAmp = isPM25 ? 35 : 22;
    const floatDur = 1800 + Math.random() * 600;
    this.tweens.add({
      targets: proj, y: spawnY + floatAmp,
      duration: floatDur, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });
    this.tweens.add({ targets: proj, angle: -360, duration: isPM25 ? 1200 : 2000, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  private spawnCarExhaust(x: number, y: number) {
    const isPM25 = Math.random() < 0.5;
    const radius = isPM25 ? 5 : 12;
    const color  = 0x888888;
    const damage = isPM25 ? 3 : 1;

    const key = `exhaust_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(0x555555, 0.8);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 0.6);
    gfx.fillCircle(radius, radius, radius * 0.7);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(x, y, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4).setAlpha(0.85);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    // Drift left and upward (exhaust from moving car)
    proj.setVelocity(-(60 + Math.random() * 40), -(30 + Math.random() * 30));
    this.tweens.add({ targets: proj, alpha: 0, duration: 3000, ease: "Quad.Out", onComplete: () => proj.destroy() });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }
}
